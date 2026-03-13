use axum::{routing::post, Json, Router, extract::{State, FromRequestParts}, http::request::Parts};
use axum::extract::Path;
use axum::routing::{delete, get, put};

use crate::error::AppError;
use crate::models::Users;
use crate::state::AppState;
use crate::routes::auth::AuthUser;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/events/{id}/members", get(list_members)) // List members
        .route("/events/{id}/members/{user_id}", delete(delete_user))// Delete user
        .route("/events/{id}/members", post(invite_user)) // invite by username
}

async fn list_members(state: State<AppState>) -> Result<Json<Users>, AppError> {

    Err(AppError::Internal("".to_string()).into())
}

async fn delete_user(state: State<AppState>) -> Result<bool, AppError> {

    Ok(true)
}

async fn invite_user(state: State<AppState>) -> Result<bool, AppError> {

    Ok(true)
}