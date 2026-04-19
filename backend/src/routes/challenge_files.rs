use axum::{
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::EventRole;
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use crate::utils::now_ms;

// 50 MiB per challenge file
const MAX_FILE_BYTES: usize = 50 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeFileInfo {
    pub id: String,
    pub challenge_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i32,
    pub source: String,
    pub uploaded_by: Option<String>,
    pub created_at: i64,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/challenges/{challenge_id}/files", get(list).post(upload))
        .route("/challenge-files/{id}", get(serve).delete(remove))
}

async fn challenge_event_id(db: &sqlx::PgPool, challenge_id: &str) -> Result<String, AppError> {
    let row: Option<String> = sqlx::query_scalar::<_, String>(
        "SELECT event_id FROM challenges WHERE id = $1",
    )
    .bind(challenge_id)
    .fetch_optional(db)
    .await?;
    row.ok_or_else(|| AppError::BadRequest("challenge not found".into()))
}

async fn require_member(db: &sqlx::PgPool, event_id: &str, user_id: &str) -> Result<(), AppError> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(event_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

pub async fn refresh_file_count(db: &sqlx::PgPool, challenge_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE challenges
         SET file_count = (SELECT COUNT(*) FROM challenge_files WHERE challenge_id = $1),
             updated_at = $2
         WHERE id = $1",
    )
    .bind(challenge_id)
    .bind(now_ms())
    .execute(db)
    .await?;

    Ok(())
}

async fn list(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
) -> Result<Json<Vec<ChallengeFileInfo>>, AppError> {
    let event_id = challenge_event_id(&state.db, &challenge_id).await?;
    require_member(&state.db, &event_id, &auth.user_id).await?;

    let rows: Vec<(String, String, String, String, i32, String, Option<String>, i64)> =
        sqlx::query_as(
            "SELECT id, challenge_id, filename, mime_type, size_bytes, source, uploaded_by, created_at
             FROM challenge_files WHERE challenge_id = $1 ORDER BY created_at ASC, id ASC",
        )
        .bind(&challenge_id)
        .fetch_all(&state.db)
        .await?;

    let files = rows
        .into_iter()
        .map(|(id, challenge_id, filename, mime_type, size_bytes, source, uploaded_by, created_at)| {
            ChallengeFileInfo { id, challenge_id, filename, mime_type, size_bytes, source, uploaded_by, created_at }
        })
        .collect();

    Ok(Json(files))
}

async fn upload(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(challenge_id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ChallengeFileInfo>, AppError> {
    let event_id = challenge_event_id(&state.db, &challenge_id).await?;
    require_member(&state.db, &event_id, &auth.user_id).await?;

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut mime_type: Option<String> = None;
    let mut filename: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();

        if name != "file" {
            continue;
        }

        filename = field.file_name().map(|s| s.to_string());
        mime_type = field.content_type().map(|s| s.to_string());

        let data = field
            .bytes()
            .await
            .map_err(|_| AppError::BadRequest("failed to read file".into()))?;

        if data.len() > MAX_FILE_BYTES {
            return Err(AppError::BadRequest("file too large".into()));
        }

        file_bytes = Some(data.to_vec());
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("file missing".into()))?;
    let filename = filename.unwrap_or_else(|| "file".to_string());
    let mime = mime_type.unwrap_or_else(|| "application/octet-stream".to_string());

    let id = format!("cf_{}", Uuid::new_v4().simple());
    let size = bytes.len() as i32;
    let now = now_ms();

    sqlx::query(
        "INSERT INTO challenge_files (id, challenge_id, event_id, filename, mime_type, bytes, size_bytes, uploaded_by, source, ctfd_path, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user', NULL, $9)",
    )
    .bind(&id)
    .bind(&challenge_id)
    .bind(&event_id)
    .bind(&filename)
    .bind(&mime)
    .bind(&bytes[..])
    .bind(size)
    .bind(&auth.user_id)
    .bind(now)
    .execute(&state.db)
    .await?;

    refresh_file_count(&state.db, &challenge_id).await?;

    Ok(Json(ChallengeFileInfo {
        id,
        challenge_id,
        filename,
        mime_type: mime,
        size_bytes: size,
        source: "user".into(),
        uploaded_by: Some(auth.user_id),
        created_at: now,
    }))
}

async fn serve(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let row: Option<(String, String, Vec<u8>, String)> = sqlx::query_as(
        "SELECT filename, mime_type, bytes, event_id FROM challenge_files WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?;

    let (filename, mime, bytes, event_id) = match row {
        Some(r) => r,
        None => return Ok((StatusCode::NOT_FOUND, "not found").into_response()),
    };

    require_member(&state.db, &event_id, &auth.user_id).await?;

    let disposition = format!("attachment; filename=\"{}\"", filename.replace('"', ""));

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, mime.parse().unwrap());
    headers.insert(header::CONTENT_DISPOSITION, disposition.parse().unwrap());
    headers.insert(header::CACHE_CONTROL, "private, max-age=3600".parse().unwrap());

    Ok((headers, bytes).into_response())
}

async fn remove(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let row: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT event_id, challenge_id, uploaded_by FROM challenge_files WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?;

    let (event_id, challenge_id, uploaded_by) = match row {
        Some(r) => r,
        None => return Ok(StatusCode::NO_CONTENT),
    };

    let role = sqlx::query_scalar::<_, EventRole>(
        "SELECT role FROM event_members WHERE event_id = $1 AND user_id = $2",
    )
    .bind(&event_id)
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await?;

    let is_owner = role == Some(EventRole::Owner);
    let is_uploader = uploaded_by.as_deref() == Some(auth.user_id.as_str());

    if !is_owner && !is_uploader {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM challenge_files WHERE id = $1")
        .bind(&id)
        .execute(&state.db)
        .await?;

    refresh_file_count(&state.db, &challenge_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn sync_ctfd_files(
    db: &sqlx::PgPool,
    challenge_id: &str,
    challenge_name: &str,
    event_id: &str,
    ctfd_url: &str,
    auth_type: &str,
    credential: &str,
    files: &[String],
) {
    let mut stored = 0;

    for path in files {
        tracing::info!("Requesting {} for challenge {}", path, challenge_name);

        match fetch_and_store_ctfd_file(db, challenge_id, event_id, ctfd_url, auth_type, credential, path).await {
            Ok(true) => stored += 1,
            Ok(false) => {}
            Err(e) => tracing::warn!("CTFd file pull failed for {} ({}): {}", path, challenge_name, e),
        }
    }

    if stored > 0 {
        if let Err(e) = refresh_file_count(db, challenge_id).await {
            tracing::warn!("refresh_file_count failed for {}: {}", challenge_id, e);
        }
    }
}

async fn fetch_and_store_ctfd_file(
    db: &sqlx::PgPool,
    challenge_id: &str,
    event_id: &str,
    ctfd_url: &str,
    auth_type: &str,
    credential: &str,
    path: &str,
) -> Result<bool, String> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM challenge_files WHERE challenge_id = $1 AND ctfd_path = $2)",
    )
    .bind(challenge_id)
    .bind(path)
    .fetch_one(db)
    .await
    .map_err(|e| e.to_string())?;

    if exists {
        return Ok(false);
    }

    let absolute = if path.starts_with("http://") || path.starts_with("https://") {
        path.to_string()
    } else if path.starts_with('/') {
        format!("{}{}", ctfd_url, path)
    } else {
        format!("{}/{}", ctfd_url, path)
    };

    let client = reqwest::Client::new();
    let req = client.get(&absolute);
    let req = if auth_type == "cookie" {
        req.header("Cookie", format!("session={}", credential))
    } else {
        req.header("Authorization", format!("Token {}", credential))
    };

    let res = req.send().await.map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("CTFd returned {}", res.status()));
    }

    let mime = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "application/octet-stream".into());

    let bytes = res.bytes().await.map_err(|e| e.to_string())?;

    if bytes.len() > MAX_FILE_BYTES {
        return Err("file exceeds server limit".into());
    }

    let filename = filename_from_url(&absolute);
    let id = format!("cf_{}", Uuid::new_v4().simple());
    let size = bytes.len() as i32;
    let now = now_ms();

    sqlx::query(
        "INSERT INTO challenge_files (id, challenge_id, event_id, filename, mime_type, bytes, size_bytes, uploaded_by, source, ctfd_path, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'ctfd', $8, $9)
         ON CONFLICT DO NOTHING",
    )
    .bind(&id)
    .bind(challenge_id)
    .bind(event_id)
    .bind(&filename)
    .bind(&mime)
    .bind(&bytes[..])
    .bind(size)
    .bind(path)
    .bind(now)
    .execute(db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(true)
}

fn filename_from_url(url: &str) -> String {
    let path = url.split('?').next().unwrap();
    let last = path.rsplit('/').next().unwrap();

    if last.is_empty() {
        "file".into()
    } else {
        last.to_string()
    }
}
