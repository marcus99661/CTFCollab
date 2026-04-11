mod app;
mod config;
mod ctfd_poller;
mod error;
mod models;
mod routes;
mod services;
mod state;

use std::net::SocketAddr;

use app::build_app;
use config::AppConfig;
use state::AppState;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .init();

    let cfg = AppConfig::from_env();
    let state = AppState::new(&cfg).await.unwrap();
    routes::yjs::start_compaction(state.db.clone());
    ctfd_poller::start_poller(state.db.clone());
    let app = build_app(state);
    let addr: SocketAddr = AppConfig::from_env().addr;
    tracing::info!(%addr, "server listening");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
