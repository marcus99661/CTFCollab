use axum::{routing::post, Json, Router, extract::{State, FromRequestParts}, http::request::Parts};
use jsonwebtoken::{decode, Validation, Algorithm};
use crate::error::AppError;
use crate::services::auth_service::{AuthService, LoginRequest, RegisterRequest, AuthResponse, Claims};
use crate::state::AppState;

pub struct AuthUser {
    pub user_id: String,
    pub event_based: bool,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = if let Some(auth_header) = parts.headers.get("Authorization").and_then(|v| v.to_str().ok()) {
            auth_header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?
        } else {
            // Fallback for WebSocket connections which can't set headers
            parts.uri.query()
                .and_then(|q| q.split('&').find(|p| p.starts_with("token=")))
                .and_then(|p| p.strip_prefix("token="))
                .ok_or(AppError::Unauthorized)?
        };

        let token_data = decode::<Claims>(token, &state.dec_key, &Validation::new(Algorithm::HS256))
            .map_err(|_| AppError::Unauthorized)?;

        Ok(AuthUser {
            user_id: token_data.claims.sub,
            event_based: token_data.claims.event_based,
        })
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/register", post(register))
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