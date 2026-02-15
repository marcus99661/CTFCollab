// backend/src/state.rs
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedNote {
    pub id: String,
    pub content: String,
    pub updated_at: i64, // unix millis
}

#[derive(Clone)]
pub struct AppState {
    pub note: Arc<RwLock<SharedNote>>,
    pub note_updates: broadcast::Sender<i64>,
}

impl AppState {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(64);

        let note = SharedNote {
            id: "shared".to_string(),
            content: "Hello! This is the shared note.".to_string(),
            updated_at: now_ms(),
        };

        Self {
            note: Arc::new(RwLock::new(note)),
            note_updates: tx,
        }
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    d.as_millis() as i64
}
