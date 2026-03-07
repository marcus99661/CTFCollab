use axum::{routing::post, Json, Router, extract::{State, FromRequestParts}, http::request::Parts};
use axum::extract::Path;
use axum::routing::{delete, get};
use sqlx::PgPool;

use crate::error::AppError;
use crate::models::Users;
use crate::state::AppState;
use crate::routes::auth::AuthUser;

pub fn router() -> Router<AppState> {
    Router::new()
        //.route("/admin", post(login))
        .route("/api/admin/users", get(users))
        .route("/api/admin/users/{id}", delete(delete_user))
}

async fn users(auth: AuthUser, State(state): State<AppState>) -> Result<Json<Vec<Users>>, AppError> {
    let user = sqlx::query_as::<_, crate::models::Users>(
        "SELECT id, name, email, password_hash FROM users"
    )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string());

    Ok(Json(user.unwrap()))
    // Return the list of users here
}

async fn delete_user(auth: AuthUser, State(state): State<AppState>, Path(id): Path<String>) -> Result<(), AppError> {
    let user = sqlx::query_as::<_, crate::models::Users>(
        "DELETE FROM users WHERE id = $1"
    )
        .bind(id)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string());

    Ok(())
}
