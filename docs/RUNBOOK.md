# Operations & Disaster Recovery Runbook

Owner: Airdrop Museum operations. Environment: Cloudflare Workers + D1 on the approved project account. Never paste tokens, private keys, email, wallet identifiers or user payloads into an incident ticket.

## Preflight and daily backup assurance

D1 Time Travel is automatically enabled for current production-backend D1 databases; it records restore bookmarks without a scheduled job. Check D1 backend version with `npx wrangler d1 info airdrop-museum`. If backend is older alpha, follow Cloudflare's legacy backup procedure instead; do **not** assume Time Travel. Check and record a current bookmark daily in secure operations storage:

```bash
npx wrangler d1 time-travel info airdrop-museum
```

This daily check is an operational process, **not** an implemented unattended backup job. To satisfy an independent off-platform daily backup policy or retention longer than D1's available Time Travel window, configure an approved encrypted export automation and test it; no destination or scheduler is provisioned by Sprint 10. Documentation: https://developers.cloudflare.com/d1/reference/time-travel/ .

## Deploy (change window)

1. Review and merge Sprint 2–9 work to protected main in correct migration order. Confirm all migrations through `0013_admin_operations.sql` are present and CI green.
2. Stage the same commit in a separate preview D1 with dummy data. Test session, RBAC, CSRF, rate limits, maintenance, RSS, webhook signatures, Telegram and cron.
3. Confirm production secrets are set only via `npx wrangler secret put NAME` (never commit values) and required bindings exist. Inspect Cloudflare version history.
4. Record current Worker deployment/version ID, D1 bookmark, UTC timestamp and incident contact privately. Run `npx wrangler d1 time-travel info airdrop-museum` to capture a bookmark.
5. Apply migrations separately with explicit operator approval: `npx wrangler d1 migrations apply airdrop-museum --remote --config wrangler.jsonc`. **Never** apply preview migrations to production.
6. Verify D1 schema markers, perform a write + read on staging only, inspect prod health and monitoring. Approve GitHub Actions `deploy.yml` workflow_dispatch on protected main through the production environment reviewers.
7. Smoke-test `/api/health`, `/api/aggregator/health`, `/v1/openapi.json`, `/v1/feeds/campaigns.xml`, admin console (authenticated), Telegram alert, discovery cron and backup bookmark.
8. Monitor 5xx/latency/429/logs/queue backlog for 24 hours, then sign checklist.

## Roll back Worker release

1. Activate Sprint 9 read-only/maintenance mode from an authenticated super_admin if possible.
2. Stop new deployment. Identify last healthy Cloudflare Worker version from deployment history; deploy/revert that version via Cloudflare dashboard/Wrangler rollback per installed CLI version, or re-run the exact immutable previous git commit after approval.
3. Verify `/api/health`, `/api/aggregator/health`, public API and admin. Do **not** automatically revert D1.
4. Preserve correlation IDs and timelines without private data. If prior Worker is incompatible with the evolved schema, keep maintenance enabled and follow migration rollback below.

## Roll back a D1 migration (destructive; approval required)

1. Disable writes and queue/cron consumers, capture current D1 bookmark and incident UTC time, and obtain two-person approval.
2. Prefer a forward corrective migration for additive changes. Sprint 9 `0013` includes table replacement and ALTER TABLE; do not attempt blind down-SQL or DROP TABLE.
3. In a recovery exercise environment, test restoring to a pre-migration timestamp. Production restore replaces the **entire database** and can lose subsequent writes; communicate the recovery point and impact.
4. Only after approval, run `npx wrangler d1 time-travel restore airdrop-museum --timestamp=UNIX_SECONDS` with a verified UTC timestamp, or use the exact bookmark. Record the undo bookmark supplied by Wrangler.
5. Reapply only reviewed compatible migrations, verify row counts, schema markers, health, and audit integrity. Re-enable services in order and document the lost-write window.

## Secret rotation

1. Determine affected permission and blast radius, restrict/disable compromised client/partner account.
2. Mint a new least-privilege secret outside repository and chat logs; `npx wrangler secret put NAME`.
3. Rotate upstream credentials, HMAC signing keys, API key pepper carefully (old signatures and API keys may become invalid; use approved transition policy), revoke the old token, test authentication and webhook delivery.
4. Monitor 401/403, webhook errors, and logs without raw tokens. Record when validation is complete.

## API key leak incident

1. Disable/revoke affected key through authenticated admin console; invalidate active webhooks tied to key where needed.
2. Examine aggregate access counters and request_id logs, never print the raw key.
3. Reissue one-time replacement key via protected channel, rotate related secrets if affected, and notify partner per incident policy.
4. Verify no public API leaks admin/user data; apply mitigations and publish sanitized postmortem.

## Queue, provider, and cron failures

- Etherscan: show unknown/manual_check when provider is unavailable, never optimistic eligibility; inspect provider status and throttle.
- Telegram: leave alert in retry queue and confirm recipient opt-in; do not repeat send directly from user requests.
- Discovery: failed feed fetch must not remove published campaigns. Inspect `discovery_sources.last_error` and queue DLQ without dumping feed bodies.
- Partner webhook: inspect delivery status and DLQ; preserve idempotent event IDs, bounded retries and disable repeated failures.
- Cron: check Workers trigger schedule, last operational event and data freshness. Missing jobs should page an operator; do not auto-publish drafts.

## Monitoring and incident severity

S1: data exposure/secret compromise, unauthorized admin write, D1 destructive loss. S2: public 5xx sustained, queued alerts not delivered, broken restore ability. S3: degraded upstream or elevated latency. Notify owner, assign incident commander, record sanitized request_id/timestamps, mitigate, validate, then prepare postmortem.

Sources: https://developers.cloudflare.com/d1/reference/time-travel/ and https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/.
