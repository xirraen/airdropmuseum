-- Sprint 7: verification never publishes or overwrites campaign payloads.
CREATE TABLE IF NOT EXISTS source_trust_profiles (
 id TEXT PRIMARY KEY,
 source_url TEXT NOT NULL UNIQUE CHECK(source_url LIKE 'https://%'),
 host TEXT NOT NULL,
 tier TEXT NOT NULL DEFAULT 'unknown' CHECK(tier IN ('primary_official','official_social','independent','community','unknown')),
 trust_score INTEGER NOT NULL DEFAULT 0 CHECK(trust_score BETWEEN 0 AND 100),
 etag TEXT, last_modified TEXT, last_fetched_at TEXT, content_hash TEXT,
 http_status INTEGER, last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_source_links (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 source_id TEXT NOT NULL REFERENCES source_trust_profiles(id) ON DELETE RESTRICT,
 source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
 registered_by TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 linked_from_official INTEGER NOT NULL DEFAULT 0 CHECK(linked_from_official IN (0,1)),
 official_domain_verified INTEGER NOT NULL DEFAULT 0 CHECK(official_domain_verified IN (0,1)),
 explorer_approved INTEGER NOT NULL DEFAULT 0 CHECK(explorer_approved IN (0,1)),
 declared_metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(declared_metadata)),
 extracted_metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(extracted_metadata)),
 not_applicable TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(not_applicable)),
 observed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(campaign_id,source_id)
);
CREATE INDEX IF NOT EXISTS trust_links_by_campaign ON campaign_source_links(campaign_id,enabled,updated_at);
CREATE TABLE IF NOT EXISTS source_conflicts (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 field TEXT NOT NULL, value_a TEXT NOT NULL, source_a TEXT NOT NULL REFERENCES source_trust_profiles(id),
 value_b TEXT NOT NULL, source_b TEXT NOT NULL REFERENCES source_trust_profiles(id),
 severity TEXT NOT NULL CHECK(severity IN ('material','minor','informational')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','ignored')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 closed_at TEXT, closed_by TEXT, reason TEXT
);
CREATE INDEX IF NOT EXISTS trust_open_conflicts ON source_conflicts(campaign_id,status,severity);
CREATE TABLE IF NOT EXISTS verification_runs (
 id TEXT PRIMARY KEY, run_key TEXT NOT NULL UNIQUE,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 trigger_type TEXT NOT NULL CHECK(trigger_type IN ('manual','scheduled')),
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','complete','failed')),
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT,
 confidence_label TEXT NOT NULL DEFAULT 'needs_review',
 result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)),
 changes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(changes_json)),
 error_code TEXT
);
CREATE INDEX IF NOT EXISTS trust_runs_by_campaign ON verification_runs(campaign_id,started_at DESC);
CREATE TABLE IF NOT EXISTS trust_audit_log (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT NOT NULL,
 previous_state TEXT NOT NULL DEFAULT '', new_state TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS trust_audit_target ON trust_audit_log(target_type,target_id,created_at);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(7);
