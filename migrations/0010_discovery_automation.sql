-- Sprint 6: private discovery intake; no feed item is public by default.
CREATE TABLE IF NOT EXISTS discovery_sources (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 source_type TEXT NOT NULL CHECK(source_type IN ('rss','atom','json_feed')),
 feed_url TEXT NOT NULL UNIQUE CHECK(feed_url LIKE 'https://%'),
 project_hint TEXT NOT NULL DEFAULT '',
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 trust_level TEXT NOT NULL DEFAULT 'low' CHECK(trust_level IN ('high','medium','low')),
 last_fetched_at TEXT,
 last_item_at TEXT,
 etag TEXT,
 last_modified TEXT,
 last_error TEXT,
 error_at TEXT,
 new_item_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS discovery_sources_due ON discovery_sources(enabled,last_fetched_at);
CREATE TABLE IF NOT EXISTS discovery_items (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL REFERENCES discovery_sources(id) ON DELETE RESTRICT,
 external_id TEXT,
 url TEXT NOT NULL UNIQUE CHECK(url LIKE 'https://%'),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 summary TEXT NOT NULL DEFAULT '' CHECK(length(summary)<=500),
 published_at TEXT,
 content_fingerprint TEXT NOT NULL UNIQUE,
 classification TEXT NOT NULL DEFAULT 'unknown' CHECK(classification IN ('airdrop','points','testnet','quest','claim','snapshot','unknown')),
 classification_confidence REAL NOT NULL DEFAULT 0 CHECK(classification_confidence BETWEEN 0 AND 1),
 status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','rejected','converted','duplicate','error')),
 campaign_id TEXT UNIQUE,
 rejection_reason TEXT,
 first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 reviewed_by TEXT,
 last_error TEXT,
 CHECK(status!='converted' OR campaign_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS discovery_items_external ON discovery_items(source_id,external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS discovery_items_review ON discovery_items(status,classification,published_at,classification_confidence);
CREATE INDEX IF NOT EXISTS discovery_items_source ON discovery_items(source_id,first_seen_at);
CREATE TABLE IF NOT EXISTS discovery_review_log (
 id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL REFERENCES discovery_items(id) ON DELETE RESTRICT,
 admin_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('approved','rejected','converted')),
 previous_status TEXT NOT NULL,
 new_status TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS discovery_review_history ON discovery_review_log(item_id,created_at);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(6);
