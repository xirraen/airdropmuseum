-- Synthetic local-only fixture. Never run this file against a remote database.
INSERT OR IGNORE INTO am_core_exhibits(id,payload,source_url,review_status)
VALUES('runtime-ended','{"name":"Synthetic runtime campaign","status":"ended","visibility":"public","claim_deadline_at":"2026-01-01T00:00:00Z"}','https://official.example.org/docs','confirmed');

-- Private synthetic fixture for verifying the schema's immutable event guards.
-- This fixture is NEVER referenced by public Mini App endpoints.
INSERT OR IGNORE INTO am_users(id,username)
 VALUES('local-runtime-synthetic-owner','Local immutable test owner');
INSERT OR IGNORE INTO journal_private_payloads(event_id,user_scope,payload_json)
 VALUES('11111111-1111-4111-8111-111111111111','local-runtime-synthetic-owner','{}');
INSERT OR IGNORE INTO autopsy_events(
 id,user_scope,aggregate_id,campaign_id,event_version,event_type,
 knowledge_cutoff_at,evidence_refs,payload_json
) VALUES(
 '11111111-1111-4111-8111-111111111111','local-runtime-synthetic-owner',
 '22222222-2222-4222-8222-222222222222','runtime-ended',1,
 'analysis_consent_changed','2026-11-18T00:00:00Z','[]',
 '{"private_ref":"11111111-1111-4111-8111-111111111111"}'
);
