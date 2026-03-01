use std::net::SocketAddr;

pub struct AppConfig {
    pub addr: SocketAddr,
    pub database_url: String,
    pub jwt_secret: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let raw = std::env::var("APP_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
        let jwt_secret = std::env::var("APP_SECRET").unwrap_or_else(|_| "SUPERSecretJWT".to_string());
        let addr = raw
            .parse()
            .unwrap_or_else(|_| "127.0.0.1:3000".parse().unwrap());

        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://ctf:mysecretpassword@localhost:5432/ctfpad".to_string());

        Self { addr, database_url, jwt_secret }
    }
}
