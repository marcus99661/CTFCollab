use axum::{extract::Path, routing::get, Json, Router};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json;

use crate::error::AppError;
use crate::routes::auth::AuthUser;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ctftime/events", get(list_events))
        .route("/ctftime/events/{id}", get(get_event))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CtftimeEvent {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub url: String,
    pub start: String,
    pub finish: String,
}

async fn list_events(
    _auth: AuthUser,
) -> Result<Json<Vec<CtftimeEvent>>, AppError> {
    let client = Client::new();

    let res: reqwest::Response = client
        .get("https://ctftime.org/api/v1/events/?limit=50")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0")
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let body = res.text().await.map_err(|e| AppError::Internal(e.to_string()))?;
    tracing::info!("ctftime response: {}", body);

    let events = serde_json::from_str::<Vec<CtftimeEvent>>(&body)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(events))
}

async fn get_event(
    _auth: AuthUser,
    Path(id): Path<u64>,
) -> Result<Json<CtftimeEvent>, AppError> {
    let client = Client::new();

    let res: reqwest::Response = client
        .get(format!("https://ctftime.org/api/v1/events/{}/", id))
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0")
        .send()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let event = res
        .json::<CtftimeEvent>()
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(event))
}