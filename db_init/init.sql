CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    is_event_based BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TYPE event_role AS ENUM ('owner', 'member');

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(id),
    start_at BIGINT,
    end_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ctftime_id INTEGER,
    flag_format TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS event_members (
    event_id TEXT NOT NULL REFERENCES events(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role event_role NOT NULL DEFAULT 'member',
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    yjs_state BYTEA,
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
    note_id TEXT REFERENCES notes(id),
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    solved BOOLEAN NOT NULL DEFAULT FALSE,
    flag TEXT,
    solved_by TEXT,
    solvers TEXT[] NOT NULL DEFAULT '{}',
    description TEXT NOT NULL DEFAULT '',
    ctfd_id INTEGER,
    file_count INTEGER NOT NULL DEFAULT 0
);


CREATE TABLE IF NOT EXISTS event_invites (
    token TEXT PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE REFERENCES events(id),
    max_uses INTEGER,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at BIGINT,
    event_based BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_joins (
    token TEXT NOT NULL REFERENCES event_invites(token) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    joined_at BIGINT NOT NULL,
    PRIMARY KEY (token, user_id)
);

CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (updated_at, id);
CREATE INDEX IF NOT EXISTS events_updated_idx ON events (updated_at, id);
CREATE INDEX IF NOT EXISTS event_members_user_idx ON event_members (user_id);
CREATE INDEX IF NOT EXISTS challenges_event_idx ON challenges (event_id);
CREATE INDEX IF NOT EXISTS challenges_updated_idx ON challenges (updated_at, id);

CREATE TABLE IF NOT EXISTS event_ctfd_config (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    ctfd_url TEXT NOT NULL,
    ctfd_credential TEXT,
    ctfd_auth_type TEXT NOT NULL DEFAULT 'token'
);

CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    mime_type TEXT NOT NULL,
    bytes BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_event_idx ON images(event_id);

CREATE TABLE IF NOT EXISTS challenge_files (
    id TEXT PRIMARY KEY,
    challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    bytes BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT REFERENCES users(id),
    source TEXT NOT NULL DEFAULT 'user',
    ctfd_path TEXT,
    created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenge_files_challenge_idx ON challenge_files(challenge_id);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_files_ctfd_unique ON challenge_files(challenge_id, ctfd_path) WHERE ctfd_path IS NOT NULL;
