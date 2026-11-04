> Current deployed staging, measured results and unresolved gates: [STAGING_VERIFICATION.md](STAGING_VERIFICATION.md). Partial staging does not authorize live release.

# Canonical controlled production release

Status on 2026-11-04: **BLOCKED**. See [current findings and blockers](FULL_SYSTEM_REMEDIATION.md). Historical sprint documents are implementation history, not release approval. No GitHub Actions workflow independently deploys production.

Production target: C0 / `airdrop-museum` / D1 `4e75c8b9-6c58-4bac-a180-01e5bec0d0a3`. Read-only observation is schema 5; candidate schema is 17 through `0020`. Never reset D1, modify applied migrations, rewrite immutable events, or use force.

## Evidence before production access

1. Review and merge the integrated candidate. Use a clean `main` checkout at the exact tested commit. Install the locked dependencies and Chromium (`npm ci`, `npx playwright install --with-deps chromium`). Run lint, typecheck, security scan, migration validation, build, unit/integration tests, workerd runtime tests, browser E2E and production dependency audit. Build must leave Git clean.
2. Generate a full separate staging config with `node scripts/create-staging-config.mjs`. Required environment settings: `STAGING_ACCOUNT_ID` (optional, use C1 when C0 is full), `STAGING_D1_DATABASE_ID`, `STAGING_TRUST_KV_ID`, `STAGING_ERASURE_KV_ID`, `STAGING_RATE_LIMIT_NAMESPACE_ID`, `STAGING_ORIGIN`. Resource creation is an operator step; repeat generation is deterministic. Provision its named R2 bucket, primary/dead-letter queues and analytics dataset using dedicated staging credentials. Do not copy production IDs, private data or Telegram delivery secrets. The generated file contains no secrets and is ignored by Git. Validate it against installed Wrangler before deploying staging.
3. Run browser E2E against the dedicated staging URL with `E2E_BASE_URL`. Run the workerd synthetic harness only on its explicitly permitted local/dedicated synthetic origin. Use synthetic owners and review unpublished fixtures; do not send real Telegram messages. Test authentic Telegram and read-only WalletConnect separately with authorized test accounts/devices.
4. On a private operator workstation, configure separate absolute backup and key directories outside every Git repository. Run `scripts/private-db-backup.mjs` with a least-privilege deployment token supplied through the approved secret mechanism. Never print it or bind it to the Worker. A local encryption roundtrip is insufficient.
5. Run `scripts/restore-private-backup.mjs` with `PRIVATE_BACKUP_DIRECTORY`, `PRIVATE_BACKUP_KEY_ROOT` and a newly provisioned empty `RESTORE_STAGING_D1_ID`. Set `RESTORE_STAGING_ACCOUNT_ID` when the private restore lives in C1; source erasure-ledger reads stay in C0. Never use the active public staging database as the private restore target. No public Worker may be bound to the private restore. Verify counts, all pending migrations, erasure ledger replay, foreign keys and immutable triggers. `0020` refuses overlapping identities; resolve any conflicts retaining both histories and repeat the isolated drill.
6. Review all bindings/secrets/cron schedules against `wrangler.jsonc`, admin bootstrap, egress/DNS policy, load results and code rollback. Remove/rotate the runtime deployment credential only in an explicitly approved production configuration window. Record checkpoints and Worker rollback version. No down migrations.

## Commit-bound release evidence

Set `RELEASE_EVIDENCE_FILE` to a private reviewed JSON file outside Git:

```json
{
  "commit": "<exact 40-character main commit SHA>",
  "verified_at": "<current UTC timestamp>",
  "gates": {
    "staging_e2e": {
      "status": "PASS",
      "reviewer": "<responsible reviewer>",
      "artifact": "<relative private evidence path>",
      "sha256": "<artifact SHA-256>"
    }
  }
}
```

Provide every gate listed in `scripts/release-evidence.mjs`: staging E2E, real Telegram and WalletConnect devices, encrypted backup, isolated restore, erasure ledger, migration review, binding and secret inventories, superadmin bootstrap, rollback drill, load test and explicit production approval. The runner checks the commit, a 24-hour evidence window and each artifact hash. This is a tamper-detection and review record, not an automated proof that a human-performed step happened. Review actual contents; never create placeholder PASS evidence. Do not store personal backup contents or credential values in public evidence.

## Approved execution only

After all evidence is reviewed and explicit live approval is recorded, supply `CLOUDFLARE_API_TOKEN`, `PRIVATE_BACKUP_ROOT`, `PRIVATE_BACKUP_KEY_ROOT`, `RELEASE_EVIDENCE_FILE`, `AIRDROP_PRODUCTION_RELEASE=APPROVED`, and `RESTORE_DRILL_VERIFIED=YES` through the operator's controlled environment. Run:

```bash
node scripts/release-production.mjs
```

The runner rechecks clean `main`, candidate evidence, local gates, live binding destinations and absence of deployment credentials in runtime. It creates a fresh encrypted recovery checkpoint, lists/applies pending migrations, verifies schema 17 and foreign keys, then deploys the tested Worker. Keep a supervised maintenance window to avoid concurrent identity writes. Do not change production settings merely to bypass a failed gate.

After deployment, run authenticated and public smoke checks, confirm every intended cron and queue/DLQ, verify no privacy payload appears publicly, and monitor error rates. Deployment output alone is not acceptance. If checks fail, halt writes where necessary and roll back to a verified canonical-identity-compatible Worker while retaining forward schema and external erasure receipts. Record post-deployment evidence before claiming **DEPLOYED & VERIFIED**.

## Owner-authorized direct-main release, 4 November 2026

The owner explicitly requested execution from `main` without a staging requirement for this single-owner deployment. This is an operator-executed connected-API release, not a claim that the stricter automated `release-production.mjs` manifest has passed. Real Telegram and WalletConnect device acceptance remains external verification; admin bootstrap stays locked until the owner can be identified from a verified login. Do not substitute synthetic device evidence.

Mandatory data safeguards remain: a current AES-256-GCM encrypted production export, authenticated decrypt round trip, local SQLite integrity/foreign-key checks, a real import into an unbound private recovery D1, comparison of all original table counts, forward migration of that copy to schema 17, preserved user-row fingerprints, and complete production erasure-ledger verification. Production migrations must use the identical reviewed migration files and stop on any failure. Recovery uses application rollback or a separately reviewed restore; never delete/reset production or reverse schema migrations.

Production uses one UTC minute trigger. The dispatcher preserves the five original independent cadences, including simultaneous jobs, while retaining legacy trigger support. This avoids consuming cron slots belonging to other applications. Queue retries/DLQs and runtime bindings still require live verification. Deployment credentials must not be inherited into runtime bindings.

Analytics Engine version preparation was rejected by Cloudflare C0 with error 10089 (product not enabled). The production configuration therefore omits that optional binding until the owner enables the product. Existing structured Workers Logs and D1 operational events remain active; this does not count as Analytics Engine verification. Enable the product in C0, add `ANALYTICS` / dataset `airdropmuseum_operations` to `analytics_engine_datasets`, and validate a new inactive version before activation.
