use std::net::SocketAddr;

pub struct AppConfig {
    pub addr: SocketAddr,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let raw = std::env::var("APP_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".to_string());
        let addr = raw
            .parse()
            .unwrap_or_else(|_| "127.0.0.1:3000".parse().unwrap());

        Self { addr }
    }
}
