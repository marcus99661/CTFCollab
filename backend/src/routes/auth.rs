use axum::{routing::post, Json, Router};
use crate::error::AppError;
use crate::services::auth_service::{AuthService, LoginRequest, AuthResponse};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/login", post(login))
}

async fn login(Json(payload): Json<LoginRequest>) -> Result<Json<AuthResponse>, AppError> {
    AuthService::login(payload)
        .map(Json)
        .map_err(|e| AppError::BadRequest(e))
}
