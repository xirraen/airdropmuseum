-- Forward-only representation migration: payload bytes move to a private vault.
-- Decision/event IDs, ordering, dates and evidence references are preserved.
CREATE TABLE journal_private_payloads(
 event_id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL REFERENCES am_users(id),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
INSERT INTO journal_private_payloads(event_id,user_scope,payload_json)
 SELECT id,user_scope,payload_json FROM autopsy_events;
DROP TRIGGER autopsy_events_immutable_update;
UPDATE autopsy_events SET payload_json=json_object('private_ref',id);

CREATE TABLE journal_erasure_authorizations(
 request_id TEXT PRIMARY KEY,
 user_scope TEXT NOT NULL UNIQUE,
 erased_scope TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 matches INTEGER NOT NULL CHECK(matches=1)
);
CREATE TABLE journal_erasure_targets(
 request_id TEXT NOT NULL,
 aggregate_id TEXT NOT NULL,
 PRIMARY KEY(request_id,aggregate_id)
);
CREATE TABLE journal_erasure_receipts(
 request_id TEXT PRIMARY KEY,
 erased_scope TEXT NOT NULL,
 aggregate_ids TEXT NOT NULL CHECK(json_valid(aggregate_ids)),
 event_count INTEGER NOT NULL,
 erased_at TEXT NOT NULL,
 ledger_synced INTEGER NOT NULL DEFAULT 0 CHECK(ledger_synced IN (0,1))
);
-- Only the owner identifier can be pseudonymized during an explicit privacy
-- transaction. No decision, payload reference, ordering or date can be edited.
CREATE TRIGGER autopsy_events_immutable_update BEFORE UPDATE ON autopsy_events
WHEN NOT (
 NEW.id=OLD.id AND NEW.aggregate_id=OLD.aggregate_id AND NEW.campaign_id=OLD.campaign_id
 AND NEW.event_version=OLD.event_version AND NEW.event_type=OLD.event_type
 AND NEW.knowledge_cutoff_at=OLD.knowledge_cutoff_at AND NEW.evidence_refs=OLD.evidence_refs
 AND NEW.payload_json=OLD.payload_json AND NEW.recorded_at=OLD.recorded_at
 AND EXISTS(SELECT 1 FROM journal_erasure_authorizations a
 JOIN journal_erasure_targets t ON t.request_id=a.request_id AND t.aggregate_id=OLD.aggregate_id
 WHERE a.user_scope=OLD.user_scope AND a.erased_scope=NEW.user_scope
 AND a.expires_at>=unixepoch())
) BEGIN SELECT RAISE(ABORT,'EVENT_IMMUTABLE'); END;
CREATE TRIGGER journal_event_vault_guard BEFORE INSERT ON autopsy_events
WHEN NEW.event_version=COALESCE((SELECT MAX(event_version)+1 FROM autopsy_events WHERE aggregate_id=NEW.aggregate_id AND user_scope=NEW.user_scope),1)
 AND (json_extract(NEW.payload_json,'$.private_ref') IS NOT NEW.id
 OR NOT EXISTS(SELECT 1 FROM journal_private_payloads p WHERE p.event_id=NEW.id AND p.user_scope=NEW.user_scope))
BEGIN SELECT RAISE(ABORT,'PRIVATE_PAYLOAD_REQUIRED'); END;
INSERT OR IGNORE INTO am_core_schema(version) VALUES(15);
