# Production release — 4 November 2026

The owner authorized deployment from `main` without staging. Production is deployed and browser/API/data checks below passed. **Full acceptance remains BLOCKED — EXTERNAL VERIFICATION REQUIRED** for real Telegram/WalletConnect devices and verified owner superadmin bootstrap. Analytics Engine also requires C0 product activation. This is not a claim that the stricter automated release-evidence manifest passed.

- Live URL: https://airdrop-museum.xirraen.workers.dev
- Tested/deployed code: `eb29226ae06b9320085410a971f4e01a4c35d950` on `main`.
- Integrated remediation: [PR #20](https://github.com/xirraen/airdropmuseum/pull/20); direct-main release preparation: [PR #21](https://github.com/xirraen/airdropmuseum/pull/21). Branch protection remained enabled and required CI passed.
- Active Worker version after placement/privacy settings: `241ce348-7b41-4fbc-ae6a-56ec03a4eb85`; deployment `26576456-e095-4329-acee-37f4a2e70b27` at 04:11:47 UTC.
- Downloaded live Worker source SHA-256: `059dfc775c87bc9bf5b7fd5bae494b5d8b2aa34c0134fdc5ef52a35658ee3852`, identical to the tested bundle.

## Database and privacy

Production D1 advanced from schema 5 to **17**, with **18 migration records**. The 13 pending forward migrations were first applied to an actual production export restored into an unbound private C1 D1, not the public staging database. All 49 original table counts matched before upgrade, and both original user profiles retained identical fingerprints after upgrade and in production. Foreign-key violations: **0**. Pending erasure receipts: **0**; external ledger scan was complete with zero receipts. No production Journal erasure, database reset or down migration was performed.

The production snapshot passed SQLite integrity/foreign-key checks, authenticated AES-256-GCM encryption/decryption and real isolated D1 import/upgrade. The encrypted snapshot was uploaded to private recovery R2 and read back with matching ciphertext hash. See [recovery evidence](evidence/production-recovery-20261104.json) and [operator recovery procedure](CONTROLLED_PRODUCTION_RELEASE.md). Encryption keys remain separate from ciphertext and outside Git; retain the protected operator recovery directories before retiring this workspace.

## Infrastructure and security

All configured required production bindings passed the live binding validator. Trust and erasure KV, private backup R2, native public rate limiting, discovery/partner/aggregator producers and four Worker consumers are present. Discovery and aggregator retries remain three; partner retries four, with a partner DLQ consumer. Analytics Engine was rejected with Cloudflare error 10089 and is explicitly omitted until enabled; structured Workers Logs and D1 operational events remain the actual monitoring path.

`CLOUDFLARE_API_TOKEN` is absent from active runtime bindings. Existing application secrets were explicitly inherited, and missing internal security secrets were generated inside the authenticated connector without returning their values. Query strings are redacted from platform logs. Webhook egress defaults to an empty allowlist. No campaign was automatically published, no wallet signing/transaction was enabled, and no synthetic account or private Journal was created/deleted in production.

One UTC minute trigger preserves all five job cadences; legacy cron strings remain supported. Configuration is verified; see the live manifest for observed execution status. Cloudflare trigger propagation can delay the first execution. Other applications' schedules were not changed. Provider version activation resets targeted placement: apply placement/observability settings after activation, include provenance annotations, then verify the downloaded source hash.

## Verification evidence

| Check | Result |
| --- | --- |
| Frozen install, lint, typecheck, security scan, build | PASS locally and required GitHub CI |
| Migration validation | 18 files, schema 17 |
| Automated unit/integration tests | 297 passed, 0 failed/skipped |
| Actual workerd + local D1 | 14 passed; immutable UPDATE/DELETE rejected |
| Local mobile/desktop browser | 10 passed |
| Production mobile/desktop browser | 10 passed |
| Production smoke | 10 routes passed; public response privacy checked |
| Production negative checks | Fake cookie/body identity, admin write, method and CORS/key rejection checked |
| Production dependency audit | 0 vulnerabilities |
| Production read-only public load | 5 VUs, 60 seconds, 165 requests, 0% errors, p95 427.11 ms < 500 ms |

The first mixed-endpoint load run failed the unchanged latency target after version activation reset placement; it returned 151/151 successful HTTP responses but p95 1.14 seconds. Placement was corrected and the same test/threshold passed. An earlier 17-second catalogue-only probe was deliberately interrupted before exceeding the configured per-IP quota, with 116 successful responses. Failed/aborted artifacts are retained, not relabeled as passes. These production public-read checks do not replace earlier authenticated synthetic load evidence or device acceptance.

[Machine-readable manifest, migration hashes and raw logs](evidence/production-live/manifest.json) accompany this report. [Canonical operator procedure](CONTROLLED_PRODUCTION_RELEASE.md) remains the deployment/recovery entry point.

## Remaining external checks

1. Open the production Mini App through the real Telegram bot, login and create its HttpOnly session. Confirm the owner identity from that server-verified login before assigning `super_admin`; there are two stored Telegram profiles and currently zero enabled admins. Do not guess ownership from row order or request body. Record the audited role bootstrap and verify admin RBAC/CSRF with that session.
2. With the owner's test wallet only, verify connect, cancellation, timeout, reconnection, unsupported chain and disconnect on a real Telegram device. Wallet use remains read-only. Never provide seed/private key or sign a transaction for this test.
3. Enable Analytics Engine in C0 if required, add its optional dataset binding, then validate an inactive version and deploy through the canonical procedure. Do not change unrelated application quotas or billing silently.
4. Retain encryption-key custody outside Git, review/rotate the formerly runtime-bound deployment credential through the owner's controlled credential procedure, and monitor cron/queues after provider propagation. Do not expose recovery data or restore a database before replaying the full erasure ledger.
