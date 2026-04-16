use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "event_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum EventRole {
    Owner,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Users {
    pub id: String,
    pub name: String,
    pub email: String,
    pub password_hash: String,
    pub is_event_based: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EventMembers {
    pub event_id: String,
    pub user_id: String,
    pub role: EventRole,
    pub joined_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NoteDoc {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
    pub is_deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EventDoc {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_by: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_deleted: bool,
    pub start_at: Option<i64>,
    pub end_at: Option<i64>,
    pub ctftime_id: Option<i32>,
    #[serde(default)]
    pub flag_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeDoc {
    pub id: String,
    pub event_id: String,
    pub title: String,
    pub category: String, // TODO: Enum
    pub points: i32,
    pub url: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_deleted: bool,
    pub note_id: Option<String>,
    pub solved: bool,
    pub flag: Option<String>,
    pub solved_by: Option<String>,
    pub solvers: Vec<String>,
    #[serde(default)]
    pub description: String,
    pub ctfd_id: Option<i32>,
}

/*
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeType {
    pub id: String,
    pub chal_type: String,
    pub color: String,
}
 */