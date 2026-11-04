# Remote staging verification — 4 November 2026

Release remains **BLOCKED**. Staging is deployed at **https://airdrop-museum-staging.airdrop-658.workers.dev**. This is a partial synthetic environment, not production and not a verified production snapshot restore.

## Infrastructure and authorization

The owner authorized continued development toward production, agreed to test real devices once staging is available, and explicitly selected partial staging while R2 remains blocked. The original production release gates remain mandatory.

C0 refused creation of an eleventh D1 (`7406`, database limit reached). No database was deleted. Dedicated staging resources were created in C1 (`658ab460492b61f87b42ba96a813f176`):

| Resource | Isolated staging target |
|---|---|
| Worker | `airdrop-museum-staging` |
| D1 | `2befecb7-2d37-43df-aec6-113c6d1d7bf5`, schema 17 |
| Trust KV | `a605893fc7cf4c3a9b1dbae7a39f6774` |
| Erasure KV | `9e20e83ce7b041588bc7589e83294e57` |
| Queues | `airdrop-museum-staging-{discovery,partner-webhook,aggregator}` plus separate DLQs |
| Rate limiter | Namespace `2026110401` |
| Placement | Singapore/APAC, `aws:ap-southeast-1`, close to the D1 primary |

Four Worker consumers are attached: Discovery, Aggregator, Partner Webhook, and Partner Webhook DLQ. Source migrations were applied forward to this fresh synthetic database; all 18 files and foreign keys passed. Production data was not copied into staging.

R2 is not activated in C1 (`10042`), and Analytics Engine is not activated (`10089`). Neither binding was silently replaced with production storage. C1 also has three existing unrelated cron triggers and a five-trigger Free-plan limit (`10072`), so only `*/5 * * * *` and `*/15 * * * *` could be installed. Existing jobs were not disabled. Both staging cron handlers were observed writing operational events at 02:15 UTC. Three remaining cron schedules are **BLOCKED** until capacity is available.

The connector provisioner is idempotent and continues independent resources when R2 is unavailable. Deployment defaults to requiring full bindings; partial deployment requires explicit `allowPartial:true` and returns `production_ready:false`. Artifact SHA-256 is verified before upload. Production credentials never enter the Worker.

## Safety and real-device testing

Staging displays a visible warning on every HTML page. `SIDE_EFFECTS_ENABLED=0` now actually prevents email, Telegram, push/Discord delivery workers, weekly reports, aggregator alerts and outbound partner webhooks. Jobs are not falsely marked sent. These guards are tested even when provider credentials are present. WalletConnect uses the application's already-public project identifier; no wallet key is requested, copied or stored.

Telegram currently uses **synthetic test authentication**. A real-device Telegram authentication PASS requires an operator to install a dedicated test bot's token directly in Cloudflare C1 Worker secrets, change `TELEGRAM_AUTH_MODE` to `verified`, and connect that test bot's Mini App to the staging URL. Do not copy the production bot token or send tokens through chat. Keep external delivery disabled.

On an authorized test device, verify launch/safe areas, scrolling/keyboard, login and session expiry, cross-account isolation, and read-only WalletConnect connect/cancel/timeout/reconnect/disconnect. Never invoke signing, transactions, approvals or claims. Report device/OS/app version, time and observed result without identifiers, initData, cookies, pairing URIs or secrets. These device gates remain **BLOCKED — EXTERNAL VERIFICATION REQUIRED** until actual evidence is received.

## Observed remote behavior

- Ten Chromium mobile/desktop browser tests passed against the deployed URL with production CSP.
- Fourteen runtime checks passed against real Cloudflare Worker, D1 and KV: signature/session exchange, cross-user denial, concurrent version rejection, evidence requirements, consent withdrawal, private export, erasure and durable external receipts.
- The public leaderboard identifier regression was reproduced with an explicitly synthetic opted-in profile and verified fixed remotely. The probe profile was returned to private afterward.
- A disabled synthetic Partner Webhook delivery sent through the actual DLQ consumer became `dead / DLQ_EXHAUSTED` without an outbound request.
- A malformed synthetic Discovery message produced four failure attempts and was observed in the separate Discovery DLQ. No source campaign was automatically published.
- A controlled rollback selected the earlier canonical-identity-compatible Worker. The legacy response contract was observed at 02:16:47 UTC, request `bb753bb6-9a96-42f8-a91d-1f56d742cebf`; Cloudflare logs confirmed version `92d069c1-24ab-44de-b270-7444b76fd3bf` returned HTTP 200. The candidate was restored. D1 remained schema 17 with valid foreign keys.
- Test API keys were short-lived, stored only in a mode-0700 directory outside Git, then revoked and verified to return 401. Local credential files were removed and the synthetic QA admin role was disabled after use. Audit history was retained.

## Performance evidence and limits

The first unchanged 5→15-VU, two-minute test returned 315 successful responses but failed the 500 ms p95 target (1.64–1.68 s). Cloudflare logs confirmed backend time around 1.5 s, and response headers placed the incoming edge in ORD while D1 was in APAC. Explicit placement near D1 removed repeated intercontinental database trips.

A subsequent run returned 485 successful responses, 0% errors, with per-endpoint p95 410–459 ms. A later candidate run returned 478 successful responses but exceeded the same threshold on three endpoints (512–595 ms). Both outcomes are retained; a prior PASS must not hide a later failure. Two additional public API database round trips were removed without changing quota limits: quota reservation now returns its atomic count, and API-key validation checks schema readiness in the same lookup. Concurrency and migration-negative tests cover both changes. The latest result is recorded in the machine-readable evidence; do not infer readiness from earlier figures.

The load harness now requires a real published, clearly named synthetic fixture and an expiring staging API key. It refuses production targets and no longer accepts a 404 detail response as success. k6 v2.3.0 was checked against the official release SHA-256 file. Thresholds remain p95 <500 ms per listed endpoint and errors <1%.

## Production recovery and remaining gates

Read-only production checks still report schema 5 and no overlapping numeric/canonical owners in the core/XP stores at inspection time. No production configuration, schema, private Journal or deployment was modified.

The recovery runner had a stale schema-16 replay check; it now requires schema 17. `RESTORE_STAGING_ACCOUNT_ID` supports a fresh private restore database in C1 while production erasure-ledger reads remain in C0. A transport regression proves the separation and rejects schema 16. Active public staging and historical synthetic source database IDs are explicitly denied as restore targets. These are code/tests, **not** evidence of a real production backup restore.

Still required: full staging R2/Analytics/cron coverage; current encrypted production backup and actual isolated restore with erasure replay; dedicated real Telegram bot/device evidence; real WalletConnect provider/device evidence; current secret/binding/admin inventories; and complete commit-bound production release evidence. The local Wrangler CLI is unauthenticated and the protected operator backup/key setup is unavailable. Configure credentials through the approved secret mechanism or have an authorized operator run the canonical procedure. Never retrieve or reuse the excessive deployment token currently bound to the production Worker.

Follow [CONTROLLED_PRODUCTION_RELEASE.md](CONTROLLED_PRODUCTION_RELEASE.md). Missing gates must remain BLOCKED, regardless of approval to continue development.

## Latest candidate acceptance

Executable source `8b6133f4b317eafb470e3cb0c958e714bc37eafe`, Worker artifact `7d5ff331d67e19d9b83effeb0ff91a87e46475f9d0469284e5a16cec03ad7e74`, deployed version `2869745d-3b41-4fa5-af94-8f949db887a6`. Latest results: **294 unit/integration tests, 10 remote browser tests, 14 remote runtime checks, 488 successful load requests and 0% errors**. Per-endpoint p95 is **393.9–403.1 ms**, meeting the unchanged 500 ms threshold. All earlier failed runs remain in evidence.

The staged rollback verifies the mechanism and schema retention only. Its historical code version is not an approved production rollback artifact; select a build retaining all current security fixes, including leaderboard identifier redaction.

See [machine-readable evidence and artifact hashes](evidence/staging-verification.json). Infrastructure, real-device and private production recovery blockers above still prevent production release.
