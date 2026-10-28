# Disaster recovery

Updated 29 October 2026 (Asia/Jakarta). Full production backup and isolated remote restore drill passed through the authenticated Cloudflare connector. Production schema and Worker code have not been changed. The user explicitly authorized direct deployment without GitHub Actions because Actions is limited.

Before production schema changes, use an authorized C0 operator/approved workflow to export the entire D1 database to private access-controlled storage. Record the D1 Time Travel bookmark and migration checkpoint securely, with no user records or bookmark in Git. Include all tables, not only a curated subset. Encrypt storage where supported and restrict retention/access.

Validate the export against table counts and integrity checks, restore it into a separate empty staging database, and verify representative profiles, wallet watchlists, subscriptions, preferences, points, journal events, projections, audit and operational records. Record the private backup identifier and restore evidence outside public source control.

A complete SQL export was downloaded to a private local directory outside Git (0700 directory, 0600 files). The local SQLite restore passed integrity and foreign-key checks for all 49 application tables, schema marker 5 and five migration checkpoints. The export was then imported into a newly created private D1 restore database; all 49 table counts matched. Wrangler applied the missing migration suffix using a transport limited to that staging database; all 15 migration filenames were verified, schema marker 14, foreign-key check clean, and immutable event triggers present. Backup/restore gate PASSED for this snapshot. Private evidence and Time Travel checkpoint remain outside Git. No Worker is bound to the restored user-data clone. Existing per-user R2 backups are not a substitute for this complete backup.

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

The initial CLI-only attempt stopped at authentication. A later authenticated-connector export/import and staging-only Wrangler transport completed the real backup/restore drill. This transport uses the existing connector authorization; it extracts no credentials and permits no production mutation. Both temporary staging migration relay servers exited after Wrangler succeeded. Unit coverage verifies table omission, missing migration checkpoint, orphaned rows, and refusal of production/historical staging targets. A successful local fixture test is not a remote restore drill.
