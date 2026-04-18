use axum::{
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::routes::auth::AuthUser;
use crate::state::AppState;
use crate::utils::now_ms;

// 10 MiB per image
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

const ALLOWED_MIME: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/svg+xml",
];

#[derive(Serialize)]
struct UploadResponse {
    id: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/images", post(upload))
        .route("/images/{id}", get(serve))
}

async fn upload(
    auth: AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    let mut event_id: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut mime_type: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "eventId" => {
                event_id = Some(field.text().await.map_err(|_| {
                    AppError::BadRequest("invalid eventId field".into())
                })?);
            }
            "file" => {
                mime_type = field.content_type().map(|s| s.to_string());
                let data = field
                    .bytes()
                    .await
                    .map_err(|_| AppError::BadRequest("failed to read file".into()))?;
                if data.len() > MAX_IMAGE_BYTES {
                    return Err(AppError::BadRequest("image too large".into()));
                }
                file_bytes = Some(data.to_vec());
            }
            _ => {}
        }
    }

    let event_id = event_id.ok_or_else(|| AppError::BadRequest("eventId missing".into()))?;
    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("file missing".into()))?;
    let mime = mime_type.ok_or_else(|| AppError::BadRequest("content-type missing".into()))?;

    if !ALLOWED_MIME.contains(&mime.as_str()) {
        return Err(AppError::BadRequest(format!("unsupported mime: {mime}")));
    }

    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(&event_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden);
    }

    let id = format!("img_{}", Uuid::new_v4().simple());
    let size = bytes.len() as i32;

    sqlx::query(
        "INSERT INTO images (id, event_id, uploaded_by, mime_type, bytes, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&id)
    .bind(&event_id)
    .bind(&auth.user_id)
    .bind(&mime)
    .bind(&bytes[..])
    .bind(size)
    .bind(now_ms())
    .execute(&state.db)
    .await?;

    Ok(Json(UploadResponse { id }))
}

async fn serve(
    auth: AuthUser,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let row: Option<(String, Vec<u8>, String)> = sqlx::query_as::<_, (String, Vec<u8>, String)>(
        "SELECT mime_type, bytes, event_id FROM images WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?;

    let (mime, bytes, event_id) = match row {
        Some(r) => r,
        None => return Ok((StatusCode::NOT_FOUND, "not found").into_response()),
    };

    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2)",
    )
    .bind(&event_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if !is_member {
        return Err(AppError::Forbidden);
    }

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, mime.parse().unwrap());
    headers.insert(header::CACHE_CONTROL, "private, max-age=3600".parse().unwrap());
    Ok((headers, bytes).into_response())
}
