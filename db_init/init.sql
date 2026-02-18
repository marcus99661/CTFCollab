CREATE TABLE IF NOT EXISTS notes (
                                     id TEXT PRIMARY KEY,
                                     title TEXT NOT NULL,
                                     content TEXT NOT NULL,
                                     updated_at BIGINT NOT NULL,
                                     is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS notes_updated_idx
    ON notes (updated_at, id);

