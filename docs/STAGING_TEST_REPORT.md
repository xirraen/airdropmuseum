# Staging test report

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

Read-only inspection of existing staging confirmed schema 11, immutable triggers and clean foreign keys. Its Wrangler history is absent.

No staging Worker was deployed, and no real Telegram login, wallet session, partner callback, browser mobile viewport, remote D1 concurrent-write test or Worker rollback drill was verified. No synthetic test was sent to a production Telegram user or production webhook. Fresh isolated staging and a test bot are required before any deployment gate can pass.

Local results and limitations are recorded in PRODUCTION_VERIFICATION.md. No local success is counted as staging E2E success.

## Actual runtime verification (local, not remote staging)

Wrangler 4.154.0 successfully applied 15 migrations to isolated local D1. Workerd passed 12 API scenarios, including Telegram HMAC/session, owner isolation, concurrent optimistic locking, evidence/outcome validation, replay repair, consent withdrawal and private export. Local D1 rejected both UPDATE and DELETE of existing event rows. A 390×844 browser inspection found no document-level horizontal overflow in Registry or Decision Journal. Real Telegram Android/iOS and a live WalletConnect session are still unverified.
