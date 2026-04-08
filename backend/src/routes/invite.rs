use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::error::AppError;
use crate::routes::auth::AuthUser;
use crate::services::auth_service::{AuthService, AuthResponse};
use crate::state::AppState;

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn generate_token() -> String {
    Uuid::new_v4().to_string().replace('-', "").chars().take(10).collect()
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct EventInvite {
    pub token: String,
    pub event_id: String,
    pub max_uses: Option<i32>,
    pub uses: i32,
    pub expires_at: Option<i64>,
    pub event_based: bool,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct InviteInfo {
    pub event_id: String,
    pub event_name: String,
    pub event_based: bool,
    pub expires_at: Option<i64>,
    pub uses: i32,
    pub max_uses: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct InviteJoin {
    pub username: String,
    pub joined_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateInviteBody {
    pub max_uses: Option<i32>,
    pub expires_in_minutes: Option<i64>,
    pub event_based: bool,
}

#[derive(Debug, Deserialize)]
pub struct RegisterViaInviteBody {
    pub username: String,
    pub email: String,
    pub password: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/events/{id}/invite", get(get_invite))
        .route("/events/{id}/invite", post(create_invite))
        .route("/events/{id}/invite", delete(delete_invite))
        .route("/events/{id}/invite/joins", get(get_joins))
        .route("/invite/{token}", get(get_invite_info))
        .route("/invite/{token}/join", post(join_via_invite))
        .route("/invite/{token}/register", post(register_via_invite))
}

async fn require_owner(db: &sqlx::PgPool, event_id: &str, user_id: &str) -> Result<(), AppError> {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2 AND role = 'owner')"
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if !is_owner { Err(AppError::Forbidden) } else { Ok(()) }
}

fn validate_invite(invite: &EventInvite) -> Result<(), AppError> {
    if let Some(exp) = invite.expires_at {
        if exp < now_ms() {
            return Err(AppError::BadRequest("Invite has expired".into()));
        }
    }
    if let Some(max) = invite.max_uses {
        if invite.uses >= max {
            return Err(AppError::BadRequest("Invite has reached its usage limit".into()));
        }
    }
    Ok(())
}

async fn get_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Option<EventInvite>>, AppError> {
    require_owner(&state.db, &event_id, &auth.user_id).await?;

    let invite = sqlx::query_as::<_, EventInvite>(
        "SELECT token, event_id, max_uses, uses, expires_at, event_based, created_at FROM event_invites WHERE event_id = $1"
    )
    .bind(&event_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(invite))
}

async fn create_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    Json(body): Json<CreateInviteBody>,
) -> Result<Json<EventInvite>, AppError> {
    require_owner(&state.db, &event_id, &auth.user_id).await?;

    let existing = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_invites WHERE event_id = $1)"
    )
    .bind(&event_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if existing {
        return Err(AppError::BadRequest("An invite already exists for this event".into()));
    }

    let token = generate_token();
    let expires_at = body.expires_in_minutes.map(|m| now_ms() + m * 60 * 1000);
    let now = now_ms();

    let invite = sqlx::query_as::<_, EventInvite>(
        "INSERT INTO event_invites (token, event_id, max_uses, uses, expires_at, event_based, created_at)
         VALUES ($1, $2, $3, 0, $4, $5, $6)
         RETURNING token, event_id, max_uses, uses, expires_at, event_based, created_at"
    )
    .bind(&token)
    .bind(&event_id)
    .bind(body.max_uses)
    .bind(expires_at)
    .bind(body.event_based)
    .bind(now)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(invite))
}

async fn delete_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<(), AppError> {
    require_owner(&state.db, &event_id, &auth.user_id).await?;

    sqlx::query("DELETE FROM event_invites WHERE event_id = $1")
        .bind(&event_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

async fn get_joins(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<InviteJoin>>, AppError> {
    require_owner(&state.db, &event_id, &auth.user_id).await?;

    let joins = sqlx::query_as::<_, (String, i64)>(
        "SELECT u.name, ij.joined_at
         FROM invite_joins ij
         JOIN event_invites ei ON ei.token = ij.token
         JOIN users u ON u.id = ij.user_id
         WHERE ei.event_id = $1
         ORDER BY ij.joined_at ASC"
    )
    .bind(&event_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(joins.into_iter().map(|(username, joined_at)| InviteJoin { username, joined_at }).collect()))
}

async fn get_invite_info(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Json<InviteInfo>, AppError> {
    let row = sqlx::query_as::<_, (String, String, bool, Option<i64>, i32, Option<i32>)>(
        "SELECT e.id, e.name, ei.event_based, ei.expires_at, ei.uses, ei.max_uses
         FROM event_invites ei
         JOIN events e ON e.id = ei.event_id
         WHERE ei.token = $1"
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or_else(|| AppError::BadRequest("Invite not found".into()))?;

    let invite = EventInvite {
        token: token.clone(),
        event_id: row.0.clone(),
        event_based: row.2,
        expires_at: row.3,
        uses: row.4,
        max_uses: row.5,
        created_at: 0,
    };
    validate_invite(&invite)?;

    Ok(Json(InviteInfo {
        event_id: row.0,
        event_name: row.1,
        event_based: row.2,
        expires_at: row.3,
        uses: row.4,
        max_uses: row.5,
    }))
}

async fn join_via_invite(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<(), AppError> {
    let invite = sqlx::query_as::<_, EventInvite>(
        "SELECT token, event_id, max_uses, uses, expires_at, event_based, created_at FROM event_invites WHERE token = $1"
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or_else(|| AppError::BadRequest("Invite not found".into()))?;

    validate_invite(&invite)?;

    let already_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)"
    )
    .bind(&invite.event_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if already_member {
        return Ok(());
    }

    let now = now_ms();

    sqlx::query(
        "INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES ($1, $2, 'member', $3)"
    )
    .bind(&invite.event_id)
    .bind(&auth.user_id)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query("UPDATE event_invites SET uses = uses + 1 WHERE token = $1")
        .bind(&token)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query("INSERT INTO invite_joins (token, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING")
        .bind(&token)
        .bind(&auth.user_id)
        .bind(now)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

async fn register_via_invite(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(body): Json<RegisterViaInviteBody>,
) -> Result<Json<AuthResponse>, AppError> {
    let invite = sqlx::query_as::<_, EventInvite>(
        "SELECT token, event_id, max_uses, uses, expires_at, event_based, created_at FROM event_invites WHERE token = $1"
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or_else(|| AppError::BadRequest("Invite not found".into()))?;

    validate_invite(&invite)?;

    let (name_taken, email_taken) = sqlx::query_as::<_, (bool, bool)>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE name = $1), EXISTS(SELECT 1 FROM users WHERE email = $2)"
    )
    .bind(&body.username)
    .bind(&body.email)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if name_taken {
        return Err(AppError::BadRequest("Username already taken".into()));
    }
    if email_taken {
        return Err(AppError::BadRequest("Email already in use".into()));
    }

    let user_id = Uuid::new_v4().to_string();
    let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let now = now_ms();

    sqlx::query(
        "INSERT INTO users (id, name, email, password_hash, created_at, is_event_based) VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&user_id)
    .bind(&body.username)
    .bind(&body.email)
    .bind(&hash)
    .bind(now_secs())
    .bind(invite.event_based)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query(
        "INSERT INTO event_members (event_id, user_id, role, joined_at) VALUES ($1, $2, 'member', $3)"
    )
    .bind(&invite.event_id)
    .bind(&user_id)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query("UPDATE event_invites SET uses = uses + 1 WHERE token = $1")
        .bind(&token)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    sqlx::query("INSERT INTO invite_joins (token, user_id, joined_at) VALUES ($1, $2, $3)")
        .bind(&token)
        .bind(&user_id)
        .bind(now)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(AuthService::create_token(user_id, body.username, invite.event_based, &state.enc_key)))
}