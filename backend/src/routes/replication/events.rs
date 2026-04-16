use axum::{extract::State, routing::post, Json, Router};

use crate::error::AppError;
use crate::models::{EventDoc, EventRole};
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use crate::utils::now_ms;
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
            sqlx::query_as::<_, EventDoc>(
                "SELECT e.id, e.name, e.description, e.created_by, e.created_at, e.updated_at, e.is_deleted, e.start_at, e.end_at, e.ctftime_id, e.flag_format
                 FROM events e
                 JOIN event_members em ON em.event_id = e.id AND em.user_id = $2
                 ORDER BY e.updated_at ASC, e.id ASC
                 LIMIT $1"
            )
            .bind(limit)
            .bind(&auth.user_id)
            .fetch_all(&state.db)
            .await
            ?
        }
        Some(cp) => {
            sqlx::query_as::<_, EventDoc>(
                "SELECT e.id, e.name, e.description, e.created_by, e.created_at, e.updated_at, e.is_deleted, e.start_at, e.end_at, e.ctftime_id, e.flag_format
                 FROM events e
                 JOIN event_members em ON em.event_id = e.id AND em.user_id = $3
                 WHERE (e.updated_at > $1) OR (e.updated_at = $1 AND e.id > $2)
                 ORDER BY e.updated_at ASC, e.id ASC
                 LIMIT $4"
            )
            .bind(cp.updated_at)
            .bind(&cp.id)
            .bind(&auth.user_id)
            .bind(limit)
            .fetch_all(&state.db)
            .await
            ?
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
    Json(req): Json<PushRequest<EventDoc>>,
) -> Result<Json<PushResponse<EventDoc>>, AppError> {
    let mut conflicts = Vec::new();

    for row in req.rows {
        let mut incoming = row.new_document_state;

        let now = now_ms();
        incoming.updated_at = incoming.updated_at.min(now);

        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM events WHERE id = $1)"
        )
        .bind(&incoming.id)
        .fetch_one(&state.db)
        .await
        ?;

        if !exists && auth.event_based {
            continue;
        }

        if exists {
            let member = sqlx::query_scalar::<_, EventRole>(
                "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2"
            )
            .bind(&incoming.id)
            .bind(&auth.user_id)
            .fetch_optional(&state.db)
            .await
            ?;

            match member {
                None | Some(EventRole::Member) => continue,
                Some(EventRole::Owner) => {}
            }
        }

        let applied: Option<EventDoc> = sqlx::query_as::<_, EventDoc>(
            "INSERT INTO events (id, name, description, created_by, created_at, updated_at, is_deleted, start_at, end_at, ctftime_id, flag_format)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 updated_at = EXCLUDED.updated_at,
                 is_deleted = EXCLUDED.is_deleted,
                 start_at = EXCLUDED.start_at,
                 end_at = EXCLUDED.end_at,
                 ctftime_id = EXCLUDED.ctftime_id,
                 flag_format = EXCLUDED.flag_format
             WHERE EXCLUDED.updated_at >= events.updated_at
             RETURNING id, name, description, created_by, created_at, updated_at, is_deleted, start_at, end_at, ctftime_id, flag_format"
        )
        .bind(&incoming.id)
        .bind(&incoming.name)
        .bind(&incoming.description)
        .bind(&auth.user_id)
        .bind(incoming.created_at)
        .bind(incoming.updated_at)
        .bind(incoming.is_deleted)
        .bind(incoming.start_at)
        .bind(incoming.end_at)
        .bind(incoming.ctftime_id)
        .bind(&incoming.flag_format)
        .fetch_optional(&state.db)
        .await
        ?;

        if !exists {
            if let Some(ref doc) = applied {
                sqlx::query(
                    "INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES ($1, $2, 'owner', $3)"
                )
                .bind(&doc.id)
                .bind(&auth.user_id)
                .bind(now)
                .execute(&state.db)
                .await
                ?;
            }
        }

        if applied.is_none() {
            let server_doc: Option<EventDoc> = sqlx::query_as::<_, EventDoc>(
                "SELECT id, name, description, created_by, created_at, updated_at, is_deleted, start_at, end_at, ctftime_id, flag_format
                 FROM events WHERE id = $1"
            )
            .bind(&incoming.id)
            .fetch_optional(&state.db)
            .await
            ?;

            if let Some(doc) = server_doc {
                conflicts.push(doc);
            }
        }
    }

    Ok(Json(PushResponse { conflicts }))
}
