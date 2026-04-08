use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, put},
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/events/{event_id}/ctfd/config",
            get(get_config).put(set_config).delete(delete_config),
        )
        .route("/events/{event_id}/ctfd/scoreboard", get(scoreboard))
        .route("/events/{event_id}/ctfd/challenges", get(challenges))
        .route("/events/{event_id}/ctfd/challenges/{ctfd_id}", get(challenge_detail))
        .route("/events/{event_id}/ctfd/solves", get(solves))
}

#[derive(Serialize)]
struct CtfdConfigResponse {
    ctfd_url: String,
    auth_type: String,
    has_credential: bool,
}

#[derive(Deserialize)]
struct CtfdConfigInput {
    ctfd_url: String,
    credential: Option<String>,
    auth_type: String, // "token" or "cookie" TODO: Enum
}

#[derive(Deserialize, Serialize)]
pub struct CtfdScoreboardEntry {
    pub pos: u32,
    pub account_id: u64,
    pub name: String,
    pub score: i64,
}

#[derive(Deserialize, Serialize)]
pub struct CtfdChallenge {
    pub id: u64,
    pub name: String,
    pub value: i32,
    #[serde(default)]
    pub solves: i32,
    pub category: String,
}

#[derive(Deserialize, Serialize)]
pub struct CtfdSolve {
    pub id: u64,
    pub challenge: CtfdSolveChallenge,
    pub user: Option<CtfdAccount>,
    pub team: Option<CtfdAccount>,
    pub date: String,
}

#[derive(Deserialize, Serialize)]
pub struct CtfdSolveChallenge {
    pub id: u64,
    pub name: String,
    pub value: i32,
    #[serde(default)]
    pub category: String,
}

#[derive(Deserialize, Serialize)]
pub struct CtfdAccount {
    pub id: u64,
    pub name: String,
}

#[derive(Deserialize, Serialize)]
pub struct CtfdChallengeDetail {
    pub id: u64,
    pub name: String,
    pub value: i32,
    pub description: String,
    pub category: String,
    pub solved_by_me: bool,
}

#[derive(Deserialize)]
struct CtfdApiResponse<T> {
    data: T,
}

struct CtfdRow {
    ctfd_url: String,
    credential: Option<String>,
    auth_type: String,
}

async fn get_ctfd_row(event_id: &str, state: &AppState) -> Result<CtfdRow, AppError> {
    let row = sqlx::query_as::<_, (String, Option<String>, String)>(
        "SELECT ctfd_url, ctfd_credential, ctfd_auth_type FROM event_ctfd_config WHERE event_id = $1",
    )
    .bind(event_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
    .ok_or(AppError::BadRequest("CTFd not configured for this event".into()))?;

    Ok(CtfdRow { ctfd_url: row.0, credential: row.1, auth_type: row.2 })
}

fn apply_auth(req: reqwest::RequestBuilder, auth_type: &str, credential: &str) -> reqwest::RequestBuilder {
    if auth_type == "cookie" {
        req.header("Cookie", format!("session={}", credential))
    } else {
        req.header("Authorization", format!("Token {}", credential))
    }
}

async fn require_member(user_id: &str, event_id: &str, state: &AppState) -> Result<(), AppError> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if !is_member {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn require_owner(user_id: &str, event_id: &str, state: &AppState) -> Result<(), AppError> {
    let role = sqlx::query_scalar::<_, EventRole>(
        "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if role != Some(EventRole::Owner) {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn get_config(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<CtfdConfigResponse>, AppError> {
    require_owner(&auth.user_id, &event_id, &state).await?;
    let row = get_ctfd_row(&event_id, &state).await?;

    Ok(Json(CtfdConfigResponse {
        ctfd_url: row.ctfd_url,
        auth_type: row.auth_type,
        has_credential: row.credential.is_some(),
    }))
}

async fn set_config(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    Json(body): Json<CtfdConfigInput>,
) -> Result<Json<CtfdConfigResponse>, AppError> {
    require_owner(&auth.user_id, &event_id, &state).await?;

    if !body.ctfd_url.starts_with("http://") && !body.ctfd_url.starts_with("https://") {
        return Err(AppError::BadRequest("ctfd_url must start with http:// or https://".into()));
    }

    if body.auth_type != "token" && body.auth_type != "cookie" {
        return Err(AppError::BadRequest("auth_type must be 'token' or 'cookie'".into()));
    }

    let url = body.ctfd_url.trim_end_matches('/').to_string();

    sqlx::query(
        "INSERT INTO event_ctfd_config (event_id, ctfd_url, ctfd_credential, ctfd_auth_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_id) DO UPDATE SET ctfd_url = $2, ctfd_credential = $3, ctfd_auth_type = $4",
    )
    .bind(&event_id)
    .bind(&url)
    .bind(&body.credential)
    .bind(&body.auth_type)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(CtfdConfigResponse {
        ctfd_url: url,
        auth_type: body.auth_type,
        has_credential: body.credential.is_some(),
    }))
}

async fn delete_config(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<StatusCode, AppError> {
    require_owner(&auth.user_id, &event_id, &state).await?;

    sqlx::query("DELETE FROM event_ctfd_config WHERE event_id = $1")
        .bind(&event_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

async fn challenge_detail(
    auth: AuthUser,
    State(state): State<AppState>,
    Path((event_id, ctfd_id)): Path<(String, u64)>,
) -> Result<Json<CtfdChallengeDetail>, AppError> {
    require_member(&auth.user_id, &event_id, &state).await?;
    let row = get_ctfd_row(&event_id, &state).await?;
    let credential = row.credential.ok_or(AppError::BadRequest("No credential configured".into()))?;

    let req = Client::new().get(format!("{}/api/v1/challenges/{}", row.ctfd_url, ctfd_id));
    let res = apply_auth(req, &row.auth_type, &credential)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CTFd unreachable: {}", e)))?;

    if !res.status().is_success() {
        return Err(AppError::Internal(format!("CTFd returned {}", res.status())));
    }

    let text = res.text().await.map_err(|e| AppError::Internal(e.to_string()))?;
    let body = serde_json::from_str::<CtfdApiResponse<CtfdChallengeDetail>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?;

    Ok(Json(body.data))
}

async fn scoreboard(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<CtfdScoreboardEntry>>, AppError> {
    require_member(&auth.user_id, &event_id, &state).await?;
    let row = get_ctfd_row(&event_id, &state).await?;
    let credential = row.credential.ok_or(AppError::BadRequest("No credential configured".into()))?;

    let req = Client::new().get(format!("{}/api/v1/scoreboard", row.ctfd_url));
    let res = apply_auth(req, &row.auth_type, &credential)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CTFd unreachable: {}", e)))?;

    if !res.status().is_success() {
        return Err(AppError::Internal(format!("CTFd returned {}", res.status())));
    }

    let text = res.text().await.map_err(|e| AppError::Internal(e.to_string()))?;
    tracing::info!("CTFd scoreboard response: {}", text);

    let body = serde_json::from_str::<CtfdApiResponse<Vec<CtfdScoreboardEntry>>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?;

    Ok(Json(body.data))
}

async fn challenges(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<CtfdChallenge>>, AppError> {
    require_member(&auth.user_id, &event_id, &state).await?;
    let row = get_ctfd_row(&event_id, &state).await?;
    let credential = row.credential.ok_or(AppError::BadRequest("No credential configured".into()))?;

    let req = Client::new().get(format!("{}/api/v1/challenges", row.ctfd_url));
    let res = apply_auth(req, &row.auth_type, &credential)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CTFd unreachable: {}", e)))?;

    if !res.status().is_success() {
        return Err(AppError::Internal(format!("CTFd returned {}", res.status())));
    }

    let text = res.text().await.map_err(|e| AppError::Internal(e.to_string()))?;
    tracing::info!("CTFd challenges response: {}", text);

    let body = serde_json::from_str::<CtfdApiResponse<Vec<CtfdChallenge>>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} \n\n body: {}", e, &text[..text.len().min(300)])))?;

    Ok(Json(body.data))
}

async fn solves(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<CtfdSolve>>, AppError> {
    require_member(&auth.user_id, &event_id, &state).await?;
    let row = get_ctfd_row(&event_id, &state).await?;
    let credential = row.credential.ok_or(AppError::BadRequest("No credential configured".into()))?;

    let req = Client::new().get(format!("{}/api/v1/submissions?type=correct", row.ctfd_url));
    let res = apply_auth(req, &row.auth_type, &credential)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CTFd unreachable: {}", e)))?;

    if !res.status().is_success() {
        return Err(AppError::Internal(format!("CTFd returned {}", res.status())));
    }

    let text = res.text().await.map_err(|e| AppError::Internal(e.to_string()))?;
    tracing::info!("CTFd solves response: {}", text);

    let body = serde_json::from_str::<CtfdApiResponse<Vec<CtfdSolve>>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?;

    Ok(Json(body.data))
}
