CREATE TABLE IF NOT EXISTS am_core_schema (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS am_core_exhibits (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)),
 source_url TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'unreviewed',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS am_core_user_state (
 user_id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(1);
