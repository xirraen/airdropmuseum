-- Reviewed synthetic fixture for the dedicated staging database only.
-- The transport must verify account, database name and ID before executing.
-- This is not a campaign announcement, eligibility finding or production source.
INSERT OR IGNORE INTO am_core_exhibits(id,payload,source_url,review_status)
VALUES('runtime-ended','{"name":"SYNTHETIC STAGING FIXTURE — NOT A REAL AIRDROP","slug":"synthetic-staging-fixture","status":"ended","visibility":"public","demonstration":true,"description":"Synthetic integration-test fixture; not an airdrop or reward opportunity.","tasks":[],"claim_deadline_at":"2026-01-01T00:00:00Z"}','https://example.org/staging-synthetic-fixture','confirmed');
-- Operator-reviewed test metadata, explicitly not a real external verification.
INSERT OR IGNORE INTO verification_runs(id,run_key,campaign_id,trigger_type,status,finished_at,confidence_label,result_json)
VALUES('staging-fixture-review','staging-fixture-review','runtime-ended','manual','complete',CURRENT_TIMESTAMP,'needs_review','{"synthetic_fixture":true,"external_source_verified":false}');
