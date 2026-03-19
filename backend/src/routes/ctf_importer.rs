use axum::{extract::Path, routing::get, Json, Router};
use serde::{Deserialize, Serialize};

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

async fn list_events(_auth: AuthUser, ) -> Result<Json<Vec<CtftimeEvent>>, AppError> {

}

async fn get_event(_auth: AuthUser, Path(id): Path<u64>, ) -> Result<Json<CtftimeEvent>, AppError> {

}
