use serde::Serialize;


#[derive(Debug, Serialize)]
pub struct FibResponse {
    n: u32,
    value: u64,
    compute_ms: u128,
    note: &'static str,
}
/*
pub async fn serve_ctfnote() -> Html<&'static str> {
    Html(include_str!("../../main.html"))
}
 */