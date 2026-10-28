ALTER TABLE am_holdings ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE am_holdings ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE am_holdings ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE am_sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE am_sessions ADD COLUMN label TEXT NOT NULL DEFAULT 'Browser';
CREATE INDEX IF NOT EXISTS am_holdings_active ON am_holdings(user_id,archived,created_at);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(4);
