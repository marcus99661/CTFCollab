use std::time::Duration;
use sqlx::PgPool;
use uuid::Uuid;

use crate::routes::ctfd::{ctfd_fetch, ctfd_fetch_challenge};
use crate::routes::challenge_files::sync_ctfd_files;
use crate::utils::now_ms;

pub fn start_poller(db: PgPool) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5 * 60)).await;
            poll(&db).await;
        }
    });
}

async fn poll(db: &PgPool) {
    let now = now_ms();

    let configs = match sqlx::query_as::<_, (String, String, String, Option<String>, String)>(
        "SELECT c.event_id, e.name, c.ctfd_url, c.ctfd_credential, c.ctfd_auth_type
         FROM event_ctfd_config c
         JOIN events e ON e.id = c.event_id
         WHERE e.is_deleted = false
           AND (e.start_at IS NULL OR e.start_at <= $1)
           AND (e.end_at IS NULL OR e.end_at >= $1)"
    )
    .bind(now)
    .fetch_all(db)
    .await {
        Ok(r) => r,
        Err(e) => { tracing::error!("CTFd poller DB error: {}", e); return; }
    };

    for (event_id, event_name, ctfd_url, credential, auth_type) in configs {
        let Some(credential) = credential else { continue };
        poll_event(db, &event_id, &event_name, &ctfd_url, &credential, &auth_type).await;
    }
}

async fn poll_event(db: &PgPool, event_id: &str, event_name: &str, ctfd_url: &str, credential: &str, auth_type: &str) {
    tracing::info!("Starting to import challenges for {}", event_name);

    let text = match ctfd_fetch(&format!("{}/api/v1/challenges", ctfd_url), auth_type, credential).await {
        Ok(t) => t,
        Err(_) => return,
    };

    let body: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return,
    };

    let challenges = match body["data"].as_array() {
        Some(a) => a.clone(),
        None => return,
    };

    let existing_ids: Vec<i32> = sqlx::query_scalar(
        "SELECT ctfd_id FROM challenges WHERE event_id = $1 AND ctfd_id IS NOT NULL AND is_deleted = false"
    )
    .bind(event_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let existing_set: std::collections::HashSet<i32> = existing_ids.into_iter().collect();

    let mut imported = 0;

    for ch in challenges {
        let ctfd_id = match ch["id"].as_i64() {
            Some(id) => id as i32,
            None => continue,
        };
        if existing_set.contains(&ctfd_id) { continue; }

        let name = ch["name"].as_str().unwrap_or("").to_string();
        let points = ch["value"].as_i64().unwrap_or(0) as i32;
        let category = ch["category"].as_str().unwrap_or("").to_string();

        let (description, category, files) = match ctfd_fetch_challenge(ctfd_url, auth_type, credential, ctfd_id as u64).await {
            Ok(detail) => (detail.description, detail.category, detail.files),
            Err(_) => (String::new(), category, Vec::new()),
        };

        let challenge_id = Uuid::new_v4().to_string();
        let note_id = Uuid::new_v4().to_string();
        let now = now_ms();

        if let Err(e) = sqlx::query(
            "INSERT INTO notes (id, title, updated_at, is_deleted) VALUES ($1, $2, $3, false)"
        )
        .bind(&note_id)
        .bind(&name)
        .bind(now)
        .execute(db)
        .await {
            tracing::error!("CTFd poller note insert error: {}", e);
            continue;
        }

        if let Err(e) = sqlx::query(
            "INSERT INTO challenges (id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id, solved, flag, solved_by, solvers, description, ctfd_id)
             VALUES ($1, $2, $3, $4, $5, '', $6, $6, false, $7, false, null, null, '{}', $8, $9)
             ON CONFLICT DO NOTHING"
        )
        .bind(&challenge_id)
        .bind(event_id)
        .bind(&name)
        .bind(&category)
        .bind(points)
        .bind(now)
        .bind(&note_id)
        .bind(&description)
        .bind(ctfd_id)
        .execute(db)
        .await {
            tracing::error!("CTFd poller challenge insert error: {}", e);
            continue;
        }

        imported += 1;

        if !files.is_empty() {
            sync_ctfd_files(db, &challenge_id, &name, event_id, ctfd_url, auth_type, credential, &files).await;
        }
    }

    tracing::info!("Imported {} new challenges for {}", imported, event_name);
}