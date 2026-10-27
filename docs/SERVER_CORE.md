# Server core — 0.5.0

## Deployment

Cloudflare account C0; Worker `airdrop-museum`; existing D1 database `airdrop-museum`. The additive, repeatable migration creates only `am_core_schema`, `am_core_exhibits`, `am_core_user_state`. Existing legacy tables are neither read for user content nor modified.

- Build: `npm run build`.
- Test: `npm test` (Node 24 includes `node:sqlite` used for integration tests).
- Apply `migrations/0001_core.sql` to the configured D1 database.
- Deploy with authenticated Wrangler, or run `node scripts/package-upload.mjs /absolute/scratch/upload.json` and use that metadata/module list in the Cloudflare multipart upload API. The deployment preserves secret bindings.
- Set `TELEGRAM_BOT_TOKEN` as a Worker secret **for this project only**. Never commit a token or copy a token from another application.

## API contract

| Endpoint | Behavior |
| --- | --- |
| GET/HEAD `/api/health` | Version, database schema readiness and configuration status |
| GET/HEAD `/api/capabilities` | Same capability flags; no personal data |
| GET/HEAD `/api/projects` | Bundled, explicitly fictional demo catalog |
| GET/HEAD `/api/exhibits` | Shared catalog rows with source/review status; currently empty, not a verified campaign feed |
| GET `/api/me/state` | Private normalized backup, current revision, timestamp |
| PUT `/api/me/state` | Private backup update with required `If-Match` revision |

Private requests require `X-Telegram-Init-Data` signed for the configured project bot. HMAC-SHA256 validation follows https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app. Duplicate parameters, forged hashes, data older than one hour and dates over 30 seconds in the future are rejected. User identity is taken only from verified signed data. There are no cookies or browser-trusted user IDs.

Private responses use `Cache-Control: no-store`; writes reject cross-origin Origin values, non-JSON payloads, invalid state and bodies over 1 MB. All SQL values use bound parameters. State is scoped by authenticated Telegram user ID. The application does not log initData or tokens. InitData remains a sensitive bearer credential during its accepted lifetime; do not log or persist it.

Create requires revision 0; updates atomically compare the revision in SQL. A conflicting write returns 409. The UI explicitly reads/merges before it enables upload. Existing local project settings take precedence during merge; users should review them before upload. Sync is manual, not background upload. Clearing local browser data does not remove a previously uploaded cloud backup.

## Current activation boundary

D1 and public readiness/catalog endpoints can operate without Telegram credentials. Private sync is disabled with `AUTH_NOT_CONFIGURED` until the bot secret exists. No production signed-in synchronization has been verified without that project secret. The UI shows this state and keeps sync buttons disabled. Integration tests use synthetic test-only tokens and an in-memory SQLite database, never live credentials or live user data.

Public reviews, crawler ingestion, admin catalog writes, wallet/claim execution, notifications and trust scoring remain separate work. The shared exhibit table is intentionally empty. No legacy user records are exposed or migrated implicitly.

## Rollback

Restore the preceding Worker deployment to roll back application behavior. Leave the additive core tables in place; no DROP or legacy-schema rollback is required. Existing browser backups remain usable.
