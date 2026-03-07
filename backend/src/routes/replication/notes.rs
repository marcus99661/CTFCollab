use axum::{extract::State, routing::post, Json, Router};

use crate::error::AppError;
use crate::models::NoteDoc;
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use super::{Checkpoint, PullRequest, PullResponse, PushRequest, PushResponse};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/pull", post(pull))
        .route("/replication/push", post(push))
}

async fn pull(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse<NoteDoc>>, AppError> {
    let limit = req.limit.unwrap_or(200).min(1000) as i64;

    let docs: Vec<NoteDoc> = match req.checkpoint.clone() {
        None => {
            sqlx::query_as!(
                NoteDoc,
                r#"
                SELECT id, title, content, updated_at, is_deleted
                FROM notes
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
                NoteDoc,
                r#"
                SELECT id, title, content, updated_at, is_deleted
                FROM notes
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
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<PushRequest<NoteDoc>>,
) -> Result<Json<PushResponse<NoteDoc>>, AppError> {
    let mut conflicts = Vec::new();

    for row in req.rows {
        let incoming = row.new_document_state;

        if incoming.id.is_empty() {
            return Err(AppError::BadRequest("id is required".into()));
        }
        if incoming.title.is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }

        let applied: Option<NoteDoc> = sqlx::query_as!(
            NoteDoc,
            r#"
            INSERT INTO notes (id, title, content, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET title      = EXCLUDED.title,
                updated_at = EXCLUDED.updated_at,
                is_deleted = EXCLUDED.is_deleted
            WHERE EXCLUDED.updated_at >= notes.updated_at
            RETURNING id, title, content, updated_at, is_deleted
            "#,
            incoming.id,
            incoming.title,
            incoming.content,
            incoming.updated_at,
            incoming.is_deleted
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        if applied.is_none() {
            let server_doc: Option<NoteDoc> = sqlx::query_as!(
                NoteDoc,
                r#"
                SELECT id, title, content, updated_at, is_deleted
                FROM notes
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
