use axum::{extract::{Path, State}, routing::{delete, get, post}, Json, Router};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/events/{id}/members", get(list_members)) // List members
        .route("/events/{id}/members", post(invite_user)) // Invite user by username
        .route("/events/{id}/members/{user_id}", delete(kick_user)) // Kick user
}

#[derive(Serialize)]
struct MemberInfo {
    user_id: String,
    username: String,
    role: EventRole,
}

#[derive(Deserialize)]
struct InviteBody {
    username: String,
}

async fn list_members(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<MemberInfo>>, AppError> {
    // Verify the requester is a member
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)"
    )
    .bind(&event_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if !is_member {
        return Err(AppError::Forbidden);
    }

    let members = sqlx::query_as::<_, (String, String, EventRole)>(
        "SELECT em.user_id, u.name, em.role
         FROM event_members em
         JOIN users u ON u.id = em.user_id
         WHERE em.event_id = $1
         ORDER BY em.joined_at ASC"
    )
    .bind(&event_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let result = members.into_iter().map(|(user_id, username, role)| MemberInfo {
        user_id,
        username,
        role,
    }).collect();

    Ok(Json(result))
}

async fn invite_user(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    Json(body): Json<InviteBody>,
) -> Result<Json<MemberInfo>, AppError> {
    // Only owners can invite
    let role = sqlx::query_scalar::<_, EventRole>(
        "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2"
    )
    .bind(&event_id)
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if role != Some(EventRole::Owner) {
        return Err(AppError::Forbidden);
    }

    // Look up the user being invited by username
    let user = sqlx::query_as::<_, (String, String)>(
        "SELECT id, name FROM users WHERE name = $1"
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or(AppError::BadRequest("User not found".into()))?;

    let already_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)"
    )
    .bind(&event_id)
    .bind(&user.0)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if already_member {
        return Err(AppError::BadRequest("User is already a member".into()));
    }

    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query(
        "INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES ($1, $2, 'member', $3)"
    )
    .bind(&event_id)
    .bind(&user.0)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(MemberInfo {
        user_id: user.0,
        username: user.1,
        role: EventRole::Member,
    }))
}

async fn kick_user(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((event_id, target_user_id)): Path<(String, String)>,
) -> Result<(), AppError> {
    // Only owners can kick
    let role = sqlx::query_scalar::<_, EventRole>(
        "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2"
    )
    .bind(&event_id)
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if role != Some(EventRole::Owner) {
        return Err(AppError::Forbidden);
    }

    // Can't kick yourself
    if target_user_id == auth.user_id {
        return Err(AppError::BadRequest("Cannot kick yourself".into()));
    }

    sqlx::query("DELETE FROM event_members WHERE event_id = $1 AND user_id = $2")
        .bind(&event_id)
        .bind(&target_user_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}