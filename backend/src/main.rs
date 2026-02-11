use axum::{
    extract::Path,
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Json, Router,
};
use axum::body::Body;
use axum::http::Response as HttpResponse;
use serde::Serialize;
use std::{fmt, net::SocketAddr, time::Duration};
use tower_http::trace::{DefaultMakeSpan, TraceLayer};
use tracing::{Level, Span};
use tracing_subscriber::EnvFilter;

#[derive(Debug)]
enum AppError {
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            AppError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
        };

        let body = Json(serde_json::json!({ "error": msg }));
        (status, body).into_response()
    }
}

#[derive(Debug, Serialize)]
struct FibResponse {
    n: u32,
    value: u64,
    compute_ms: u128,
    note: &'static str,
}

struct LatencyFmt(Duration);

impl fmt::Display for LatencyFmt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let d = self.0;

        if d < Duration::from_millis(1) {
            write!(f, "{}μs", d.as_micros())
        } else if d < Duration::from_secs(1) {
            write!(f, "{}ms", d.as_millis())
        } else {
            // show seconds with 2 decimals
            let secs = d.as_secs_f64();
            write!(f, "{:.2}s", secs)
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .init();

    // One log line per request, with dynamic latency unit
    let trace = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(|res: &HttpResponse<Body>, latency: Duration, _span: &Span| {
            tracing::info!(
                status = %res.status(),
                latency = %LatencyFmt(latency),
                "request finished"
            );
        });

    let app = Router::new()
        .route("/api/fib/{n}", get(fib_slow))
        .route("/ctfnote", get(serve_ctfnote))
        .layer(trace);

    let addr: SocketAddr = "127.0.0.1:3000".parse().unwrap();
    tracing::info!(%addr, "server listening");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn serve_ctfnote() -> Html<&'static str> {
    Html(include_str!("../main.html"))
}

async fn fib_slow(Path(n): Path<u32>) -> Result<Json<FibResponse>, AppError> {
    // Naive recursion gets slow fast; cap for safety.
    const MAX_N: u32 = 45;

    if n > MAX_N {
        return Err(AppError::BadRequest(format!("n too large (max {MAX_N})")));
    }

    let started = std::time::Instant::now();

    // CPU-heavy work off the async runtime threads
    let value = tokio::task::spawn_blocking(move || fib_naive(n))
        .await
        .map_err(|e| AppError::Internal(format!("task join error: {e}")))?;

    let compute_ms = started.elapsed().as_millis();

    Ok(Json(FibResponse {
        n,
        value,
        compute_ms,
        note: "naive recursion (slow on purpose)",
    }))
}

fn fib_naive(n: u32) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fib_naive(n - 1) + fib_naive(n - 2),
    }
}