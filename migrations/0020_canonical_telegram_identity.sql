-- Forward-only legacy reconciliation. An overlap aborts before any ownership changes.
-- Run only with the application in controlled maintenance and a verified backup.
CREATE TABLE am_identity_reconciliation (
 legacy_id TEXT PRIMARY KEY,
 canonical_id TEXT NOT NULL UNIQUE,
 reconciled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO am_identity_reconciliation(legacy_id,canonical_id)
 SELECT scope,'tg:'||scope FROM (
 SELECT user_id scope FROM am_core_user_state UNION SELECT user_id FROM am_xp_accounts
 UNION SELECT user_id FROM am_xp_ledger UNION SELECT invitee_id FROM am_xp_referrals
 UNION SELECT referrer_id FROM am_xp_referrals
 ) WHERE scope GLOB '[1-9]*' AND scope NOT GLOB '*[^0-9]*';
CREATE TABLE am_identity_migration_guard (conflicts INTEGER NOT NULL CHECK(conflicts=0));
INSERT INTO am_identity_migration_guard
 SELECT COUNT(*) FROM am_identity_reconciliation m WHERE canonical_id IN (
 SELECT user_id FROM am_core_user_state UNION SELECT user_id FROM am_xp_accounts
 UNION SELECT user_id FROM am_xp_ledger UNION SELECT invitee_id FROM am_xp_referrals
 UNION SELECT referrer_id FROM am_xp_referrals
 );
UPDATE am_core_user_state SET user_id='tg:'||user_id WHERE user_id IN (SELECT legacy_id FROM am_identity_reconciliation);
UPDATE am_xp_accounts SET user_id='tg:'||user_id WHERE user_id IN (SELECT legacy_id FROM am_identity_reconciliation);
UPDATE am_xp_ledger SET user_id='tg:'||user_id WHERE user_id IN (SELECT legacy_id FROM am_identity_reconciliation);
UPDATE am_xp_referrals SET invitee_id='tg:'||invitee_id WHERE invitee_id IN (SELECT legacy_id FROM am_identity_reconciliation);
UPDATE am_xp_referrals SET referrer_id='tg:'||referrer_id WHERE referrer_id IN (SELECT legacy_id FROM am_identity_reconciliation);
-- Preserve historical XP keys; rewards API checks both historical and canonical keys.
DROP TABLE am_identity_migration_guard;
INSERT OR IGNORE INTO am_core_schema(version) VALUES(17);
