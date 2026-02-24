use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::config::AppConfig;
use crate::routes::yjs::{new_rooms, Rooms};

#[derive(Clone)]
pub struct AppState {
    pub db:    PgPool,
    pub rooms: Rooms,
}

impl AppState {
    pub async fn new(cfg: &AppConfig) -> Result<Self, sqlx::Error> {
        let db = PgPoolOptions::new()
            .max_connections(10)
            .connect(&cfg.database_url)
            .await?;

        Ok(Self { db, rooms: new_rooms() })
    }
}
