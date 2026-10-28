# Disaster recovery

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

Before production schema changes, use an authorized C0 operator/approved workflow to export the entire D1 database to private access-controlled storage. Record the D1 Time Travel bookmark and migration checkpoint securely, with no user records or bookmark in Git. Include all tables, not only a curated subset. Encrypt storage where supported and restrict retention/access.

Validate the export against table counts and integrity checks, restore it into a separate empty staging database, and verify representative profiles, wallet watchlists, subscriptions, preferences, points, journal events, projections, audit and operational records. Record the private backup identifier and restore evidence outside public source control.

This execution created no production backup and performed no restore drill. Backup/restore gate is NOT PASSED. Existing Sprint 5 per-user R2 backup functionality is not equivalent to a complete production D1 backup.

On deployment failure, stop rollout and roll back Worker code to a recorded prior version. Preserve new events and prefer a reviewed forward-only database fix. Never restore an older production DB automatically; that can discard activity recorded after the backup. A destructive production restore requires explicit approval with a concrete data-loss assessment.

## Executable backup and isolated restore drill

Run from the repository with its locked Node/Wrangler dependencies and an authorized Cloudflare token in the environment. Keep the token out of command arguments and source.

```bash
PRIVATE_BACKUP_ROOT=/absolute/private/location/outside-git node scripts/private-db-backup.mjs
```

The script fixes the production account/database, exports every table through Wrangler, stores Time Travel checkpoints before/after, checks the source table inventory, restores the SQL into a private local SQLite database, verifies integrity/foreign keys and records SHA-256, table counts, schema and migration history. Directories use 0700 and files use 0600. The backup is plaintext at rest, so use an encrypted filesystem where available. There is no artifact upload and no output of personal records or Time Travel bookmarks to the terminal. An error leaves only restricted diagnostic files; it does not mark the backup valid. The two Time Travel checkpoints bracket the export and are not asserted to be the export's exact snapshot bookmark.

Provision a **new empty** D1 database in account C0, then run:

```bash
PRIVATE_BACKUP_DIRECTORY=/absolute/private/location/completed-backup-directory \
RESTORE_STAGING_D1_ID=the-new-empty-database-uuid \
node scripts/restore-private-backup.mjs
```

The restore script refuses production and the historical staging database IDs, proves the target has no application tables, checks the dump hash, imports it using Wrangler, compares every table count, validates foreign keys, and applies only the pending migration suffix using the restored d1_migrations history. It verifies the full current migration file set and schema marker 14, then writes private restore evidence. It deploys no Worker and does not attach any public binding to the copied data. Keep that D1 private; do not attach it to a public preview. A failed/partial restore requires another fresh database rather than automatically clearing or overwriting it. Resource cleanup must preserve the private evidence and follow the operator's retention policy.

28 October attempt: backup execution stopped at the initial Time Travel checkpoint because Wrangler authentication is missing. No production export or remote restore occurred. Unit coverage verifies table omission, missing migration checkpoint, orphaned rows, and refusal of production/historical staging targets. A successful local fixture test is not a remote restore drill.
