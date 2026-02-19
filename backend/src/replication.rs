use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::state::{AppState, NoteDoc};

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
    pub documents: Vec<NoteDoc>,
    pub checkpoint: Option<Checkpoint>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRow {
    pub new_document_state: NoteDoc,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub rows: Vec<PushRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse {
    pub conflicts: Vec<NoteDoc>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/replication/pull", post(pull))
        .route("/replication/push", post(push))
}

async fn pull(
    State(state): State<AppState>,
    Json(req): Json<PullRequest>,
) -> Result<Json<PullResponse>, ApiError> {
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
                .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?
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
                .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?
        }
    };

    // New checkpoint = last doc we returned (stable ordering)
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
    Json(req): Json<PushRequest>,
) -> Result<Json<PushResponse>, ApiError> {
    let mut conflicts = Vec::new();

    for row in req.rows {
        let incoming = row.new_document_state;

        if incoming.id.is_empty() {
            return Err(ApiError::BadRequest("id is required".into()));
        }
        if incoming.title.is_empty() {
            return Err(ApiError::BadRequest("title is required".into()));
        }

        let applied: Option<NoteDoc> = sqlx::query_as!(
            NoteDoc,
            r#"
            INSERT INTO notes (id, title, content, updated_at, is_deleted)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET title = EXCLUDED.title,
                content = EXCLUDED.content,
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
            .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?;


        if applied.is_none() {
            // Server has newer version -> return server doc as conflict
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
                .map_err(|e: sqlx::Error| ApiError::Internal(e.to_string()))?;

            if let Some(doc) = server_doc {
                conflicts.push(doc);
            }
        }
    }

    Ok(Json(PushResponse { conflicts }))
}
