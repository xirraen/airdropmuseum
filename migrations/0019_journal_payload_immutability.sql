-- Payloads remain immutable until an explicit owner erasure transaction.
CREATE TRIGGER journal_payload_immutable_update BEFORE UPDATE ON journal_private_payloads
BEGIN SELECT RAISE(ABORT,'PRIVATE_PAYLOAD_IMMUTABLE'); END;
CREATE TRIGGER journal_payload_private_delete BEFORE DELETE ON journal_private_payloads
WHEN NOT EXISTS(
 SELECT 1 FROM journal_erasure_authorizations a
 JOIN journal_erasure_targets t ON t.request_id=a.request_id
 JOIN autopsy_events e ON e.aggregate_id=t.aggregate_id AND e.id=OLD.event_id
 WHERE a.user_scope=OLD.user_scope AND e.user_scope=OLD.user_scope AND a.expires_at>=unixepoch()
)
BEGIN SELECT RAISE(ABORT,'PRIVATE_ERASURE_REQUIRED'); END;
CREATE TRIGGER journal_receipt_immutable_delete BEFORE DELETE ON journal_erasure_receipts
BEGIN SELECT RAISE(ABORT,'ERASURE_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER journal_receipt_immutable_update BEFORE UPDATE ON journal_erasure_receipts
WHEN NOT (NEW.request_id=OLD.request_id AND NEW.erased_scope=OLD.erased_scope
 AND NEW.aggregate_ids=OLD.aggregate_ids AND NEW.event_count=OLD.event_count
 AND NEW.erased_at=OLD.erased_at AND NEW.ledger_synced>=OLD.ledger_synced)
BEGIN SELECT RAISE(ABORT,'ERASURE_RECEIPT_IMMUTABLE'); END;
INSERT OR IGNORE INTO am_core_schema(version) VALUES(16);
