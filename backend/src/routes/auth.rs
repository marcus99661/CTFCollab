use axum::{routing::post, Json, Router, extract::State};
use crate::error::AppError;
use crate::services::auth_service::{AuthService, LoginRequest, RegisterRequest, AuthResponse};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/login", post(login)).route("/register", post(register))
}

async fn login(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> Result<Json<AuthResponse>, AppError> {
    AuthService::login(&state.db, &state.enc_key, payload)
        .await
        .map(Json)
        .map_err(|e| AppError::BadRequest(e))
}

async fn register(State(state): State<AppState>, Json(payload): Json<RegisterRequest>) -> Result<Json<AuthResponse>, AppError> {
    AuthService::register(&state.db, &state.enc_key, payload)
        .await
        .map(Json)
        .map_err(|e| AppError::BadRequest(e))
}