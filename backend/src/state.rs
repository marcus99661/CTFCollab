use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::config::AppConfig;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NoteDoc {
    pub id: String,
    pub title: String,
    pub content: String,
    pub updated_at: i64,
    pub is_deleted: bool,
}

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
}

impl AppState {
    pub async fn new(cfg: &AppConfig) -> Result<Self, sqlx::Error> {
        let db = PgPoolOptions::new()
            .max_connections(10)
            .connect(&cfg.database_url)
            .await?;

        Ok(Self { db })
    }
}
