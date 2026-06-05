use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use bcrypt;
use sqlx::PgPool;
use uuid::Uuid;
use crate::utils::now_ms;

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub confirm_password: String,
    pub email: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub username: String,
    pub user_id: String,
}

// Body of the JWT
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub event_based: bool,
}

const JWT_EXPIRY_SECS: usize = 7 * 24 * 60 * 60; // 7 days

pub struct AuthService;

impl AuthService {

    pub fn create_token(id: String, user: String, event_based: bool, enc_key: &EncodingKey) -> AuthResponse {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as usize;
        let claims = Claims {
            sub: id,
            exp: now + JWT_EXPIRY_SECS,
            event_based,
        };

        let user_id = claims.sub.clone();
        AuthResponse {
            token: jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &enc_key).unwrap(),
            username: user,
            user_id,
        }
    }

    pub async fn login(db: &PgPool, enc_key: &EncodingKey, req: LoginRequest) -> Result<AuthResponse, String> {
        if req.password.len() > 128 {
            return Err("Invalid credentials".to_string());
        }

        let user = sqlx::query_as::<_, crate::models::Users>(
            "SELECT id, name, email, password_hash, is_event_based FROM users WHERE name = $1"
        )
            .bind(&req.username)
            .fetch_optional(db)
            .await
            .map_err(|e| e.to_string())?;

        let user = match user {
            Some(u) => u,
            None => return Err("Invalid credentials".to_string()),
        };

        if !bcrypt::verify(&req.password, &user.password_hash).unwrap_or(false) {
            return Err("Invalid credentials".to_string())
        }

        Ok(Self::create_token(user.id, req.username, user.is_event_based, enc_key))
    }

    pub async fn register(db: &PgPool, enc_key: &EncodingKey, req: RegisterRequest) -> Result<AuthResponse, String> {
        if req.password.len() > 128 {
            return Err("Password is too long".to_string());
        }

        if req.password != req.confirm_password {
            return Err("Passwords are not the same".to_string());
        }

        let user = sqlx::query_as::<_, crate::models::Users>(
            "SELECT * FROM users WHERE name = $1"
        )
            .bind(&req.username)
            .fetch_optional(db)
            .await
            .map_err(|e| e.to_string())?;

        if user.is_some() {
            return Err("User already exists".to_string())
        }

        let id = Uuid::new_v4().to_string();

        let hash = bcrypt::hash(&req.password, bcrypt::DEFAULT_COST).unwrap().to_string();
        let now = now_ms();

        sqlx::query("INSERT INTO users (id, name, email, password_hash, created_at, is_event_based) VALUES ($1, $2, $3, $4, $5, FALSE)")
            .bind(&id)
            .bind(&req.username)
            .bind(&req.email)
            .bind(&hash)
            .bind(now)
            .execute(db)
            .await
            .map_err(|e| e.to_string())?;

        Ok(Self::create_token(id, req.username, false, enc_key))
    }
}
