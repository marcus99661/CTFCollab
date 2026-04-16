use axum::{extract::{Path, State}, routing::{delete, get, post}, Json, Router};
use bcrypt;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use crate::utils::now_ms;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/profile", get(get_profile).delete(delete_account)) // Get profile, delete profile
        .route("/profile/password", post(change_password)) // Change password
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
    ?;

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
    ?;

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
    ?;

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
    ?
    .ok_or(AppError::BadRequest("User not found".into()))?;

    let already_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)"
    )
    .bind(&event_id)
    .bind(&user.0)
    .fetch_one(&state.db)
    .await
    ?;

    if already_member {
        return Err(AppError::BadRequest("User is already a member".into()));
    }

    let now = now_ms();

    sqlx::query(
        "INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES ($1, $2, 'member', $3)"
    )
    .bind(&event_id)
    .bind(&user.0)
    .bind(now)
    .execute(&state.db)
    .await
    ?;

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
    ?;

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
        ?;

    Ok(())
}

#[derive(Serialize)]
struct ProfileResponse {
    username: String,
}

async fn get_profile(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Json<ProfileResponse>, AppError> {
    let username = sqlx::query_scalar::<_, String>("SELECT name FROM users WHERE id = $1")
        .bind(&auth.user_id)
        .fetch_optional(&state.db)
        .await
        ?
        .ok_or(AppError::Unauthorized)?;

    Ok(Json(ProfileResponse { username }))
}

#[derive(Deserialize)]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

async fn change_password(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<(), AppError> {
    if body.new_password.is_empty() {
        return Err(AppError::BadRequest("New password cannot be empty".into()));
    }

    if body.new_password.len() > 128 {
        return Err(AppError::BadRequest("Password is too long".into()));
    }

    let hash = sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = $1")
        .bind(&auth.user_id)
        .fetch_optional(&state.db)
        .await
        ?
        .ok_or(AppError::Unauthorized)?;

    if bcrypt::verify(&body.current_password, &hash).unwrap_or(false) == false {
        return Err(AppError::BadRequest("Current password is incorrect".into()));
    }

    let new_hash = bcrypt::hash(&body.new_password, bcrypt::DEFAULT_COST)
        ?;

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_hash)
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    Ok(())
}

#[derive(Deserialize)]
struct DeleteAccountRequest {
    password: String,
}

async fn delete_account(
    auth: AuthUser,
    State(state): State<AppState>,
    Json(body): Json<DeleteAccountRequest>,
) -> Result<(), AppError> {
    let hash = sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = $1")
        .bind(&auth.user_id)
        .fetch_optional(&state.db)
        .await
        ?
        .ok_or(AppError::Unauthorized)?;

    if bcrypt::verify(&body.password, &hash).unwrap_or(false) == false {
        return Err(AppError::BadRequest("Password is incorrect".into()));
    }

    let owns_event = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members em JOIN events e ON e.id = em.event_id WHERE em.user_id = $1 AND em.role = 'owner' AND e.is_deleted = false)"
    )
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await
    ?;

    if owns_event {
        return Err(AppError::BadRequest("You own one or more events. Delete them before deleting your account.".into()));
    }

    // Clean up soft-deleted events this user created (invites first, members cascade via FK)
    sqlx::query("DELETE FROM event_invites WHERE event_id IN (SELECT id FROM events WHERE created_by = $1)")
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    sqlx::query("DELETE FROM event_members WHERE event_id IN (SELECT id FROM events WHERE created_by = $1)")
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    sqlx::query("DELETE FROM events WHERE created_by = $1")
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    sqlx::query("DELETE FROM invite_joins WHERE user_id = $1")
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    sqlx::query("DELETE FROM event_members WHERE user_id = $1")
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(&auth.user_id)
        .execute(&state.db)
        .await
        ?;

    Ok(())
}