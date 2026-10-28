# Disaster recovery

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

Before production schema changes, use an authorized C0 operator/approved workflow to export the entire D1 database to private access-controlled storage. Record the D1 Time Travel bookmark and migration checkpoint securely, with no user records or bookmark in Git. Include all tables, not only a curated subset. Encrypt storage where supported and restrict retention/access.

Validate the export against table counts and integrity checks, restore it into a separate empty staging database, and verify representative profiles, wallet watchlists, subscriptions, preferences, points, journal events, projections, audit and operational records. Record the private backup identifier and restore evidence outside public source control.

This execution created no production backup and performed no restore drill. Backup/restore gate is NOT PASSED. Existing Sprint 5 per-user R2 backup functionality is not equivalent to a complete production D1 backup.

On deployment failure, stop rollout and roll back Worker code to a recorded prior version. Preserve new events and prefer a reviewed forward-only database fix. Never restore an older production DB automatically; that can discard activity recorded after the backup. A destructive production restore requires explicit approval with a concrete data-loss assessment.
