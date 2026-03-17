use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};
use axum::extract::ws::{Message, WebSocket};
use bytes::{BufMut, Bytes, BytesMut};
use futures::{SinkExt, StreamExt};
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{broadcast, mpsc};
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};
use yrs::updates::encoder::Encode;
use yrs::updates::decoder::Decode;
use crate::routes::auth::AuthUser;
use crate::state::AppState;

pub struct YjsRoom {
    doc:     Doc,
    bcast:   broadcast::Sender<Bytes>,
    save_tx: mpsc::UnboundedSender<()>,
}

pub type Rooms = Arc<Mutex<HashMap<String, Arc<YjsRoom>>>>;

pub fn new_rooms() -> Rooms {
    Arc::new(Mutex::new(HashMap::new()))
}

// lib0 varint encoding used by the y-websocket protocol
fn write_var(buf: &mut BytesMut, mut n: u64) {
    loop {
        let b = (n & 0x7f) as u8;
        n >>= 7;
        if n == 0 { buf.put_u8(b); break; }
        buf.put_u8(b | 0x80);
    }
}

fn read_var(data: &[u8], pos: &mut usize) -> Option<u64> {
    let mut result = 0u64;
    let mut shift = 0u32;
    loop {
        if *pos >= data.len() { return None; }
        let b = data[*pos]; *pos += 1;
        result |= ((b & 0x7f) as u64) << shift;
        if b & 0x80 == 0 { return Some(result); }
        shift += 7;
        if shift >= 64 { return None; }
    }
}

fn read_var_buf<'a>(data: &'a [u8], pos: &mut usize) -> Option<&'a [u8]> {
    let len = read_var(data, pos)? as usize;
    if *pos + len > data.len() { return None; }
    let s = &data[*pos..*pos + len];
    *pos += len;
    Some(s)
}

// [msg=0 sync] [sub=0 step1] [sv...]
fn msg_step1(sv: &[u8]) -> Bytes {
    let mut b = BytesMut::new();
    write_var(&mut b, 0); write_var(&mut b, 0);
    write_var(&mut b, sv.len() as u64); b.put_slice(sv);
    b.freeze()
}

// [msg=0 sync] [sub=1 step2] [update...]
fn msg_step2(update: &[u8]) -> Bytes {
    let mut b = BytesMut::new();
    write_var(&mut b, 0); write_var(&mut b, 1);
    write_var(&mut b, update.len() as u64); b.put_slice(update);
    b.freeze()
}

// [msg=0 sync] [sub=2 update] [update...]
fn msg_update(update: &[u8]) -> Bytes {
    let mut b = BytesMut::new();
    write_var(&mut b, 0); write_var(&mut b, 2);
    write_var(&mut b, update.len() as u64); b.put_slice(update);
    b.freeze()
}

async fn get_or_create_room(note_id: &str, rooms: &Rooms, db: &PgPool) -> Arc<YjsRoom> {
    {
        let g = rooms.lock().unwrap();
        if let Some(r) = g.get(note_id) {
            return Arc::clone(r);
        }
    }

    let doc = Doc::new();
    let row = sqlx::query_as::<_, (Option<Vec<u8>>,)>(
        "SELECT yjs_state FROM notes WHERE id = $1",
    )
    .bind(note_id)
    .fetch_optional(db)
    .await
    .unwrap_or(None);

    if let Some((Some(bytes),)) = row {
        if let Ok(update) = Update::decode_v1(&bytes) {
            let mut txn = doc.transact_mut();
            let _ = txn.apply_update(update);
        }
    }

    let (bcast_tx, _) = broadcast::channel::<Bytes>(128);
    let (save_tx, save_rx) = mpsc::unbounded_channel::<()>();

    let room = Arc::new(YjsRoom { doc: doc.clone(), bcast: bcast_tx, save_tx });

    // recheck after acquiring lock - another task may have inserted while we were loading
    let mut g = rooms.lock().unwrap();
    if let Some(existing) = g.get(note_id) {
        return Arc::clone(existing);
    }
    tokio::spawn(save_loop(note_id.to_string(), doc, save_rx, db.clone()));
    g.insert(note_id.to_string(), Arc::clone(&room));
    room
}

async fn save_loop(
    note_id: String,
    doc: Doc,
    mut rx: mpsc::UnboundedReceiver<()>,
    db: PgPool,
) {
    const DEBOUNCE: Duration = Duration::from_millis(1500);
    loop {
        if rx.recv().await.is_none() { break; }
        // drain further pings for DEBOUNCE ms before writing
        loop {
            match tokio::time::timeout(DEBOUNCE, rx.recv()).await {
                Ok(Some(())) => {}
                Ok(None)    => return,
                Err(_)      => break,
            }
        }
        let state = {
            let txn = doc.transact();
            txn.encode_state_as_update_v1(&StateVector::default())
        };
        let now = now_ms();
        match sqlx::query(
            "UPDATE notes SET yjs_state = $1, updated_at = $2 WHERE id = $3",
        )
        .bind(&state[..])
        .bind(now)
        .bind(&note_id)
        .execute(&db)
        .await
        {
            Ok(_)  => tracing::debug!("[yjs] saved {note_id} ({} bytes)", state.len()),
            Err(e) => tracing::error!("[yjs] save failed for {note_id}: {e}"),
        }
    }
}

pub async fn ws_handler(
    auth: AuthUser,
    ws: WebSocketUpgrade,
    Path(note_id): Path<String>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, crate::error::AppError> {
    // Notes have no event_id - look up membership through the challenge that owns this note
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
            SELECT 1 FROM challenges c
            JOIN event_members em ON em.event_id = c.event_id AND em.user_id = $2
            WHERE c.note_id = $1
        )"
    )
    .bind(&note_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    if !is_member {
        return Err(crate::error::AppError::Forbidden);
    }

    Ok(ws.on_upgrade(move |socket| handle_ws(socket, note_id, state)))
}

async fn handle_ws(socket: WebSocket, note_id: String, state: AppState) {
    let room = get_or_create_room(&note_id, &state.rooms, &state.db).await;
    let mut bcast_rx = room.bcast.subscribe();
    let (mut sink, mut stream) = socket.split();

    let (out_tx, mut out_rx) = mpsc::channel::<Bytes>(64);

    // kick off sync by sending our state vector first
    {
        let sv_bytes = {
            let txn = room.doc.transact();
            txn.state_vector().encode_v1()
        };
        let _ = out_tx.send(msg_step1(&sv_bytes)).await;
    }

    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                msg = out_rx.recv() => match msg {
                    Some(d) => { sink.send(Message::Binary(d)).await.ok(); }
                    None    => break,
                },
                msg = bcast_rx.recv() => match msg {
                    Ok(d)  => { sink.send(Message::Binary(d)).await.ok(); }
                    Err(_) => break,
                },
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Binary(data) => handle_msg(data.as_ref(), &room, &out_tx).await,
            Message::Close(_)     => break,
            _                     => {}
        }
    }

    drop(out_tx);
    let _ = writer.await;
}

async fn handle_msg(data: &[u8], room: &YjsRoom, out_tx: &mpsc::Sender<Bytes>) {
    if data.is_empty() { return; }
    let mut pos = 0;
    let msg_type = match read_var(data, &mut pos) { Some(t) => t, None => return };

    match msg_type {
        0 => {
            // sync message
            let sub = match read_var(data, &mut pos) { Some(s) => s, None => return };
            match sub {
                0 => {
                    // step1: got client sv, send back our diff
                    let sv_raw = match read_var_buf(data, &mut pos) { Some(b) => b, None => return };
                    let client_sv = match StateVector::decode_v1(sv_raw) {
                        Ok(sv) => sv,
                        Err(_) => return,
                    };
                    let diff = {
                        let txn = room.doc.transact();
                        txn.encode_state_as_update_v1(&client_sv)
                    };
                    let _ = out_tx.send(msg_step2(&diff)).await;
                }
                1 | 2 => {
                    // step2 or update: apply and broadcast
                    let upd_raw = match read_var_buf(data, &mut pos) { Some(b) => b, None => return };
                    if let Ok(update) = Update::decode_v1(upd_raw) {
                        {
                            let mut txn = room.doc.transact_mut();
                            let _ = txn.apply_update(update);
                        }
                        let _ = room.bcast.send(msg_update(upd_raw));
                        let _ = room.save_tx.send(());
                    }
                }
                _ => {}
            }
        }
        1 | 3 => {
            // awareness / query-awareness: just forward it
            let _ = room.bcast.send(Bytes::copy_from_slice(data));
        }
        _ => {}
    }
}

pub fn start_compaction(db: PgPool) {
    tokio::spawn(async move {
        const IDLE_MS: i64 = 24 * 60 * 60 * 1000;
        loop {
            tokio::time::sleep(Duration::from_secs(3600)).await;
            compact_idle(&db, IDLE_MS).await;
        }
    });
}

async fn compact_idle(db: &PgPool, idle_ms: i64) {
    let cutoff = now_ms() - idle_ms;
    let rows = sqlx::query_as::<_, (String, Vec<u8>)>(
        "SELECT id, yjs_state FROM notes \
         WHERE yjs_state IS NOT NULL AND updated_at < $1",
    )
    .bind(cutoff)
    .fetch_all(db)
    .await;

    let rows = match rows {
        Ok(r) => r,
        Err(e) => { tracing::error!("[yjs] compaction query failed: {e}"); return; }
    };
    if rows.is_empty() { return; }
    tracing::info!("[yjs] compacting {} idle note(s)", rows.len());

    for (id, orig) in rows {
        let doc = Doc::new();
        let update = match Update::decode_v1(&orig) {
            Ok(u) => u,
            Err(e) => { tracing::error!("[yjs] decode failed for {id}: {e}"); continue; }
        };
        {
            let mut txn = doc.transact_mut();
            if txn.apply_update(update).is_err() { continue; }
        }
        let compacted = {
            let txn = doc.transact();
            txn.encode_state_as_update_v1(&StateVector::default())
        };
        let saved = orig.len() as i64 - compacted.len() as i64;
        match sqlx::query("UPDATE notes SET yjs_state = $1 WHERE id = $2")
            .bind(&compacted[..])
            .bind(&id)
            .execute(db)
            .await
        {
            Ok(_)  => tracing::info!(
                "[yjs] compacted {id}: {} → {} bytes{}",
                orig.len(), compacted.len(),
                if saved > 0 { format!(" (saved {saved})") } else { String::new() }
            ),
            Err(e) => tracing::error!("[yjs] compaction write failed for {id}: {e}"),
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new().route("/yjs/{note_id}", get(ws_handler))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
