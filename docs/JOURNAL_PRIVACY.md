# Journal privacy and recovery

Verified 29 October 2026, Asia/Jakarta. Migrations 0018 and 0019 bring the schema to 16 (17 migration files). Applied migrations must not be edited.

Journal payloads reside in a private vault. Normal vault UPDATE and DELETE are rejected; deletion requires the scoped privacy transaction. Event IDs, types, versions and timestamps remain immutable. A confirmed erasure removes the owner's vault payloads and projections and replaces the owner link with an erasure principal. Minimal event envelopes and erasure receipts remain; this is not a guarantee of anonymity or per-user cryptographic erasure.

GET /api/autopsy/privacy previews the authenticated owner's data. POST requires the exact confirmation `HAPUS JURNAL SAYA`, same-origin checks and the preview count/latest-event checkpoint. A stale preview fails. This operation covers Journal data, excluding the account, wallet watchlist and quest records. The UI clears private forms and rendered data after erasure. Copies already exported by the user remain outside server control.

HTTP 200 means the external erasure receipt was persisted. HTTP 202 means live data was erased but backup replay protection remains pending. A durable D1 outbox retries through the scheduled Worker; an empty retry does not falsely report completion while receipts remain pending. JOURNAL_ERASURE_LEDGER is a dedicated KV namespace, separate from TRUST_CACHE, without receipt expiry. Never clear it as a cache.

## Restore barrier

Before a restored database serves traffic, apply forward migrations, freeze writes on the source, verify every source outbox receipt has synced and is visible in the external ledger, then run `scripts/reapply-journal-erasure.mjs`. The helper refuses production and active-source databases as restore targets. It requires target schema 16, replays all receipts, verifies payload removal and foreign keys, and fails closed if the source or ledger is unavailable. KV listing can be eventually consistent: the complete source receipt comparison is required, not just a successful list request. Retain the source freeze until replay and release verification finish.

Synthetic remote recovery was exercised: an old snapshot containing two owners was restored; erasure replay removed owner A's private payload and owner link while retaining owner B's payload and projection. A second replay was idempotent. No production user snapshot was exposed through a Worker.

## Backups and retention

Managed private D1 exports are encrypted with AES-256-GCM. Keys are separate owner-only files outside the backup archive and repository. Keep keys recoverable and separate; losing the key prevents recovery. Decryption authenticates before writing plaintext. The actual 49-table production export passed encrypted round-trip and SQLite recovery verification, after which plaintext working copies were removed.

Managed export retention is 30 days. Run `scripts/prune-private-backups.mjs` to review candidates; set PRIVATE_BACKUP_PRUNE_APPLY=1 only for the intended removal run. This is an operator procedure; no recurring pruning job has been installed. The helper ignores unrecognized and recent directories. Provider Time Travel is separate: [Cloudflare documents](https://developers.cloudflare.com/d1/reference/time-travel/) seven days on Free and thirty on Paid. Historical provider snapshots are handled by replaying receipts before restored data becomes accessible, rather than claiming instant deletion from provider backups.

The private R2 bucket `airdrop-museum-user-backups` was created for scoped user backups. Its Worker binding is configured in source; production binding activation and BACKUP_SIGNING_KEY provisioning remain pending. These user backups contain their own allowed portfolio/watchlist data, not the Journal vault. Backup signing authenticates content; it is not encryption.
