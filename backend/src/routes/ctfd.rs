use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::routes::challenge_files::sync_ctfd_files;
use crate::state::AppState;
use crate::utils::now_ms;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/events/{event_id}/ctfd/config",
            get(get_config).put(set_config).delete(delete_config),
        )
        .route("/events/{event_id}/ctfd/scoreboard", get(scoreboard))
        .route("/events/{event_id}/ctfd/placement", get(placement))
        .route("/events/{event_id}/ctfd/challenges", get(challenges))
        .route("/events/{event_id}/ctfd/challenges/{ctfd_id}", get(challenge_detail))
        .route("/events/{event_id}/ctfd/import", post(import_challenges))
        .route("/events/{event_id}/ctfd/solves", get(solves))
}

#[derive(Serialize)]
struct CtfdConfigResponse {
    ctfd_url: String,
    auth_type: String,
    has_credential: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    test_ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    test_message: Option<String>,
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
    #[serde(default)]
    pub files: Vec<String>,
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
    ?
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

pub async fn ctfd_fetch(url: &str, auth_type: &str, credential: &str) -> Result<String, AppError> {
    let req = Client::new().get(url);
    let res = apply_auth(req, auth_type, credential)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CTFd unreachable: {}", e)))?;

    if res.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::BadRequest("CTFd returned 403 - the CTF may not have started or has ended yet".into()));
    }

    if !res.status().is_success() {
        return Err(AppError::Internal(format!("CTFd returned {}", res.status())));
    }

    let text = res.text().await?;

    // If auth fails then the server returns html
    if text.trim_start().starts_with('<') {
        return Err(AppError::BadRequest("Session cookie has expired - update it in the CTFd configuration".into()));
    }

    Ok(text)
}

pub async fn ctfd_fetch_challenge(ctfd_url: &str, auth_type: &str, credential: &str, ctfd_id: u64) -> Result<CtfdChallengeDetail, AppError> {
    let text = ctfd_fetch(&format!("{}/api/v1/challenges/{}", ctfd_url, ctfd_id), auth_type, credential).await?;
    let body = serde_json::from_str::<CtfdApiResponse<CtfdChallengeDetail>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?;
    Ok(body.data)
}

async fn require_member(user_id: &str, event_id: &str, state: &AppState) -> Result<(), AppError> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    ?;

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
    ?;

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
        test_ok: None,
        test_message: None,
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
    ?;

    let (test_ok, test_message) = match &body.credential {
        Some(cred) => match ctfd_fetch(&format!("{}/api/v1/challenges", url), &body.auth_type, cred).await {
            Ok(_) => (true, "Connected successfully".to_string()),
            Err(AppError::BadRequest(m)) => (false, m),
            Err(AppError::Internal(m)) => (false, m),
            Err(_) => (false, "Connection failed".to_string()),
        },
        None => (false, "No credential provided".to_string()),
    };

    Ok(Json(CtfdConfigResponse {
        ctfd_url: url,
        auth_type: body.auth_type,
        has_credential: body.credential.is_some(),
        test_ok: Some(test_ok),
        test_message: Some(test_message),
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
        ?;

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

    let detail = ctfd_fetch_challenge(&row.ctfd_url, &row.auth_type, &credential, ctfd_id).await?;

    let local_id: Option<String> = sqlx::query_scalar::<_, String>(
        "SELECT id FROM challenges WHERE event_id = $1 AND ctfd_id = $2 AND is_deleted = false",
    )
    .bind(&event_id)
    .bind(ctfd_id as i32)
    .fetch_optional(&state.db)
    .await?;

    if let Some(challenge_id) = local_id {
        sync_ctfd_files(
            &state.db,
            &challenge_id,
            &detail.name,
            &event_id,
            &row.ctfd_url,
            &row.auth_type,
            &credential,
            &detail.files,
        ).await;
    }

    Ok(Json(detail))
}

#[derive(Serialize)]
pub struct ImportResult {
    pub added: i32,
    pub updated: i32,
    pub skipped: i32,
}

async fn import_challenges(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<ImportResult>, AppError> {
    require_owner(&auth.user_id, &event_id, &state).await?;

    let row = get_ctfd_row(&event_id, &state).await?;
    let credential = row.credential.ok_or(AppError::BadRequest("No credential configured".into()))?;

    let event_name: String = sqlx::query_scalar::<_, String>("SELECT name FROM events WHERE id = $1")
        .bind(&event_id)
        .fetch_one(&state.db)
        .await?;

    tracing::info!("Starting to import challenges for {}", event_name);

    let text = ctfd_fetch(&format!("{}/api/v1/challenges", row.ctfd_url), &row.auth_type, &credential).await?;
    let list: Vec<CtfdChallenge> = serde_json::from_str::<CtfdApiResponse<Vec<CtfdChallenge>>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?
        .data;

    let existing: Vec<(String, i32, i32, String)> = sqlx::query_as(
        "SELECT id, ctfd_id, points, category FROM challenges
         WHERE event_id = $1 AND ctfd_id IS NOT NULL AND is_deleted = false",
    )
    .bind(&event_id)
    .fetch_all(&state.db)
    .await?;

    let existing_map: std::collections::HashMap<i32, (String, i32, String)> = existing
        .into_iter()
        .map(|(id, ctfd_id, points, category)| (ctfd_id, (id, points, category)))
        .collect();

    let mut added = 0;
    let mut updated = 0;
    let mut skipped = 0;

    for ch in list {
        let ctfd_id = ch.id as i32;

        if let Some((challenge_id, existing_points, existing_category)) = existing_map.get(&ctfd_id) {
            if *existing_points == ch.value && *existing_category == ch.category {
                skipped += 1;
                continue;
            }

            let now = now_ms();
            sqlx::query(
                "UPDATE challenges SET points = $1, category = $2, updated_at = $3 WHERE id = $4",
            )
            .bind(ch.value)
            .bind(&ch.category)
            .bind(now)
            .bind(challenge_id)
            .execute(&state.db)
            .await?;

            updated += 1;
            continue;
        }

        let detail = match ctfd_fetch_challenge(&row.ctfd_url, &row.auth_type, &credential, ch.id).await {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("CTFd detail fetch failed for {}: {:?}", ch.name, e);
                continue;
            }
        };

        let challenge_id = Uuid::new_v4().to_string();
        let note_id = Uuid::new_v4().to_string();
        let now = now_ms();

        sqlx::query(
            "INSERT INTO notes (id, title, updated_at, is_deleted) VALUES ($1, $2, $3, false)",
        )
        .bind(&note_id)
        .bind(&ch.name)
        .bind(now)
        .execute(&state.db)
        .await?;

        sqlx::query(
            "INSERT INTO challenges (id, event_id, title, category, points, url, created_at, updated_at, is_deleted, note_id, solved, flag, solved_by, solvers, description, ctfd_id, file_count)
             VALUES ($1, $2, $3, $4, $5, '', $6, $6, false, $7, false, null, null, '{}', $8, $9, 0)",
        )
        .bind(&challenge_id)
        .bind(&event_id)
        .bind(&ch.name)
        .bind(&detail.category)
        .bind(ch.value)
        .bind(now)
        .bind(&note_id)
        .bind(&detail.description)
        .bind(ctfd_id)
        .execute(&state.db)
        .await?;

        added += 1;

        if !detail.files.is_empty() {
            sync_ctfd_files(&state.db, &challenge_id, &ch.name, &event_id, &row.ctfd_url, &row.auth_type, &credential, &detail.files).await;
        }
    }

    tracing::info!("Imported {} new challenges for {}", added, event_name);

    Ok(Json(ImportResult { added, updated, skipped }))
}

async fn scoreboard(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<CtfdScoreboardEntry>>, AppError> {
    require_member(&auth.user_id, &event_id, &state).await?;
    let row = get_ctfd_row(&event_id, &state).await?;
    let credential = row.credential.ok_or(AppError::BadRequest("No credential configured".into()))?;

    let text = ctfd_fetch(&format!("{}/api/v1/scoreboard", row.ctfd_url), &row.auth_type, &credential).await?;
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

    let text = ctfd_fetch(&format!("{}/api/v1/challenges", row.ctfd_url), &row.auth_type, &credential).await?;
    let body = serde_json::from_str::<CtfdApiResponse<Vec<CtfdChallenge>>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?;

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

    let text = ctfd_fetch(&format!("{}/api/v1/submissions?type=correct", row.ctfd_url), &row.auth_type, &credential).await?;
    let body = serde_json::from_str::<CtfdApiResponse<Vec<CtfdSolve>>>(&text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &text[..text.len().min(300)])))?;

    Ok(Json(body.data))
}

#[derive(Deserialize)]
struct CtfdTeamMe {
    id: u64,
}

#[derive(Serialize, Clone)]
pub struct PlacementInfo {
    pos: u32,
    score: i64,
    above_gap: Option<i64>,
    below_gap: Option<i64>,
    team_count: u32,
}

async fn placement(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Option<PlacementInfo>>, AppError> {
    require_member(&auth.user_id, &event_id, &state).await?;

    let row = match get_ctfd_row(&event_id, &state).await {
        Ok(r) => r,
        Err(_) => return Ok(Json(None)),
    };
    let credential = match row.credential {
        Some(c) => c,
        None => return Ok(Json(None)),
    };

    let me_text = match ctfd_fetch(&format!("{}/api/v1/teams/me", row.ctfd_url), &row.auth_type, &credential).await {
        Ok(t) => t,
        Err(_) => return Ok(Json(None)),
    };
    let me: CtfdTeamMe = match serde_json::from_str::<CtfdApiResponse<CtfdTeamMe>>(&me_text) {
        Ok(b) => b.data,
        Err(_) => return Ok(Json(None)),
    };

    let board_text = ctfd_fetch(&format!("{}/api/v1/scoreboard", row.ctfd_url), &row.auth_type, &credential).await?;
    let entries = serde_json::from_str::<CtfdApiResponse<Vec<CtfdScoreboardEntry>>>(&board_text)
        .map_err(|e| AppError::Internal(format!("CTFd parse error: {} | body: {}", e, &board_text[..board_text.len().min(300)])))?
        .data;

    let idx = match entries.iter().position(|e| e.account_id == me.id) {
        Some(i) => i,
        None => return Ok(Json(None)),
    };

    let entry = &entries[idx];
    let above_gap = if idx > 0 { Some(entries[idx - 1].score - entry.score) } else { None };
    let below_gap = if idx + 1 < entries.len() { Some(entry.score - entries[idx + 1].score) } else { None };

    Ok(Json(Some(PlacementInfo {
        pos: entry.pos,
        score: entry.score,
        above_gap,
        below_gap,
        team_count: entries.len() as u32,
    })))
}
