-- Sprint 4. Additive migration; depends on 0005_aggregator_core.sql.
CREATE TABLE IF NOT EXISTS campaign_quests (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 description TEXT NOT NULL DEFAULT '',
 quest_type TEXT NOT NULL CHECK(quest_type IN ('social','testnet_task','mainnet_task','bridge','swap','liquidity','governance','referral','kyc','custom')),
 verification_method TEXT NOT NULL CHECK(verification_method IN ('manual','wallet_activity','url_submission','admin_review','none')),
 points INTEGER NOT NULL DEFAULT 0 CHECK(points BETWEEN 0 AND 100000),
 weight REAL NOT NULL DEFAULT 1.0 CHECK(weight >= 0 AND weight <= 100),
 starts_at INTEGER, ends_at INTEGER,
 official_url TEXT CHECK(official_url IS NULL OR official_url LIKE 'https://%'),
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at)
);
CREATE INDEX IF NOT EXISTS idx_campaign_quests_campaign ON campaign_quests(campaign_id);
CREATE TABLE IF NOT EXISTS user_quest_progress (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL CHECK(user_scope GLOB 'tg:[0-9]*'),
 quest_id TEXT NOT NULL REFERENCES campaign_quests(id) ON DELETE CASCADE,
 wallet_address TEXT,
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','submitted','verified','failed','expired','not_applicable')),
 completed_at INTEGER,
 evidence_url TEXT CHECK(evidence_url IS NULL OR evidence_url LIKE 'https://%'),
 note TEXT NOT NULL DEFAULT '',
 points_awarded INTEGER NOT NULL DEFAULT 0 CHECK(points_awarded >= 0),
 updated_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(user_scope,quest_id,wallet_address)
);
-- SQLite UNIQUE treats NULL as distinct. This index closes that isolation/idempotency gap.
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_scope_wallet ON user_quest_progress(user_scope,quest_id,coalesce(wallet_address,''));
CREATE INDEX IF NOT EXISTS idx_progress_scope_status ON user_quest_progress(user_scope,status);
CREATE TABLE IF NOT EXISTS user_points_ledger (
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL CHECK(user_scope GLOB 'tg:[0-9]*'),
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 quest_id TEXT REFERENCES campaign_quests(id) ON DELETE SET NULL,
 wallet_address TEXT,
 points INTEGER NOT NULL,
 reason TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_scope_campaign ON user_points_ledger(user_scope,campaign_id);
CREATE INDEX IF NOT EXISTS idx_points_scope_time ON user_points_ledger(user_scope,created_at DESC,id DESC);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(8);
