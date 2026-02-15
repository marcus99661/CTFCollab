use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use std::convert::Infallible;
use axum::response::sse::{Event, KeepAlive, Sse};
use crate::state::{AppState, SharedNote};

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            ApiError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub checkpoint: Option<Checkpoint>,
    pub limit: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse {
    pub documents: Vec<SharedNote>,
    pub checkpoint: Option<Checkpoint>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRow {
    pub new_document_state: SharedNote,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub rows: Vec<PushRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse {
    pub conflicts: Vec<SharedNote>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/pull", post(pull))
        .route("/replication/push", post(push))
        .route("/replication/subscribe", get(subscribe))
}


async fn subscribe(
    State(state): State<AppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.note_updates.subscribe();

    let stream = BroadcastStream::new(rx).filter_map(|msg| {
        match msg {
            Ok(ts) => Some(Ok(Event::default().event("note").data(ts.to_string()))),
            Err(_) => None,
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn pull(
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse>, ApiError> {
    let note = state.note.read().await.clone();

    let should_send = match req.checkpoint {
        None => true,
        Some(cp) => note.updated_at > cp.updated_at,
    };

    let documents = if should_send { vec![note.clone()] } else { vec![] };

    let checkpoint = Some(Checkpoint {
        id: note.id,
        updated_at: note.updated_at,
    });

    Ok(Json(PullResponse { documents, checkpoint }))
}

async fn push(
    State(state): State<AppState>,
    Json(req): Json<PushRequest>,
) -> Result<Json<PushResponse>, ApiError> {
    let mut conflicts = Vec::new();
    let mut updated = false;
    let mut new_ts: i64 = 0;

    for row in req.rows {
        let incoming = row.new_document_state;

        if incoming.id != "shared" {
            return Err(ApiError::BadRequest("Only id='shared' is allowed in PoC".into()));
        }

        let mut current = state.note.write().await;

        // Last-write-wins by updated_at
        if incoming.updated_at >= current.updated_at {
            *current = incoming;
            updated = true;
            new_ts = current.updated_at;
        } else {
            conflicts.push(current.clone());
        }
    }

    if updated {
        let _ = state.note_updates.send(new_ts);
    }

    Ok(Json(PushResponse { conflicts }))
}
