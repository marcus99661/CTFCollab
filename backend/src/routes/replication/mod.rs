mod challenges;
mod events;
mod notes;

use axum::Router;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

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
pub struct PullResponse<T> {
    pub documents: Vec<T>,
    pub checkpoint: Option<Checkpoint>,
    pub accessible_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRow<T> {
    pub new_document_state: T,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest<T> {
    pub rows: Vec<PushRow<T>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResponse<T> {
    pub conflicts: Vec<T>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(notes::router())
        .merge(events::router())
        .merge(challenges::router())
}
