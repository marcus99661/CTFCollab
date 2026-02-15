use axum::body::Body;
use axum::http::Response as HttpResponse;
use axum::Router;
use std::{fmt, time::Duration};
use tower_http::trace::{DefaultMakeSpan, TraceLayer};
use tracing::{Level, Span};

use crate::replication;
//use crate::routes::api::{};
use crate::routes::auth;
use crate::state::AppState;
use tower_http::cors::CorsLayer;

pub fn build_app(state: AppState) -> Router {
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

    Router::new()
        //.route("/ctfnote", get(serve_ctfnote))
        .nest("/auth", auth::router())
        .merge(replication::router())
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
            // show seconds with 2 decimals
            let secs = d.as_secs_f64();
            write!(f, "{:.2}s", secs)
        }
    }
}
