use axum::{extract::State, routing::post, Json, Router};

use crate::error::AppError;
use crate::models::ChallengeDoc;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use super::{Checkpoint, PullRequest, PullResponse, PushRequest, PushResponse};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/challenges/pull", post(pull))
        .route("/replication/challenges/push", post(push))
}

async fn pull(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse<ChallengeDoc>>, AppError> {
    let limit = req.limit.unwrap_or(200).min(1000) as i64;

    let docs: Vec<ChallengeDoc> = match req.checkpoint.clone() {
        None => {
            sqlx::query_as!(
                ChallengeDoc,
                r#"
                SELECT c.id, c.event_id, c.title, c.category, c.points, c.url, c.created_at, c.updated_at, c.is_deleted, c.note_id
                FROM challenges c
                JOIN event_members em ON em.event_id = c.event_id AND em.user_id = $2
                ORDER BY c.updated_at ASC, c.id ASC
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
                ChallengeDoc,
                r#"
                SELECT c.id, c.event_id, c.title, c.category, c.points, c.url, c.created_at, c.updated_at, c.is_deleted, c.note_id
                FROM challenges c
                JOIN event_members em ON em.event_id = c.event_id AND em.user_id = $3
                WHERE (c.updated_at > $1) OR (c.updated_at = $1 AND c.id > $2)
                ORDER BY c.updated_at ASC, c.id ASC
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
    auth: AuthUser,
    State(state): State<AppState>,
    Json(req): Json<PushRequest<ChallengeDoc>>,
) -> Result<Json<PushResponse<ChallengeDoc>>, AppError> {
    let mut conflicts = Vec::new();

    for row in req.rows {
        let mut incoming = row.new_document_state;

        let now = chrono::Utc::now().timestamp_millis();
        incoming.updated_at = incoming.updated_at.min(now);

        // Check the user is a member of the event this challenge belongs to
        let role = sqlx::query_scalar::<_, EventRole>(
            "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2"
        )
        .bind(&incoming.event_id)
        .bind(&auth.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        match role {
            None => return Err(AppError::Forbidden),
            Some(r) if incoming.is_deleted && r != EventRole::Owner => return Err(AppError::Forbidden),
            _ => {}
        }

        let applied: Option<ChallengeDoc> = sqlx::query_as!(
            ChallengeDoc,
            r#"
            INSERT INTO challenges (id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE
            SET event_id   = EXCLUDED.event_id,
                title      = EXCLUDED.title,
                category   = EXCLUDED.category,
                points     = EXCLUDED.points,
                url        = EXCLUDED.url,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at,
                is_deleted = EXCLUDED.is_deleted,
                note_id    = EXCLUDED.note_id
            WHERE EXCLUDED.updated_at >= challenges.updated_at
            RETURNING id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id
            "#,
            incoming.id,
            incoming.event_id,
            incoming.title,
            incoming.category,
            incoming.points,
            incoming.url,
            incoming.created_at,
            incoming.updated_at,
            incoming.is_deleted,
            incoming.note_id
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        if applied.is_none() {
            let server_doc: Option<ChallengeDoc> = sqlx::query_as!(
                ChallengeDoc,
                r#"
                SELECT id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id
                FROM challenges
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