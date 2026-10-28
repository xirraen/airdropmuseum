-- Sprint 8. Apply after 0011. Public reads require an explicit visibility flag and successful verification.
CREATE TABLE IF NOT EXISTS api_keys (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
 partner_scope TEXT NOT NULL DEFAULT '', tier TEXT NOT NULL CHECK(tier IN ('free','partner','internal')),
 rate_limit_per_minute INTEGER NOT NULL CHECK(rate_limit_per_minute BETWEEN 1 AND 600),
 daily_quota INTEGER NOT NULL CHECK(daily_quota BETWEEN 1 AND 1000000),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), revoked_at TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS api_keys_active ON api_keys(tier,enabled,revoked_at);
-- Request counts are aggregated per minute; no raw IP addresses or raw keys are stored.
CREATE TABLE IF NOT EXISTS api_usage_log (
 principal_hash TEXT NOT NULL, minute_bucket INTEGER NOT NULL,
 api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
 request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count>=0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(principal_hash,minute_bucket)
);
CREATE INDEX IF NOT EXISTS api_usage_daily ON api_usage_log(principal_hash,minute_bucket);
CREATE TABLE IF NOT EXISTS partner_webhooks (
 id TEXT PRIMARY KEY, api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
 url TEXT NOT NULL CHECK(url LIKE 'https://%'), events TEXT NOT NULL CHECK(json_valid(events)),
 secret_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 failure_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, disabled_at TEXT
);
CREATE INDEX IF NOT EXISTS partner_hooks_key ON partner_webhooks(api_key_id,enabled);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
 id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL REFERENCES partner_webhooks(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','retrying','delivered','dead')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 response_status INTEGER, error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_attempt_at TEXT, delivered_at TEXT, UNIQUE(webhook_id,event_id)
);
CREATE INDEX IF NOT EXISTS webhook_deliveries_pending ON webhook_deliveries(status,created_at);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(8);
