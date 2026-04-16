use axum::{extract::State, routing::post, Json, Router};

use crate::error::AppError;
use crate::models::ChallengeDoc;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use crate::utils::now_ms;
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
            sqlx::query_as::<_, ChallengeDoc>(
                "SELECT c.id, c.event_id, c.title, c.category, c.points, c.url, c.created_at, c.updated_at, c.is_deleted, c.note_id, c.solved, c.flag, c.solved_by, c.solvers, c.description, c.ctfd_id
                 FROM challenges c
                 JOIN event_members em ON em.event_id = c.event_id AND em.user_id = $2
                 ORDER BY GREATEST(c.updated_at, em.joined_at) ASC, c.id ASC
                 LIMIT $1"
            )
            .bind(limit)
            .bind(&auth.user_id)
            .fetch_all(&state.db)
            .await
            ?
        }
        Some(cp) => {
            sqlx::query_as::<_, ChallengeDoc>(
                "SELECT c.id, c.event_id, c.title, c.category, c.points, c.url, c.created_at, c.updated_at, c.is_deleted, c.note_id, c.solved, c.flag, c.solved_by, c.solvers, c.description, c.ctfd_id
                 FROM challenges c
                 JOIN event_members em ON em.event_id = c.event_id AND em.user_id = $3
                 WHERE GREATEST(c.updated_at, em.joined_at) > $1
                    OR (GREATEST(c.updated_at, em.joined_at) = $1 AND c.id > $2)
                 ORDER BY GREATEST(c.updated_at, em.joined_at) ASC, c.id ASC
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

    // Checkpoint is based on GREATEST(updated_at, joined_at) so that challenges from
    // newly joined events are not skipped. This is required if user has join event that
    // contains challenges that are older than user's checkpoint time
    let new_checkpoint = if let Some(last) = docs.last() {
        let effective_at = sqlx::query_scalar::<_, i64>(
            "SELECT GREATEST(c.updated_at, em.joined_at)
             FROM challenges c
             JOIN event_members em ON em.event_id = c.event_id AND em.user_id = $2
             WHERE c.id = $1"
        )
        .bind(&last.id)
        .bind(&auth.user_id)
        .fetch_one(&state.db)
        .await
        ?;

        Some(Checkpoint { id: last.id.clone(), updated_at: effective_at })
    } else {
        None
    };

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

        let now = now_ms();
        incoming.updated_at = incoming.updated_at.min(now);

        // Check the user is a member of the event this challenge belongs to
        let role = sqlx::query_scalar::<_, EventRole>(
            "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2"
        )
        .bind(&incoming.event_id)
        .bind(&auth.user_id)
        .fetch_optional(&state.db)
        .await
        ?;

        match role {
            None => continue,
            Some(EventRole::Owner) => {}
            Some(EventRole::Member) => {
                // Members can only update collaborative fields, restore metadata from the server
                let existing = sqlx::query_as::<_, ChallengeDoc>(
                    "SELECT id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id, solved, flag, solved_by, solvers, description, ctfd_id
                     FROM challenges WHERE id = $1"
                )
                .bind(&incoming.id)
                .fetch_optional(&state.db)
                .await
                ?;

                match existing {
                    None => continue,
                    Some(server) => {
                        incoming.title = server.title;
                        incoming.category = server.category;
                        incoming.points = server.points;
                        incoming.url = server.url;
                        incoming.is_deleted = server.is_deleted;
                        incoming.description = server.description;
                        incoming.ctfd_id = server.ctfd_id;
                    }
                }
            }
        }

        let applied: Option<ChallengeDoc> = sqlx::query_as::<_, ChallengeDoc>(
            "INSERT INTO challenges (id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id, solved, flag, solved_by, solvers, description, ctfd_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (id) DO UPDATE
             SET event_id = EXCLUDED.event_id,
                 title = EXCLUDED.title,
                 category = EXCLUDED.category,
                 points = EXCLUDED.points,
                 url = EXCLUDED.url,
                 created_at = EXCLUDED.created_at,
                 updated_at = EXCLUDED.updated_at,
                 is_deleted = EXCLUDED.is_deleted,
                 note_id = EXCLUDED.note_id,
                 solved = EXCLUDED.solved,
                 flag = EXCLUDED.flag,
                 solved_by = EXCLUDED.solved_by,
                 solvers = EXCLUDED.solvers,
                 description = EXCLUDED.description,
                 ctfd_id = EXCLUDED.ctfd_id
             WHERE EXCLUDED.updated_at >= challenges.updated_at
             RETURNING id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id, solved, flag, solved_by, solvers, description, ctfd_id"
        )
        .bind(&incoming.id)
        .bind(&incoming.event_id)
        .bind(&incoming.title)
        .bind(&incoming.category)
        .bind(incoming.points)
        .bind(&incoming.url)
        .bind(incoming.created_at)
        .bind(incoming.updated_at)
        .bind(incoming.is_deleted)
        .bind(&incoming.note_id)
        .bind(incoming.solved)
        .bind(&incoming.flag)
        .bind(&incoming.solved_by)
        .bind(&incoming.solvers)
        .bind(&incoming.description)
        .bind(incoming.ctfd_id)
        .fetch_optional(&state.db)
        .await
        ?;

        if applied.is_none() {
            let server_doc: Option<ChallengeDoc> = sqlx::query_as::<_, ChallengeDoc>(
                "SELECT id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id, solved, flag, solved_by, solvers, description, ctfd_id
                 FROM challenges WHERE id = $1"
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