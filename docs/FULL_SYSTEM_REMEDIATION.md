# Full system remediation — 4 November 2026

Release status: **BLOCKED**. This is a reviewable remediation candidate, not a production verification certificate. No production migrations, secret changes, queue changes, deployments, or Journal deletions were performed.

## Current evidence

The repository baseline is `892534a2eba57b40788edce092b4fe01becd5d03`. Read-only Cloudflare API inspection on 2026-11-04 confirms account C0, Worker `airdrop-museum`, D1 `4e75c8b9-6c58-4bac-a180-01e5bec0d0a3`, schema **5**, and migration history `0001`–`0005`. D1 reported zero rows written. The active deployment is `170f0813-aeff-4b36-a16f-1793ec21a006`, Worker version `4c52221c-3299-491f-b094-c360ee1e192f`, created **2026-10-29 05:36:26 UTC**.

Live bindings omit `TRUST_CACHE`, `JOURNAL_ERASURE_LEDGER`, `AGGREGATOR_BACKUP_BUCKET`, `PUBLIC_API_RATE_LIMITER`, `ANALYTICS`, `DISCOVERY_QUEUE`, and `PARTNER_WEBHOOK_QUEUE`. Only the aggregator queue is bound. Runtime secret `CLOUDFLARE_API_TOKEN` exists; source search finds its use only in operator scripts, not Worker runtime modules. Values were never requested or logged. Live cron inventory contains only `*/15 * * * *`; the checked-in configuration has five schedules.

## Finding inventory

| Severity | Evidence / affected files | Impact | Remediation / status |
|---|---|---|---|
| P1 | `src/api.mjs` used numeric verified Telegram IDs; platform used `tg:` | Split personal ownership and balances | Canonical core API; conflict-preserving state re-key; migration `0020` reconciles state/XP ownership with overlap guard; regression tested |
| P1 | `platformUser` selected cookie and ignored competing initData | Ambiguous account selection | Reject conflicting verified principals; preserve email sessions without competing Telegram credentials |
| P1 | `/auth/telegram` could mint repeated sessions from one signed payload | Session exchange replay | Atomic one-time hash consumption in existing expiring rate-limit ledger; time-bound bearer API verification remains intentionally reusable |
| P1 | `webhookService.ts` accepted any public-looking hostname | Unreviewed outbound destinations | Default-deny exact operator allowlist at registration and every delivery; HTTPS/IP/local/port restrictions, manual redirects, timeout and bounded payload retained |
| P1 | Webhook claim allowed a second consumer during in-flight delivery | Concurrent duplicate delivery | Atomic 30-second lease, stale retry recovery, same delivery ID/HMAC across retries; concurrency test |
| P1 | Live schema 5 vs baseline target 16 | Unsupported API tables | Forward-only local upgrade now targets 17; no production write; actual private snapshot upgrade remains externally blocked |
| P1 | Missing live erasure ledger | Restore resurrection protection unavailable live | Existing fail-closed privacy behavior retained and tested in workerd; binding preflight blocks release |
| P1 | Deployment credential is bound to production runtime | Excess privilege exposure | Runtime has no code dependency; release preflight rejects binding. Removal/rotation requires controlled production approval |
| P1 | GitHub deploy workflow bypassed operator backup/restore procedure | Live deployment without all gates | Remove independent deployment path; canonical operator runner requires current commit evidence and binding destination checks |
| P1 | Historical release script accepted only environment assertions for external gates | Unverified restore/staging could reach migration | Commit-bound, 24-hour evidence manifest with per-gate artifact SHA-256 and named reviewers; no PASS artifacts fabricated |
| P2 | Local dev server loaded four migrations only | Browser tests missed current backend compatibility | Apply all sorted migrations to isolated memory SQLite |
| P2 | Mobile intro action constrained to 36px; sibling intercepted catalog click | Broken navigation | Responsive wrapping and full-width text controls; real Chromium clicks pass without force |
| P2 | Wallet route absent from mobile profile overview | Difficult wallet navigation | Profile shortcut to existing Wallet Saya route |
| P2 | Dashboard demo cards presented under latest airdrops heading | Ambiguous catalog provenance | Local collection label, shared published catalog panel and explicit loading/error states; backend failures no longer become successful empty catalogs |
| P2 | WalletConnect resumed/requested expired sessions and facade stayed callable after disconnect | Stale wallet state | Reject expired sessions and disconnected requests before transport; cancellation and expiry tests |
| P2 | Historical deployment docs and schema claims | Incorrect operator actions | Canonical release procedure and dated evidence replace historical claims |

## Repository coverage and existing protections

Reviewed source boundaries include core/platform/aggregator APIs, Telegram HMAC and session handling, admin RBAC/CSRF, public campaign field allowlists, webhook consumers, wallet facade/adapter, autopsy event/projector/privacy modules, migration chain, Worker generator, local runtime harness, preview/release/backup scripts and workflows. Existing tests exercise SQL parameters, public field privacy, cross-user ownership, admin negative paths, immutable event triggers, deterministic projection repair, evidence requirements, optimistic concurrency, consent withdrawal, private encrypted backups and external erasure replay barriers. No event immutability trigger or old migration was edited.

This review does not certify absence of all possible defects. Device/provider flows and actual production restore evidence remain required. Unused imports and generated bundles are not treated as proof of exploitable defects; compatibility routes/assets were preserved.

## Migration compatibility

There are now **18 SQL migrations**, ending at `0020`; target schema is **17**. The missing filename numbers `0006` and `0007` are historical gaps, not missing applied dependencies: applying the committed lexical sequence succeeds in fresh SQLite and local D1. Schema 5 → 17 is tested using two synthetic owners; payload, revision and timestamp survive. The previous state query/update contract remains compatible with expanded tables.

`0020` creates a reconciliation record for numeric core/XP owners. Any already-existing canonical owner in those stores aborts before ownership updates. The operator must resolve each conflict with both records retained; do not delete one, pick the largest revision across unrelated records, or mark the migration applied manually. Historical XP event keys remain unchanged; referral retry deduplication recognizes both legacy and canonical keys. Autopsy events are not touched.

Apply pending migrations only after a private production snapshot restore and erasure replay in a fresh isolated D1. Synthetic fixtures are not a substitute. During that drill, compare migration history, all table counts, constraints, foreign keys and immutable triggers. A code rollback preserves new schema; use a previously verified build with the canonical identity fix, because pre-fix numeric authentication would hide re-keyed records. Never down-migrate or reset D1.

## Webhook operator policy

`PARTNER_WEBHOOK_ALLOWED_HOSTS` is a comma-separated list of exact normalized public DNS names. It defaults to empty. Only approve endpoints with operator-reviewed DNS ownership and egress controls; partner-controlled arbitrary DNS must not be approved. No wildcard, IP, local hostname, non-HTTPS port or redirect is accepted. Revoking approval takes effect on queued deliveries too. HMAC signs the exact raw body; receivers must verify it and deduplicate `X-AirdropMuseum-Delivery`. Delivery is at least once, not exactly once.

An allowlist alone does not pin DNS resolution. **BLOCKED — EXTERNAL VERIFICATION REQUIRED:** review destination DNS/egress policy against rebinding before enabling partner webhooks. No deployment may treat arbitrary partner DNS as trusted based solely on its current public address.

## External blockers and resolution

- **BLOCKED — EXTERNAL VERIFICATION REQUIRED:** full isolated Cloudflare staging (D1/KV/R2/queues/DLQs/limiter/analytics), current-commit staging browser/runtime tests. The existing preview configuration is a reduced preview, not full infrastructure certification. Supply dedicated resource IDs and least-privilege preview credentials through the approved secret mechanism; never reuse production IDs or private data.
- **BLOCKED — EXTERNAL VERIFICATION REQUIRED:** encrypted current production backup, real restore into a fresh D1 without a public Worker, replay of external erasure receipts, migration conflict review and full snapshot upgrade. Operator backup/key directories and deployment credentials are not configured in this environment. Do not export personal data to chat or Git.
- **BLOCKED — EXTERNAL VERIFICATION REQUIRED:** authentic Telegram Android/iOS/WebApp and WalletConnect provider testing, cancellation/timeout, reconnection, unsupported chains and disconnect. Automated tests use synthetic accounts, never user wallets.
- **BLOCKED — EXTERNAL VERIFICATION REQUIRED:** live superadmin bootstrap, missing bindings/secrets and four missing cron schedules, runtime deployment-token removal/controlled rotation, destination DNS egress review, rollback drill, staging load target and production approval. Use `loadtest/sprint10.js` (5→15 VUs; public endpoint p95 <500ms, errors <1%) only against dedicated staging with realistic published fixtures.

No claim is made that production has passed these gates. The release manifest must record actual evidence; do not turn these blockers into PASS manually.

## Reproducible local acceptance evidence

[Machine-readable manifest](evidence/verification.json) records the tested executable commit, migration hashes and hashes of the committed result summaries.

| Check | Observed result |
|---|---|
| `npm ci` | 184 locked packages installed |
| `npm run lint`, `npm run typecheck` | PASS |
| `node scripts/security-scan.mjs` | PASS |
| SQLite migration validation | 18 migrations; schema 17; required triggers and foreign keys valid |
| `npm run build` | PASS; generated assets committed |
| `npm test` | **285 passed, 0 failed** (unit and SQLite/API integration suite combined) |
| `npm run test:runtime` | **14 passed, 0 failed**, actual workerd + local D1/KV; immutable UPDATE/DELETE also rejected |
| `npm run test:e2e` | **10 passed** in Chromium mobile/desktop; production CSP retained, no forced clicks |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** |
| Wrangler local deployment dry-run | PASS; no remote deployment |

The browser suite covers navigation through Home, Explore, Portfolio, Quest, Notifications, Profile and Wallet; campaign detail open/close; public catalog navigation; Decision Lab and unauthenticated Admin denial; visible backend failure; and persisted profile edits across reload. These are browser tests on synthetic/local data, not real Telegram or WalletConnect certification. The unit suite includes migration overlap rejection, expired sessions, mixed principals, concurrent state/event/webhook updates, webhook retry/DLQ, wallet cancellation/expiry, cron idempotency, public API privacy and Journal backup/replay checks.

Additional Cloudflare inventory reads confirmed that production-named trust/erasure KV namespaces, backup R2 bucket and discovery/partner queues already exist at account scope. Their existence does not bind them to the live Worker. No fully isolated `airdrop-museum-staging` Worker/resources matching the new full staging configuration were observed. A repeatable full config generator and queue-name routing support are included; remote provisioning, credential setup and current-candidate deployment remain pending.
