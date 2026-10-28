-- Sprint 5: additive, requires migrations 0005 and 0008; never edits legacy am_* data.
CREATE TABLE IF NOT EXISTS user_campaign_subscriptions (
 user_scope TEXT NOT NULL CHECK(user_scope GLOB 'tg:[0-9]*'),
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_scope,campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_campaign ON user_campaign_subscriptions(campaign_id);
CREATE TABLE IF NOT EXISTS user_portfolio_snapshots (
 user_scope TEXT PRIMARY KEY CHECK(user_scope GLOB 'tg:[0-9]*'),
 summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
 signature TEXT NOT NULL,
 generated_at INTEGER NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_export_jobs (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL CHECK(user_scope GLOB 'tg:[0-9]*'),
 format TEXT NOT NULL CHECK(format IN ('markdown','csv','json')),
 status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('queued','running','completed','failed')),
 offset INTEGER NOT NULL DEFAULT 0, row_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_export_scope ON portfolio_export_jobs(user_scope,created_at DESC);
CREATE TABLE IF NOT EXISTS backup_metadata (
 backup_id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL CHECK(user_scope GLOB 'tg:[0-9]*'),
 kind TEXT NOT NULL CHECK(kind IN ('user','server','pre_restore')),
 object_key TEXT NOT NULL UNIQUE,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>=0 AND size_bytes<=524288),
 schema_version INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ready','expired','failed')),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 period TEXT,
 UNIQUE(user_scope,kind,period)
);
CREATE INDEX IF NOT EXISTS idx_backup_scope ON backup_metadata(user_scope,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_expiry ON backup_metadata(status,expires_at);
ALTER TABLE alert_preferences ADD COLUMN weekly_enabled INTEGER NOT NULL DEFAULT 1 CHECK(weekly_enabled IN (0,1));
ALTER TABLE alert_preferences ADD COLUMN weekly_timezone TEXT DEFAULT NULL;
CREATE TABLE IF NOT EXISTS weekly_report_deliveries (
 user_scope TEXT NOT NULL CHECK(user_scope GLOB 'tg:[0-9]*'),
 week_start TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('sending','sent','skipped','failed')),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_scope,week_start)
);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(9);
