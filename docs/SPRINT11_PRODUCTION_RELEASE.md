# Airdrop Museum — Sprint 11 production release gate

**Status: BLOCKED / do not deploy.** The production dependency advisory gate failed on 2026-10-28 with **11 high-severity vulnerabilities** in the WalletConnect/Reown/Zod dependency graph (GHSA-mrhx-c7xc-m3w5). A blanket `npm audit fix --force` or forced Zod override is **not approved** without functional security testing. No new Worker build has been published to production by this release procedure.

## Verified environment
- Cloudflare account: **C0** (`9880cf2cc57c2096f8c3ae253d9852e6`).
- Production Worker: `airdrop-museum`.
- Production D1: `airdrop-museum`; bound database ID from `wrangler.jsonc`.
- Production D1 migration records at preflight: `0001_core.sql` through `0005_aggregator_core.sql` only. Highest `am_core_schema.version`: **5**. The event store and tables from later sprints were not present.
- A current D1 **Time Travel bookmark was retrieved before any changes**, without exposing its value in source control. Production data and migration history were **not changed**.

## Release candidate integration
`release/sprint11-production-candidate` is based on `feat/sprint-11-event-sourced-architecture`. It restores these original additive migration files unchanged from their corresponding unmerged sprint branches:
- `0005_aggregator_core.sql` from `feat/aggregator-core-2` (already recorded in production migration history).
- `0008_quest_tracker.sql` from `feat/sprint-4-quest-points`.
- `0009_portfolio_intelligence.sql` from `feat/sprint5-portfolio-intelligence`.

The existing `0010`–`0014` files remain in chronological order. No `0006_*`/`0007_*` files exist in the current sprint branch; source-trust and discovery use higher-numbered SQL files with schema version markers 6 and 7. This is not permission to invent missing migrations. The production team must ensure all committed migrations are consistent with the actual D1 history.

**Functionality integration caveat:** this branch restores SQL migrations, not the unmerged Sprint 2–5 source/API/UI modules. Those original PR branches must be reconciled before asserting complete aggregator production functionality. The old browser-local portfolio bookmark flow also does not yet require a Decision Entry, unlike the new Decision Journal.

## D1 staging rehearsal (separate from production)

A new isolated D1 database `airdrop-museum-sprint11-staging` was created on C0 in APAC, with **no production user data copied**. Its schema was installed through authenticated Cloudflare D1 API queries for the full migration set:

```text
0001_core.sql
0002_rewards.sql
0003_platform.sql
0004_workbench.sql
0005_aggregator_core.sql
0008_quest_tracker.sql
0009_portfolio_intelligence.sql
0010_discovery_automation.sql
0011_source_trust.sql
0012_public_api.sql
0013_admin_operations.sql
0014_claim_autopsy.sql
```

Results: all 12 schema files installed; `PRAGMA foreign_key_check` returned no rows; event source/projection tables and three `autopsy_events` triggers exist; schema version markers 1–9 and 11 present.

A synthetic aggregate was inserted in this **staging-only** database. Direct `UPDATE` and `DELETE` attempts rejected with `EVENT_IMMUTABLE`. Version gap insert rejected with `VERSION_CONFLICT`; legitimate version-2 event append succeeded. **This tests database semantics, not end-to-end Telegram authentication or a deployed Worker.**

**Important:** schema rehearsal was applied by D1 SQL API, not `wrangler d1 migrations apply`, so its `d1_migrations` table has not been populated. Do not blindly run Wrangler's migration apply against that existing rehearsal database; use a new empty staging database for a recorded Wrangler rehearsal or reconcile staging migration metadata explicitly. Do not connect staging Worker to production D1.

## CI and security

GitHub Actions release gate runs `npm ci`, credential pattern scan, full migration validation, `npm run build`, JS syntax validation, `npm test`, and `npm audit --omit=dev --audit-level=high`. Result on first release candidate: **157 tests passed, 0 failed**, but **dependency audit failed** (11 high). The production deployment workflow additionally checks the audit and refuses to deploy unless the remote database has the version-11 schema marker and immutable-event triggers.

### Remaining blockers
1. **Security:** upstream WalletConnect/Reown/Zod dependency advisory must be remediated and verified with wallet integration tests, not suppressed.
2. **Migration safety:** production D1 is on version 5. Before production schema changes, take a private exported SQL backup and confirm restore procedure, inspect the existing 0005 migration checksum/content, and apply only genuinely pending migrations with Wrangler in a reviewed maintenance window. Never overwrite an already-applied 0014 file.
3. **Feature completeness:** reconcile Sprint 2–5 branches and endpoints, verify old Portfolio follow flow and Decision Journal decisions, and review data retention/erasure policy for an immutable event log.
4. **Staging E2E:** deploy the release candidate against a **new** staging D1 with migration metadata and test Telegram authentication, owner isolation, consent revocation, claim finalization, public evidence-card privacy and queues.
5. **Production approval:** all above gates pass, separate approver approves `production` environment, then deploy Worker through the workflow and run authenticated smoke checks.

### Approved production runbook **after** blockers clear
```bash
npm ci
node scripts/security-scan.mjs
node --experimental-sqlite scripts/validate-migrations.mjs
npm run build
npm test
npm audit --omit=dev --audit-level=high

# Protected CI / authorized operator only:
npx wrangler@4 d1 migrations list airdrop-museum --remote --config wrangler.jsonc
# Take durable backup and note private D1 Time Travel checkpoint.
npx wrangler@4 d1 migrations apply airdrop-museum --remote --config wrangler.jsonc
npx wrangler@4 d1 execute airdrop-museum --remote --config wrangler.jsonc --command="SELECT MAX(version) FROM am_core_schema"
# Run protected GitHub production environment workflow only after schema validation.
```

**Rollback:** Roll back Worker using its existing version/deployment control, but never delete append-only user events or truncate the live D1. D1 Time Travel restore would revert all writes since its checkpoint, so it needs owner approval and a recovery plan for subsequent user events. Do not rely on it as a substitute for a separate protected export.
