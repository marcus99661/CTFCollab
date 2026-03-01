CREATE TABLE IF NOT EXISTS notes (
    id         TEXT    PRIMARY KEY,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL DEFAULT '',
    yjs_state  BYTEA,
    updated_at BIGINT  NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    points INT NOT NULL DEFAULT 0,
    url TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    BIGINT NOT NULL
);


CREATE INDEX IF NOT EXISTS notes_updated_idx
    ON notes (updated_at, id);

CREATE INDEX IF NOT EXISTS events_updated_idx
    ON events (updated_at, id);

CREATE INDEX IF NOT EXISTS challenges_event_idx
    ON challenges (event_id);

CREATE INDEX IF NOT EXISTS challenges_updated_idx
    ON challenges (updated_at, id);
