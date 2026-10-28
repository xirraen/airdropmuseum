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
