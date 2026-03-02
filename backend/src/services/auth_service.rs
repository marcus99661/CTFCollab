use jsonwebtoken::{EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use bcrypt;
use sqlx::PgPool;
use uuid::Uuid;

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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub struct AuthService;

impl AuthService {

    fn create_token(user: String, enc_key: &EncodingKey) -> AuthResponse {
        let claims = Claims {
            sub: user,
            exp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as usize + 7 * 24 * 60 * 60
        };

        AuthResponse {
            token: jsonwebtoken::encode(&Header::default(), &claims, &enc_key).unwrap(),
        }
    }

    pub async fn login(db: &PgPool, enc_key: &EncodingKey, req: LoginRequest) -> Result<AuthResponse, String> {
        let user = sqlx::query_as::<_, crate::models::Users>(
            "SELECT id, name, email, password_hash FROM users WHERE name = $1"
        )
            .bind(&req.username)
            .fetch_optional(db)
            .await
            .map_err(|e| e.to_string())?;

        let user = match user {
            Some(u) => u,
            None => return Err("Invalid credentials".to_string()),
        };

        if bcrypt::verify(&req.password, &user.password_hash).is_err()  {
            return Err("Invalid password".to_string())
        }

        Ok(Self::create_token(user.id, enc_key))
    }

    pub async fn register(db: &PgPool, enc_key: &EncodingKey, req: RegisterRequest) -> Result<AuthResponse, String> {
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

        sqlx::query("INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)")
            .bind(&id)
            .bind(&req.username)
            .bind(&req.email)
            .bind(&hash)
            .bind(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64)
            .execute(db)
            .await
            .map_err(|e| e.to_string())?;

        Ok(Self::create_token(id, enc_key))
    }
}
