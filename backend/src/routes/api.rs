use axum::{extract::Path, response::Html, Json};
use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct FibResponse {
    n: u32,
    value: u64,
    compute_ms: u128,
    note: &'static str,
}

pub async fn serve_ctfnote() -> Html<&'static str> {
    Html(include_str!("../../main.html"))
}

pub async fn fib_slow(Path(n): Path<u32>) -> Result<Json<FibResponse>, AppError> {
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
