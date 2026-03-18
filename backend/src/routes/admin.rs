use axum::{routing::post, Json, Router, extract::State};
use axum::extract::Path;
use axum::routing::{delete, get};
use serde::Serialize;

use crate::error::AppError;
use crate::state::AppState;
use crate::routes::auth::AuthUser;

pub fn router() -> Router<AppState> {
    Router::new()
        //.route("/admin", post(login))
        .route("/admin/users", get(users))
        .route("/admin/users/{id}", delete(delete_user))
}

#[derive(Serialize)]
struct UserInfo {
    id: String,
    name: String,
    email: String,
}

async fn users(auth: AuthUser, State(state): State<AppState>) -> Result<Json<Vec<UserInfo>>, AppError> {
    let rows = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, name, email FROM users ORDER BY name ASC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let result = rows.into_iter().map(|(id, name, email)| UserInfo { id, name, email }).collect();
    Ok(Json(result))
}

async fn delete_user(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<(), AppError> {
    // Only allow deleting your own account
    if auth.user_id != id {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}
