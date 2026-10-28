-- Additive migration: all legacy am_* records remain intact.
CREATE TABLE campaigns (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, project_id TEXT NOT NULL,
 chain TEXT NOT NULL CHECK(json_valid(chain)), category TEXT NOT NULL CHECK(category IN ('token_airdrop','points','testnet','nft','retroactive')),
 status TEXT NOT NULL CHECK(status IN ('confirmed','rumored','speculative','expired','archived')),
 official_urls TEXT NOT NULL CHECK(json_valid(official_urls) AND json_array_length(official_urls)>0), description TEXT NOT NULL,
 eligibility_rules TEXT NOT NULL CHECK(json_valid(eligibility_rules)), snapshot_at TEXT, activity_start_at TEXT, activity_end_at TEXT, claim_opens_at TEXT, claim_deadline_at TEXT,
 risk_flags TEXT NOT NULL, source_evidence TEXT NOT NULL, reward_type TEXT NOT NULL DEFAULT '', gas_cost_estimate REAL, kyc_requirement TEXT NOT NULL DEFAULT 'unknown', estimated_effort REAL NOT NULL DEFAULT 0,
 claim_endpoint TEXT, distributor TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_verified_at TEXT NOT NULL
);
CREATE INDEX campaigns_schedule ON campaigns(status,claim_deadline_at,snapshot_at);
CREATE TABLE campaign_sources (id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),source_type TEXT NOT NULL CHECK(source_type IN ('official_docs','official_blog','contract','explorer','community','news')),captured_at TEXT NOT NULL,note TEXT NOT NULL,verified_by TEXT NOT NULL CHECK(verified_by IN ('system','user')),event_type TEXT NOT NULL DEFAULT 'research',content_hash TEXT);
CREATE INDEX campaign_sources_timeline ON campaign_sources(campaign_id,captured_at);
CREATE TABLE wallet_watchlist (id TEXT PRIMARY KEY,user_id TEXT NOT NULL CHECK(user_id GLOB 'tg:[0-9]*'),chain TEXT NOT NULL,address TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,last_scan_at TEXT,UNIQUE(user_id,chain,address));
CREATE INDEX watchlist_scan ON wallet_watchlist(last_scan_at,id);
CREATE TABLE wallet_snapshots (id TEXT PRIMARY KEY,wallet_id TEXT NOT NULL REFERENCES wallet_watchlist(id) ON DELETE CASCADE,balance TEXT,protocol_activity TEXT NOT NULL DEFAULT '[]',payload TEXT NOT NULL,scanned_at TEXT NOT NULL);
CREATE INDEX wallet_snapshots_wallet ON wallet_snapshots(wallet_id,scanned_at);
CREATE TABLE eligibility_results (id TEXT PRIMARY KEY,wallet_id TEXT NOT NULL REFERENCES wallet_watchlist(id) ON DELETE CASCADE,campaign_id TEXT NOT NULL REFERENCES campaigns(id),rule_id TEXT NOT NULL,rule_type TEXT NOT NULL,parameters TEXT NOT NULL,evaluation_status TEXT NOT NULL CHECK(evaluation_status IN ('passed','failed','action_required','manual_check','unknown')),evaluated_at TEXT NOT NULL,evidence_refs TEXT NOT NULL,human_reason TEXT NOT NULL);
CREATE INDEX eligibility_wallet ON eligibility_results(wallet_id,campaign_id,evaluated_at);
CREATE TABLE claim_checks (id TEXT PRIMARY KEY,wallet_id TEXT NOT NULL REFERENCES wallet_watchlist(id) ON DELETE CASCADE,campaign_id TEXT NOT NULL REFERENCES campaigns(id),status TEXT NOT NULL CHECK(status IN ('claimable','already_claimed','not_eligible','unknown','manual_check')),checked_at TEXT NOT NULL,evidence_refs TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX claim_checks_wallet ON claim_checks(wallet_id,campaign_id,checked_at);
CREATE TABLE quest_progress (user_id TEXT NOT NULL,wallet_id TEXT NOT NULL REFERENCES wallet_watchlist(id) ON DELETE CASCADE,campaign_id TEXT NOT NULL REFERENCES campaigns(id),quest_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('action_required','manual_check','passed','failed','unknown')),points TEXT,verified INTEGER NOT NULL DEFAULT 0,evidence_refs TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL,PRIMARY KEY(wallet_id,campaign_id,quest_id));
CREATE TABLE alert_preferences (user_id TEXT PRIMARY KEY CHECK(user_id GLOB 'tg:[0-9]*'),enabled INTEGER NOT NULL DEFAULT 0,filters TEXT NOT NULL DEFAULT '{}',event_types TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL);
CREATE TABLE alerts (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES alert_preferences(user_id) ON DELETE CASCADE,campaign_id TEXT NOT NULL REFERENCES campaigns(id),event_type TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,sent_at TEXT);
CREATE INDEX alerts_pending ON alerts(status,next_at);
CREATE TABLE aggregator_cursor (name TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '');
CREATE TABLE aggregator_rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(5);
