# Sprint 10 — Production Hardening

Status: implementation on `feat/sprint-10-production-hardening`; **not launched or certified production-ready**. Based on Sprint 9 branch, not `main`. Sprint 2–9 integration/migration reconciliation still required.

## Architecture and change boundary

- Zero new aggregator/product features. The only new user-visible routes are four legal/trust documents and a public operational health route.
- `scripts/build-worker.mjs` is the canonical Worker generator; every request flows through `withSecurity`. Do not edit generated `src/worker.mjs` by hand.
- `src/security/gateway.ts` validates request size, emits X-Request-ID, applies response headers, protects all API routes by Cloudflare rate limiting + a D1 per-minute key, sanitizes error responses, and preserves Sprint 9 maintenance and read-only logic inside `fetchCore`.
- `src/security/validation.ts` validates IDs, timestamps, strings, supported EVM addresses and HTTPS destinations; `src/security/upstream.ts` adds timeout, manual redirect policy, bounded retries/backoff and a small per-isolate circuit breaker. Trust fetching uses the wrapper. Discovery uses its existing explicit same-host redirect/timeout guard and review-queue fallback.
- `src/observability/*` provides structured whitelist-based events, safe aggregate counters, request correlation and a degraded-state `/api/aggregator/health` endpoint. Logs do not include free-form errors, raw URL/query, wallet, email, key, token or quest state.
- `wrangler.jsonc` enables Worker logs. Cloudflare's native request logs may include information independently of this application logger: restrict access and retention accordingly.
- `docs/SECURITY.md` includes the review matrix and remaining security risks. Deployment is blocked until critical items are verified.

## Configuration

Production `REQUIRE_RATE_LIMIT_BINDINGS=1` causes API requests to fail closed if the rate-limit binding (or, for most routes, D1) is absent. Public API v1 also retains its existing API key/D1 usage quota. The Cloudflare rate limit binding is eventually consistent and should **not** be treated as an exact global quota; D1 usage counters provide additional enforcement.

Never store credentials in `wrangler.jsonc`, workflow YAML, source, test snapshots or client artifacts. Configure required credentials with `npx wrangler secret put NAME` for this Worker, including `API_HASH_PEPPER`, `WEBHOOK_MASTER_SECRET`, `ADMIN_CSRF_PEPPER` and optional integration secrets `TELEGRAM_BOT_TOKEN`, `ETHERSCAN_API_KEY`, `EMAIL_API_KEY`, and `VAPID_PRIVATE_KEY`. Determine which integrations are enabled before marking a missing optional secret as a deployment blocker. All sensitive logging must remain scrubbed. Review `PUBLIC_API_ALLOWED_ORIGINS`, CORS and public origin separately.

**Important Telegram compatibility caveat:** X-Frame-Options DENY and CSP frame-ancestors none intentionally meet the hardening request. This can block Telegram Web iframe embedding; verify native and Telegram Web Mini App launch in staging before enabling production. Adjusting this requires an explicit security review and acceptance of clickjacking risk.

## CI/CD and branches

- `.github/workflows/ci.yml`: locked install, optional lint/typecheck, static credential pattern scan, migration validation, build, tests, production dependency audit.
- `.github/workflows/deploy.yml`: **manual-only** from protected `main`, GitHub environment `production` approval, no migration or destructive job hidden in deploy. Apply and verify D1 migrations in a separately approved change window *before* deployment.
- `.github/workflows/preview.yml`: PRs originating inside the repo only; requires `PREVIEW_D1_DATABASE_ID`, `PREVIEW_RATE_LIMIT_NAMESPACE_ID` vars and dedicated `CLOUDFLARE_PREVIEW_API_TOKEN` secret. The preview config explicitly strips production queues, KV, AI, Analytics, cron and credentials. Preview D1 ID and limiter namespace must differ from production. Seed item is fictional, private and explicitly non-publishable.
- GitHub Settings -> Branches / Rulesets: require PR review, passing `verify` CI, no force push/direct push, signed commits if available; protect `main` and any production branch. Configure `production` environment reviewers and branch rules. These protections cannot be inferred from a workflow file; check them in GitHub UI.
- Use narrowly scoped Cloudflare API tokens for CI. GitHub Actions secrets are only for deployment; the Worker runtime secrets remain in Cloudflare Secret Store.

## Load and reliability

`k6 run -e BASE_URL=https://YOUR-STAGING-HOST -e CAMPAIGN_SLUG=KNOWN-PUBLIC-SLUG loadtest/sprint10.js`

Test GET /v1/campaigns, /v1/campaigns/:slug, /v1/deadlines, /v1/feeds/campaigns.xml and /api/aggregator/health. Run only against a staging/preview deployment with realistic seeded public data and authorized traffic. Targets are cacheable p95 <500ms, HTTP errors <1%, functioning rate limits, and no cascading failures. A separate controlled high-volume test should confirm HTTP 429; exclude expected 429s from normal load SLO calculations. Existing preview dummy is non-public; supply a reviewed staging fixture before measuring detail results. **No performance result has been measured yet.**

## Compatibility and schema

No Sprint 10 D1 schema migration was added. Existing API paths, schemas and methods remain available. Proxy behavior changes include stricter global security headers, correlated error payloads, request-body rejection over 1 MiB, new per-route limiter and fail-closed production binding requirements; these are security-sensitive behavior changes. Perform a staging regression test before release and check all Telegram and browser clients. Roll back Worker version on incompatibility; schema rollback is a distinct, controlled action described in `RUNBOOK.md`.

## Operations

Cloudflare Workers Observability stores invocation/error logs; custom logs contain event, request_id, status, component, duration and allowlisted metadata. Add alert policies for 5xx, queue DLQ depth, cron staleness, sustained 429s, webhook failures and D1 latency. Verify alert destinations manually. Check Cloudflare Logs retention/cost at launch. Use `X-Request-ID` for incident correlation.

References: https://developers.cloudflare.com/workers/observability/logs/workers-logs/ and https://developers.cloudflare.com/d1/reference/time-travel/.
