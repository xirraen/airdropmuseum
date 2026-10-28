-- Sprint 11 event sourced: fresh-install 0014 replaces the prior UNDEPLOYED draft.
-- In production, if the earlier 0014 has already run, DO NOT overwrite its migration history.
-- Apply a reviewed forward-only 0015 transition instead; see architecture docs.
CREATE TABLE IF NOT EXISTS autopsy_events(
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE RESTRICT,
 aggregate_id TEXT NOT NULL,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 event_version INTEGER NOT NULL CHECK(event_version>=1),
 event_type TEXT NOT NULL CHECK(event_type IN (
  'decision_created','evidence_added','activity_recorded','hypothesis_updated',
  'outcome_recorded','outcome_revised','autopsy_finalized','insight_generated',
  'analysis_consent_changed','event_compensated'
 )),
 knowledge_cutoff_at TEXT NOT NULL CHECK(length(knowledge_cutoff_at)>0),
 evidence_refs TEXT NOT NULL DEFAULT '[]' CHECK(
  json_valid(evidence_refs) AND json_type(evidence_refs)='array'
  AND (event_type NOT IN ('decision_created','evidence_added','activity_recorded','hypothesis_updated',
   'outcome_recorded','outcome_revised','autopsy_finalized') OR json_array_length(evidence_refs)>=1)
 ),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_scope,aggregate_id,event_version)
);
CREATE INDEX IF NOT EXISTS autopsy_events_owner ON autopsy_events(user_scope,aggregate_id,event_version);
CREATE INDEX IF NOT EXISTS autopsy_events_campaign ON autopsy_events(user_scope,campaign_id,recorded_at);
CREATE TRIGGER IF NOT EXISTS autopsy_events_immutable_update BEFORE UPDATE ON autopsy_events
BEGIN SELECT RAISE(ABORT,'EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS autopsy_events_immutable_delete BEFORE DELETE ON autopsy_events
BEGIN SELECT RAISE(ABORT,'EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS autopsy_events_version_guard BEFORE INSERT ON autopsy_events
BEGIN
 SELECT CASE WHEN NEW.event_version != COALESCE(
  (SELECT MAX(event_version) + 1 FROM autopsy_events WHERE aggregate_id=NEW.aggregate_id AND user_scope=NEW.user_scope),1)
 THEN RAISE(ABORT,'VERSION_CONFLICT') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM autopsy_events
  WHERE aggregate_id=NEW.aggregate_id AND (campaign_id != NEW.campaign_id OR user_scope != NEW.user_scope)
 ) THEN RAISE(ABORT,'AGGREGATE_MISMATCH') END;
 SELECT CASE WHEN NEW.event_version=1 AND NEW.event_type!='decision_created'
 THEN RAISE(ABORT,'DECISION_FIRST') END;
 SELECT CASE WHEN NEW.event_version>1 AND NEW.event_type='decision_created'
 THEN RAISE(ABORT,'DUPLICATE_DECISION') END;
END;

-- Materialized projections are mutable CACHE, never source of truth.
CREATE TABLE IF NOT EXISTS claim_autopsies(
 aggregate_id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>=1),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','finalized','cancelled')),
 outcome TEXT CHECK(outcome IN ('allocated','not_allocated','unknown')),
 analysis_consent INTEGER NOT NULL DEFAULT 0 CHECK(analysis_consent IN (0,1)),
 decision_cutoff_at TEXT NOT NULL,
 outcome_cutoff_at TEXT,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS claim_autopsies_owner ON claim_autopsies(user_scope,updated_at DESC);
CREATE INDEX IF NOT EXISTS claim_autopsies_pattern ON claim_autopsies(user_scope,status,analysis_consent,outcome);
CREATE TABLE IF NOT EXISTS decision_entries(
 aggregate_id TEXT PRIMARY KEY REFERENCES claim_autopsies(aggregate_id) ON DELETE CASCADE,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 campaign_id TEXT NOT NULL REFERENCES am_core_exhibits(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL,
 primary_evidence_ref TEXT NOT NULL,
 primary_evidence_url TEXT NOT NULL CHECK(primary_evidence_url LIKE 'https://%'),
 decision_source TEXT NOT NULL,
 time_budget_minutes INTEGER NOT NULL CHECK(time_budget_minutes>=0),
 cost_ceiling_usd REAL NOT NULL CHECK(cost_ceiling_usd>=0),
 realistic_expectations TEXT NOT NULL,
 knowledge_cutoff_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_scope,campaign_id)
);
CREATE TABLE IF NOT EXISTS evidence_items(
 id TEXT PRIMARY KEY,
 aggregate_id TEXT NOT NULL REFERENCES claim_autopsies(aggregate_id) ON DELETE CASCADE,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('official_link','screenshot','tx_hash')),
 value TEXT NOT NULL,
 knowledge_cutoff_at TEXT NOT NULL,
 source_event_id TEXT NOT NULL UNIQUE REFERENCES autopsy_events(id),
 revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS evidence_items_owner ON evidence_items(user_scope,aggregate_id);
CREATE TABLE IF NOT EXISTS pattern_snapshots(
 id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id) ON DELETE CASCADE,
 aggregate_id TEXT REFERENCES claim_autopsies(aggregate_id) ON DELETE CASCADE,
 sample_size INTEGER NOT NULL CHECK(sample_size>=0),
 known_outcomes INTEGER NOT NULL CHECK(known_outcomes>=0),
 confidence_label TEXT NOT NULL CHECK(confidence_label IN ('insufficient_data','weak_pattern','moderate_pattern')),
 period_start TEXT,
 period_end TEXT,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pattern_snapshots_owner ON pattern_snapshots(user_scope,created_at DESC);
INSERT OR IGNORE INTO am_core_schema(version) VALUES(11);
