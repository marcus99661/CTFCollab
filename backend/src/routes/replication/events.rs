use axum::{extract::State, routing::post, Json, Router};

use crate::error::AppError;
use crate::models::{EventDoc, EventRole};
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use super::{Checkpoint, PullRequest, PullResponse, PushRequest, PushResponse};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/events/pull", post(pull))
        .route("/replication/events/push", post(push))
}

async fn pull(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse<EventDoc>>, AppError> {
    let limit = req.limit.unwrap_or(200).min(1000) as i64;

    let docs: Vec<EventDoc> = match req.checkpoint.clone() {
        None => {
            sqlx::query_as!(
                EventDoc,
                r#"
                SELECT e.id, e.name, e.description, e.created_by, e.created_at, e.updated_at, e.is_deleted, e.start_at, e.end_at, e.ctftime_id
                FROM events e
                JOIN event_members em ON em.event_id = e.id AND em.user_id = $2
                ORDER BY e.updated_at ASC, e.id ASC
                LIMIT $1
                "#,
                limit,
                auth.user_id,
            )
            .fetch_all(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        }
        Some(cp) => {
            sqlx::query_as!(
                EventDoc,
                r#"
                SELECT e.id, e.name, e.description, e.created_by, e.created_at, e.updated_at, e.is_deleted, e.start_at, e.end_at, e.ctftime_id
                FROM events e
                JOIN event_members em ON em.event_id = e.id AND em.user_id = $3
                WHERE (e.updated_at > $1) OR (e.updated_at = $1 AND e.id > $2)
                ORDER BY e.updated_at ASC, e.id ASC
                LIMIT $4
                "#,
                cp.updated_at,
                cp.id,
                auth.user_id,
                limit,
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
    auth: AuthUser, // Logged in user object
    State(state): State<AppState>, // Shared app state - database connection, JWT secret
    Json(req): Json<PushRequest<EventDoc>>, // Request body in JSON format
) -> Result<Json<PushResponse<EventDoc>>, AppError> {
    let mut conflicts = Vec::new();

    // User can push multiple events
    for row in req.rows {
        let mut incoming = row.new_document_state; // singular event object that user sent

        let now = chrono::Utc::now().timestamp_millis();
        incoming.updated_at = incoming.updated_at.min(now);

        // Check if EventDoc already exists
        let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM events WHERE id = $1)")
            .bind(&incoming.id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if exists {
            let member = sqlx::query_scalar::<_, EventRole>(
                "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2"
            )
            .bind(&incoming.id)
            .bind(&auth.user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

            match member {
                None => return Err(AppError::Forbidden),
                Some(role) if incoming.is_deleted && role != EventRole::Owner => return Err(AppError::Forbidden),
                _ => {}
            }
        }

        // Gets Some(EventDoc) if success, None if the server had a newer version
        let applied: Option<EventDoc> = sqlx::query_as!(
            EventDoc,
            r#"
            INSERT INTO events (id, name, description, created_by, created_at, updated_at, is_deleted, start_at, end_at, ctftime_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE
            SET name        = EXCLUDED.name,
                description = EXCLUDED.description,
                updated_at  = EXCLUDED.updated_at,
                is_deleted  = EXCLUDED.is_deleted,
                start_at    = EXCLUDED.start_at,
                end_at      = EXCLUDED.end_at,
                ctftime_id  = EXCLUDED.ctftime_id
            WHERE EXCLUDED.updated_at >= events.updated_at
            RETURNING id, name, description, created_by, created_at, updated_at, is_deleted, start_at, end_at, ctftime_id
            "#,
            incoming.id,
            incoming.name,
            incoming.description,
            auth.user_id,
            incoming.created_at,
            incoming.updated_at,
            incoming.is_deleted,
            incoming.start_at,
            incoming.end_at,
            incoming.ctftime_id
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        // New event was successfully inserted - make the creator the owner
        if !exists {
            if let Some(ref doc) = applied {
                sqlx::query!(
                    "INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', $3)",
                    doc.id,
                    auth.user_id,
                    now,
                )
                .execute(&state.db)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            }
        }

        // If nothing was saved - server had a newer version, return it as a conflict
        if applied.is_none() {
            let server_doc: Option<EventDoc> = sqlx::query_as!(
                EventDoc,
                r#"
                SELECT id, name, description, created_by, created_at, updated_at, is_deleted, start_at, end_at, ctftime_id
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
