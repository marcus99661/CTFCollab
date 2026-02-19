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

        init_db(&db).await?;

        Ok(Self { db })
    }
}

async fn init_db(db: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            updated_at BIGINT NOT NULL,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE
        )
        "#,
    )
        .execute(db)
        .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS notes_updated_idx
        ON notes (updated_at, id)
        "#,
    )
        .execute(db)
        .await?;

    Ok(())
}
