-- Sprint 11. Additive, personal-only notes. No public replication of these four tables.
CREATE TABLE IF NOT EXISTS claim_autopsies (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 wallet_address TEXT NOT NULL CHECK(length(wallet_address)=42),
 activity_before_snapshot INTEGER NOT NULL CHECK(activity_before_snapshot IN (0,1)),
 activity_after_snapshot INTEGER NOT NULL CHECK(activity_after_snapshot IN (0,1)),
 quest_count INTEGER NOT NULL CHECK(quest_count BETWEEN 0 AND 10000),
 chain_count INTEGER NOT NULL CHECK(chain_count BETWEEN 0 AND 100),
 gas_cost_usd REAL NOT NULL CHECK(gas_cost_usd>=0 AND gas_cost_usd<=10000000),
 bridge_cost_usd REAL NOT NULL CHECK(bridge_cost_usd>=0 AND bridge_cost_usd<=10000000),
 research_minutes INTEGER NOT NULL CHECK(research_minutes BETWEEN 0 AND 1000000),
 decision_source TEXT NOT NULL CHECK(decision_source IN ('official','community','aggregator','social','other','unknown')),
 outcome TEXT NOT NULL CHECK(outcome IN ('allocated','not_allocated','unknown')),
 hypothesis TEXT NOT NULL DEFAULT '',
 evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
 consent_to_analysis INTEGER NOT NULL DEFAULT 0 CHECK(consent_to_analysis IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_autopsy_user_date ON claim_autopsies(user_scope,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autopsy_optin ON claim_autopsies(user_scope,consent_to_analysis,created_at);
CREATE TABLE IF NOT EXISTS decision_entries (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL,
 primary_evidence_url TEXT NOT NULL CHECK(primary_evidence_url LIKE 'https://%'),
 decision_source TEXT NOT NULL CHECK(decision_source IN ('official','community','aggregator','social','other','unknown')),
 time_budget_minutes INTEGER NOT NULL CHECK(time_budget_minutes BETWEEN 0 AND 1000000),
 cost_ceiling_usd REAL NOT NULL CHECK(cost_ceiling_usd BETWEEN 0 AND 10000000),
 realistic_expectations TEXT NOT NULL,
 follow_status TEXT NOT NULL DEFAULT 'following' CHECK(follow_status='following'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_scope,campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_decisions_scope ON decision_entries(user_scope,created_at DESC);
CREATE TABLE IF NOT EXISTS outcome_reviews (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 decision_id TEXT NOT NULL UNIQUE REFERENCES decision_entries(id) ON DELETE CASCADE,
 outcome TEXT NOT NULL CHECK(outcome IN ('allocated','not_allocated','unknown')),
 lessons TEXT NOT NULL,
 reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outcome_scope ON outcome_reviews(user_scope,reviewed_at DESC);
CREATE TABLE IF NOT EXISTS user_pattern_snapshots (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL UNIQUE REFERENCES am_users(id) ON DELETE CASCADE,
 sample_size INTEGER NOT NULL CHECK(sample_size>=0),
 period_start TEXT,
 period_end TEXT,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(11);
