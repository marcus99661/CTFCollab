use axum::{extract::State, routing::post, Json, Router};

use crate::error::AppError;
use crate::models::EventDoc;
use crate::state::AppState;
use super::{Checkpoint, PullRequest, PullResponse, PushRequest, PushResponse};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/events/pull", post(pull))
        .route("/replication/events/push", post(push))
}

async fn pull(
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse<EventDoc>>, AppError> {
    let limit = req.limit.unwrap_or(200).min(1000) as i64;

    let docs: Vec<EventDoc> = match req.checkpoint.clone() {
        None => {
            sqlx::query_as!(
                EventDoc,
                r#"
                SELECT id, name, description, created_at, updated_at, is_deleted
                FROM events
                ORDER BY updated_at ASC, id ASC
                LIMIT $1
                "#,
                limit
            )
            .fetch_all(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        }
        Some(cp) => {
            sqlx::query_as!(
                EventDoc,
                r#"
                SELECT id, name, description, created_at, updated_at, is_deleted
                FROM events
                WHERE (updated_at > $1) OR (updated_at = $1 AND id > $2)
                ORDER BY updated_at ASC, id ASC
                LIMIT $3
                "#,
                cp.updated_at,
                cp.id,
                limit
            )
            .fetch_all(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        }
    };

    let new_checkpoint = docs.last().map(|d| Checkpoint {
        id: d.id.clone(),
        updated_at: d.updated_at,
    });

    Ok(Json(PullResponse {
        documents: docs,
        checkpoint: new_checkpoint.or(req.checkpoint),
    }))
}

async fn push(
    State(state): State<AppState>,
    Json(req): Json<PushRequest<EventDoc>>,
) -> Result<Json<PushResponse<EventDoc>>, AppError> {
    let mut conflicts = Vec::new();

    for row in req.rows {
        let incoming = row.new_document_state;

        let applied: Option<EventDoc> = sqlx::query_as!(
            EventDoc,
            r#"
            INSERT INTO events (id, name, description, created_at, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE
            SET name        = EXCLUDED.name,
                description = EXCLUDED.description,
                created_at  = EXCLUDED.created_at,
                updated_at  = EXCLUDED.updated_at,
                is_deleted  = EXCLUDED.is_deleted
            WHERE EXCLUDED.updated_at >= events.updated_at
            RETURNING id, name, description, created_at, updated_at, is_deleted
            "#,
            incoming.id,
            incoming.name,
            incoming.description,
            incoming.created_at,
            incoming.updated_at,
            incoming.is_deleted
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        if applied.is_none() {
            let server_doc: Option<EventDoc> = sqlx::query_as!(
                EventDoc,
                r#"
                SELECT id, name, description, created_at, updated_at, is_deleted
                FROM events
                WHERE id = $1
                "#,
                incoming.id
            )
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

            if let Some(doc) = server_doc {
                conflicts.push(doc);
            }
        }
    }

    Ok(Json(PushResponse { conflicts }))
}
