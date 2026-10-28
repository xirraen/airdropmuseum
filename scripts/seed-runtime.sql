-- Synthetic local-only fixture. Never run this file against a remote database.
INSERT OR IGNORE INTO am_core_exhibits(id,payload,source_url,review_status)
VALUES('runtime-ended','{"name":"Synthetic runtime campaign","status":"ended","visibility":"public","claim_deadline_at":"2026-01-01T00:00:00Z"}','https://official.example.org/docs','confirmed');
