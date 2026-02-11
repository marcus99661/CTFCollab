mod app;
mod config;
mod error;
mod routes;

use std::net::SocketAddr;

use app::build_app;
use config::AppConfig;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .init();

    let app = build_app();
    let config = AppConfig::from_env();
    let addr: SocketAddr = config.addr;
    tracing::info!(%addr, "server listening");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
