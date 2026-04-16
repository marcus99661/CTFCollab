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
        .route("/ctftime/events/running", get(list_running))
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
        ?;

    let body = res.text().await?;
    tracing::info!("ctftime response: {}", body);

    let events = serde_json::from_str::<Vec<CtftimeEvent>>(&body)
        ?;

    Ok(Json(events))
}

async fn list_running(
    _auth: AuthUser,
) -> Result<Json<Vec<CtftimeEvent>>, AppError> {
    let client = Client::new();

    let now_ts = chrono::Utc::now().timestamp();
    let url = format!(
        "https://ctftime.org/api/v1/events/?limit=500&start={}",
        now_ts - (180 * 24 * 60 * 60)
    );

    let res = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0")
        .send()
        .await
        ?;

    let body = res.text().await?;
    let mut events = serde_json::from_str::<Vec<CtftimeEvent>>(&body)
        ?;
    events.retain(|e| {
        let started = chrono::DateTime::parse_from_rfc3339(&e.start)
            .map(|t| t.timestamp() <= now_ts)
            .unwrap_or(false);
        let not_finished = chrono::DateTime::parse_from_rfc3339(&e.finish)
            .map(|t| t.timestamp() > now_ts)
            .unwrap_or(false);
        started && not_finished
    });

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
        ?;

    let event = res
        .json::<CtftimeEvent>()
        .await
        ?;

    Ok(Json(event))
}