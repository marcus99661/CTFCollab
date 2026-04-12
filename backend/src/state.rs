use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::config::AppConfig;
use crate::routes::yjs::{new_rooms, Rooms};
use jsonwebtoken::{EncodingKey, DecodingKey};

// Shared variables used during runtime
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub rooms: Rooms,
    // JWT
    pub enc_key: EncodingKey,
    pub dec_key: DecodingKey,
}

impl AppState {
    pub async fn new(cfg: &AppConfig) -> Result<Self, sqlx::Error> {
        let db = PgPoolOptions::new()
            .max_connections(10)
            .connect(&cfg.database_url)
            .await?;

        Ok(Self {
            db,
            rooms: new_rooms(),
            enc_key: EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
            dec_key: DecodingKey::from_secret(cfg.jwt_secret.as_bytes()),
        })
    }
}
