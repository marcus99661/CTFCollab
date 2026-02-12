use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};

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

    for row in req.rows {
        let incoming = row.new_document_state;

        if incoming.id != "shared" {
            return Err(ApiError::BadRequest("Only id='shared' is allowed in PoC".into()));
        }

        let mut current = state.note.write().await;

        // Last-write-wins by updated_at
        if incoming.updated_at >= current.updated_at {
            *current = incoming;
        } else {
            // Server has a newer version -> conflict
            conflicts.push(current.clone());
        }
    }

    Ok(Json(PushResponse { conflicts }))
}
