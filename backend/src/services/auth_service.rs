use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub username: String,
}

pub struct AuthService;

impl AuthService {
    pub fn login(req: LoginRequest) -> Result<AuthResponse, String> {
        if req.username == "admin" && req.password == "password" {
            Ok(AuthResponse {
                token: "mock-jwt-token".to_string(),
                username: req.username,
            })
        } else {
            Err("Invalid credentials".to_string())
        }
    }
}
