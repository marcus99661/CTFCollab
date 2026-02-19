use axum::{extract::State, Json, Router};
use axum::routing::post;
use crate::state::AppState;
use crate::replication::{ApiError, Checkpoint, PullRequest};
use crate::models::ChallengeDoc;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResponse<T> {
    pub documents: Vec<T>,
    pub checkpoint: Option<Checkpoint>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRow<T> {
    pub new_document_state: T,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest<T> {
    pub rows: Vec<PushRow<T>>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse<T> {
    pub conflicts: Vec<T>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/challenges/pull", post(pull))
        .route("/replication/challenges/push", post(push))
}

pub async fn pull(
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse<ChallengeDoc>>, ApiError> {
    let limit = req.limit.unwrap_or(200).min(1000) as i64;

    let docs: Vec<ChallengeDoc> = match req.checkpoint.clone() {
        None => {
            sqlx::query_as!(
                ChallengeDoc,
                r#"
                SELECT id, event_id, title, category, points, url, created_at, updated_at, is_deleted
                FROM challenges
                ORDER BY updated_at ASC, id ASC
                LIMIT $1
                "#,
                limit
            )
                .fetch_all(&state.db)
                .await
                .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?
        }
        Some(cp) => {
            sqlx::query_as!(
                ChallengeDoc,
                r#"
                SELECT id, event_id, title, category, points, url, created_at, updated_at, is_deleted
                FROM challenges
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
                .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?
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

pub async fn push(
    State(state): State<AppState>,
    Json(req): Json<PushRequest<ChallengeDoc>>,
) -> Result<Json<PushResponse<ChallengeDoc>>, ApiError> {
    let mut conflicts = Vec::new();

    for row in req.rows {
        let incoming = row.new_document_state;

        let applied: Option<ChallengeDoc> = sqlx::query_as!(
            ChallengeDoc,
            r#"
            INSERT INTO challenges (id, event_id, title, category, points, url, created_at, updated_at, is_deleted)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (id) DO UPDATE
            SET event_id = EXCLUDED.event_id,
                title = EXCLUDED.title,
                category = EXCLUDED.category,
                points = EXCLUDED.points,
                url = EXCLUDED.url,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at,
                is_deleted = EXCLUDED.is_deleted
            WHERE EXCLUDED.updated_at >= challenges.updated_at
            RETURNING id, event_id, title, category, points, url, created_at, updated_at, is_deleted
            "#,
            incoming.id,
            incoming.event_id,
            incoming.title,
            incoming.category,
            incoming.points,
            incoming.url,
            incoming.created_at,
            incoming.updated_at,
            incoming.is_deleted
        )
            .fetch_optional(&state.db)
            .await
            .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?;

        if applied.is_none() {
            let server_doc: Option<ChallengeDoc> = sqlx::query_as!(
                ChallengeDoc,
                r#"
                SELECT id, event_id, title, category, points, url, created_at, updated_at, is_deleted
                FROM challenges
                WHERE id = $1
                "#,
                incoming.id
            )
                .fetch_optional(&state.db)
                .await
                .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?;

            if let Some(doc) = server_doc {
                conflicts.push(doc);
            }
        }
    }

    Ok(Json(PushResponse { conflicts }))
}
