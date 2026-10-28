-- Sprint 9. Requires 0001, 0003, 0010, 0011 and 0012.
-- Upgrade the Sprint 6 review constraint without discarding history.
CREATE TABLE IF NOT EXISTS discovery_review_log_sprint9 (
 id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL REFERENCES discovery_items(id) ON DELETE RESTRICT,
 admin_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('approved','rejected','converted','duplicate')),
 previous_status TEXT NOT NULL,
 new_status TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO discovery_review_log_sprint9 SELECT * FROM discovery_review_log;
DROP TABLE discovery_review_log;
ALTER TABLE discovery_review_log_sprint9 RENAME TO discovery_review_log;
CREATE INDEX IF NOT EXISTS discovery_review_history ON discovery_review_log(item_id,created_at);
CREATE TABLE IF NOT EXISTS admin_users (
 admin_scope TEXT PRIMARY KEY,
 role TEXT NOT NULL CHECK(role IN ('super_admin','admin','moderator','readonly')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_audit_log (
 id TEXT PRIMARY KEY,
 admin_scope TEXT NOT NULL,
 action TEXT NOT NULL,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL,
 before_state TEXT NOT NULL DEFAULT '{}',
 after_state TEXT NOT NULL DEFAULT '{}',
 ip_hash TEXT NOT NULL,
 user_agent_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS admin_audit_recent ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target ON admin_audit_log(target_type,target_id,created_at DESC);
CREATE TABLE IF NOT EXISTS feature_flags (
 key TEXT PRIMARY KEY,
 description TEXT NOT NULL DEFAULT '',
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 rollout_percentage INTEGER NOT NULL DEFAULT 100 CHECK(rollout_percentage BETWEEN 0 AND 100),
 allowed_scopes TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_scopes)),
 updated_by TEXT NOT NULL DEFAULT 'system',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS system_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL CHECK(json_valid(value)),
 updated_by TEXT NOT NULL DEFAULT 'system',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS operational_events (
 id TEXT PRIMARY KEY,
 event_type TEXT NOT NULL,
 status TEXT NOT NULL,
 duration_ms INTEGER,
 count INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS operational_event_recent ON operational_events(event_type,created_at DESC);
CREATE TABLE IF NOT EXISTS admin_bulk_previews (
 id TEXT PRIMARY KEY,
 admin_scope TEXT NOT NULL,
 target_type TEXT NOT NULL,
 action TEXT NOT NULL,
 ids_json TEXT NOT NULL CHECK(json_valid(ids_json)),
 options_json TEXT NOT NULL CHECK(json_valid(options_json)),
 fingerprint TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS admin_bulk_previews_expiry ON admin_bulk_previews(admin_scope,expires_at);
ALTER TABLE api_keys ADD COLUMN expires_at TEXT;
ALTER TABLE partner_webhooks ADD COLUMN revoked_at TEXT;
INSERT OR IGNORE INTO feature_flags(key,description,enabled,rollout_percentage) VALUES
 ('discovery_automation_enabled','Aktifkan ingestion discovery',1,100),
 ('wallet_scan_enabled','Aktifkan wallet read-only scan',1,100),
 ('public_api_enabled','Aktifkan API publik',1,100),
 ('partner_webhooks_enabled','Aktifkan pengiriman webhook',1,100),
 ('telegram_alerts_enabled','Aktifkan alert Telegram',1,100),
 ('maintenance_mode','Dikelola melalui system_settings.maintenance_mode',0,100);
INSERT OR IGNORE INTO system_settings(key,value) VALUES('maintenance_mode','"normal"'),('webhook_failure_threshold','0.1'),('discovery_lag_warning_minutes','240');
INSERT OR IGNORE INTO am_core_schema(version) VALUES(9);
