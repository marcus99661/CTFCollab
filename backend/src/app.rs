use axum::body::Body;
use axum::http::Response as HttpResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};
use std::{fmt, time::Duration};
use tower_http::cors::CorsLayer;
use tower_http::trace::{DefaultMakeSpan, TraceLayer};
use tracing::{Level, Span};

use crate::routes::{auth, replication, yjs, api, ctf_importer, ctfd, images, invite};
use crate::state::AppState;

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

pub fn build_app(state: AppState) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_response(|res: &HttpResponse<Body>, latency: Duration, _span: &Span| {
            tracing::info!(
                status = %res.status(),
                latency = %LatencyFmt(latency),
                "request finished"
            );
        });

    // All routes -> to handlers
    let api = Router::new()
        .route("/health", get(health))
        .nest("/auth", auth::router())
        .merge(replication::router())
        .merge(yjs::router())
        //.merge(admin::router())
        .merge(api::router())
        .merge(ctf_importer::router())
        .merge(ctfd::router())
        .merge(images::router())
        .merge(invite::router());

    Router::new()
        .nest("/api", api)
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(trace)
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
            write!(f, "{:.2}s", d.as_secs_f64())
        }
    }
}
