CREATE TABLE IF NOT EXISTS am_xp_accounts(user_id TEXT PRIMARY KEY,invite_code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS am_xp_referrals(invitee_id TEXT PRIMARY KEY,referrer_id TEXT NOT NULL,qualified_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(invitee_id!=referrer_id));
CREATE INDEX IF NOT EXISTS am_xp_referrer_idx ON am_xp_referrals(referrer_id);
CREATE TABLE IF NOT EXISTS am_xp_ledger(user_id TEXT NOT NULL,event_key TEXT NOT NULL,xp INTEGER NOT NULL CHECK(xp>0),kind TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,event_key));
CREATE INDEX IF NOT EXISTS am_xp_daily_idx ON am_xp_ledger(user_id,kind,created_at);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(2);
