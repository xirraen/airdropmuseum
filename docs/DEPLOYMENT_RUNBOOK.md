# Deployment runbook

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

1. Resolve production dependency high advisories with a compatible tested fix. Complete legacy decision-first and RBAC integration, privacy erasure/export policy, and projection repair implementation.
2. Verify C0 account 9880cf2cc57c2096f8c3ae253d9852e6, Worker airdrop-museum, production D1 4e75c8b9-6c58-4bac-a180-01e5bec0d0a3 and every binding/route/secret name. Never log secret values.
3. Create empty isolated staging D1 and Worker. Disable real Telegram and partner side effects; use synthetic records and test secrets. Apply migrations through Wrangler once and verify d1_migrations, foreign keys and triggers.
4. Exercise complete Telegram/wallet, decision/follow, evidence/activity/hypothesis/outcome/revision/finalization, replay, consent and public privacy flows; run mobile checks and a staging Worker rollback drill.
5. Perform a private full D1 backup and restore drill per DISASTER_RECOVERY.md.
6. Verify GitHub branch protection, required CI checks and production environment reviewers. Obtain formal production environment approval. Merge only via approved PR flow; no force push.
7. Record D1 checkpoint. Apply only unapplied forward migrations through the approved migration procedure. Verify schema version 12 and registry links, not merely marker 11.
8. Use the official manual deploy workflow from main. It rejects high advisories, wrong account ID and missing bridge/event schema. It does not run migrations implicitly.
9. Smoke test real homepage, authenticated and unauthenticated APIs, scope isolation, admin authorization, event immutability, scheduled jobs/queues, metrics and Telegram. Monitor error/performance changes and retain Worker rollback version.

Do not deploy this candidate: dependency, staging, backup and authorization gates remain open. Required R2, queue, KV, Analytics Engine, rate-limiter and secret resources still require independent verification. Production environment protection was not changed or verified here.
