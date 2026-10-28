# Airdrop Museum — integrated UX + production release checkpoint
Date: 2026-10-29 (Asia/Jayapura). **Release status: BLOCKED (no production schema or code changes).**

## Integrated source
- GitHub PR #15: https://github.com/xirraen/airdropmuseum/pull/15
- Base branch: `fix/production-completion` (PR #13), preserving encrypted backup, privacy vault, payload erasure guards, wallet hardening and migrations up through `0019`.
- UI source: `feat/miniapp-blue-reference-ux` (PR #14): root index, five-tab navigation, blue responsive dashboard, Wallet Saya, Eligibility manual review, Portfolio, Quest and Notifications.
- Event-scoped participation guard (`guardSharedParticipation`) retained. Local demo collection remains marked fictional.
- Main home hero links to the actual read-only campaign directory at `/aggregator.html`; do not treat built-in illustrative exhibits as live campaigns.
- Worker asset manifest includes `mini-ui.css`.

## Confirmed repository gates
- Fresh merged-branch GitHub Actions: Production Hardening CI, Sprint 11 event-sourcing CI, Sprint 11 Claim Autopsy CI, Sprint 9 Admin Operations CI, Sprint 8 API CI, Sprint 7 trust CI, Sprint 6 validation all succeeded at integration head before this document.
- Production Hardening CI reported 264 tests passed, 0 failed; builds, D1 migration validation, workerd runtime tests, credential scan and production-dependency audit passed. These checks run in CI and are not a substitute for live Telegram/WalletConnect QA.

## Real Cloudflare C0 preflight, read-only
- C0 account ID `9880cf2cc57c2096f8c3ae253d9852e6`.
- Production Worker `airdrop-museum` exists and has not been replaced by this integration.
- Production database `airdrop-museum` ID `4e75c8b9-6c58-4bac-a180-01e5bec0d0a3` reports schema version **5**, Wrangler history exactly 0001 through 0005.
- Current D1 Time Travel bookmark exists; **not** a verified fresh independent encrypted export.
- Six discovery/partner/aggregator queues and DLQs exist.
- Production Worker bindings currently include DB, AI, AGGREGATOR_QUEUE, Telegram token and WalletConnect Project ID. **Missing** from current Worker settings relative to new `wrangler.jsonc`: `JOURNAL_ERASURE_LEDGER`, `TRUST_CACHE`, `AGGREGATOR_BACKUP_BUCKET`, `PUBLIC_API_RATE_LIMITER`, `ANALYTICS`, `DISCOVERY_QUEUE`, `PARTNER_WEBHOOK_QUEUE` and newer vars/cron.
- Secret names `ADMIN_CSRF_PEPPER` and `BACKUP_SIGNING_KEY` are used by the release source but are **not** bound to the production Worker. Their values must be generated/stored in private, recoverable operations infrastructure and configured as server-side Cloudflare secrets, never sent through browser client or GitHub source. Other secrets and owner/superadmin role bootstrap must be verified as part of the release.
- `airdrop-museum-e2e-direct` is a separate synthetic staging Worker; it currently has isolated D1, erasure ledger, Telegram and WalletConnect bindings. It does **not** contain this newly merged UX build until explicitly deployed.

## Non-negotiable production blockers
1. **Fresh private production backup**, authenticated encrypted export, integrity proof, independent restore proof and private recovery key custody. Prior PR #13 had verified clone/recovery earlier; production migration must still be preceded by a new checkpoint.
2. **Forward-only migrations** from production 5 through schema 16 (17 recorded SQL files, including 0018/0019), with source freeze/rollback plan and verified erasure ledger replay barrier.
3. **Secrets and bindings** above, queue consumers, verified superadmin identity/bootstrap and complete worker binding configuration. No secret contents are printed to logs.
4. **Deploy integration build to isolated staging**, verify real Telegram session, WalletConnect mobile connect/disconnect, new seven-screen UX, live registry and owner isolation, consent/erasure, and performance.
5. Confirm all release checks, required approval controls, production migration and live post-deployment smoke tests. Never deploy directly from PR #12/#14 (older security baseline) or bypass current gates.

## Next safe operator sequence
Run `npm ci && npm run lint && npm run typecheck && node scripts/security-scan.mjs && node --experimental-sqlite scripts/validate-migrations.mjs && npm run build && npm test && npm run test:runtime && npm audit --omit=dev --audit-level=high`.
Use the established private-backup/recovery scripts and isolated Wrangler staging configuration from PR #13 for rollout rehearsal. After all five blockers are closed and the production environment is approved, merge PR #15, migrate production in a controlled window, deploy the exact verified commit, and validate live endpoints. Never fabricate a success or silently force a D1 restoration.

## 2026-10-29 release operations update — protected infrastructure
- Created private R2 bucket `airdrop-museum-d1-recovery` on C0. Public r2.dev access is disabled; no custom domains exist. A synthetic upload/read/delete test succeeded.
- Created **server-only** Cloudflare Worker secrets `ADMIN_CSRF_PEPPER` and `BACKUP_SIGNING_KEY`, verified present on the production Worker. This can add Workers deployment records, but no Sprint 11 application build was published.
- The owner has been provided a *private chat download* for offline recovery of these newly generated secrets, separate from Git. Do not copy keys into this document, source, logs or public issue comments.
- A **fresh encrypted production snapshot** was created using authenticated Cloudflare D1 queries (not a Wrangler SQL dump). Identity: C0 production D1 `4e75c8b9-6c58-4bac-a180-01e5bec0d0a3`; captured `2026-10-28T21:23:51Z`. Captured **49 application tables, 43 rows**, excluding D1 internal `_cf_*` tables. Time Travel bookmarks matched before and after the snapshot query.
- Snapshot encrypted using AES-256-GCM with a separate 256-bit recovery key and uploaded to private R2 object `airdrop-museum-d1-recovery/production/schema5/2026-10-28T21-23-51-911Z.json.aesgcm`. A fresh authenticated R2 read/decrypt roundtrip verified its plaintext SHA-256 `3952fc76bab55a4d78aee2977e1609332cccff374ae337e89fe864dc54c05c61` and all row counts. **The key must be kept offline outside R2 and Git.** The snapshot is a JSON-based recovery format, **not** a directly Wrangler-importable SQL dump.
- Cloudflare account reached the limit of 10 D1 databases. Removed *only* the old synthetic `airdrop-museum-sprint11-staging` (`461404c7-a2c6-4222-bb13-6aa26fce2332`), verified it was unbound to all Workers and had only one synthetic user and two synthetic journal events.
- Created isolated empty `airdrop-museum-restorecheck-20261029` (`1abf92ac-1405-401c-b622-31e6685489a3`) for testing recovery. **The restore has not yet completed or been verified**, so full restore gate is still RED; no production schema migration was attempted.
- Cloudflare D1 production remains at `am_core_schema.version=5` and `0001..0005` recorded migrations.

**Do not advance production migration/deployment until full independent restore and encrypted key custody are verified, staging Worker tests (including Telegram and WalletConnect) are completed, and release gates are approved.**

### Verified recovery utility (offline)
- Added `scripts/verify-d1-json-recovery.mjs` and synthetic tests `tests/d1-json-recovery.test.mjs`.
- This is for **offline recovery verification only**: decrypt the private R2 backup after it has been downloaded securely using the owner’s Cloudflare credentials. It writes a **new** SQLite file outside the Git repository; refuses any existing target and any output under the repository; validates SHA-256, authenticated AES-256-GCM, the production database ID, 49-table schema expectations via actual metadata, per-table row counts, SQLite integrity and foreign keys. It never contacts live D1 or deploys a Worker.
- Example (paths supplied by operator): `node --experimental-sqlite scripts/verify-d1-json-recovery.mjs /private/production-snapshot.json.aesgcm /private/recovery-keys.txt /private/restore.sqlite`
- The secret file was supplied only as a private conversation artifact. **Do not put recovery keys in workflow logs, the repository or public storage.**
- An *actual verified restore of this production snapshot* has **not** yet been performed. Code-level synthetic restore tests are not a substitute for running the real encrypted backup in an authorized private operator environment.
