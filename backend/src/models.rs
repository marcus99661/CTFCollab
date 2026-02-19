use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EventDoc {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeDoc {
    pub id: String,
    pub event_id: String,
    pub title: String,
    pub category: String,
    pub points: i32,
    pub url: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_deleted: bool,
}
