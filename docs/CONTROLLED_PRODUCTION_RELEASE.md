> **Current live state — verified 18 November 2026:** Cloudflare production is **not** still on the 4 November deployment. The 100%-traffic Worker deployment `0fd82ac4-7201-4eb7-a3c9-4fa26d66076f` (17 Nov 16:43 UTC) points to version `4765aba5-550e-40de-a945-2c287d4ec328` **without trusted Git SHA or source digest annotations**. D1 schema 17, integrity check OK and no FK violations were verified read-only. The following 17-Nov note is historical. See [RISK_SCOPED_RELEASE.md](RISK_SCOPED_RELEASE.md) for current baseline and the updated exact-deployment guard. **Do not infer deployed code from the GitHub branch or bypass the 13-gate release.**
>
> **Release policy update — 17 November 2026:** The live Worker is still from 4 November (annotated Git SHA `eb29226ae06b9320085410a971f4e01a4c35d950`) and D1 is **already schema 17**, with one verified enabled superadmin. The earlier schema-5 paragraph below is historical, not the current production status. The new [risk-scoped release policy](RISK_SCOPED_RELEASE.md) introduces a **separate, narrow CSS-only** operator release with a verified active production base, six reviewed evidence gates and no database migrations. The current `main` includes 72 newer commits covering APIs/config/source changes and is **not eligible** for that path; it still requires this **full 13-gate** procedure. Never relabel a mixed application release as a CSS release.
>
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

   **Encrypted-only recovery (18 November 2026):** The remote restore runner rejects legacy plaintext-only manifests and malformed AES-256-GCM metadata before any Cloudflare network request. The plaintext digest recorded in the authenticated backup manifest must agree with its encrypted metadata; the decrypted bytes are independently hashed after decryption. The backup runner also rejects key storage that contains the backup directory, or vice versa. Keep ciphertext and the separately stored key in distinct, non-nested private directories outside any Git repository. Do not treat a local decrypt roundtrip as a successful isolated D1 recovery.

   **Local SQLite verification I/O remediation (18 November 2026):** The D1 SQL export verifier uses a **disposable local SQLite database only**. To avoid hundreds of megabytes of ext4 journal writes from a small export containing many independent SQL inserts, the verifier now sets `PRAGMA journal_mode=MEMORY` and `PRAGMA synchronous=OFF` on this temporary connection before replaying the export. Production Cloudflare D1, the encrypted backup, and the remote restored D1 are **never** configured this way. The verifier still runs full `integrity_check`, `foreign_key_check`, table counts, migration checks and SHA-256. If a temporary import is interrupted, treat it as invalid and recreate it; never treat this non-durable local copy as the source backup. This change affects only newly launched verification processes; do not hot-swap files under an in-progress recovery drill.

   **Finalize a successful but incomplete restore (18 November 2026):** If encrypted import, 87-table row-count verification, schema 17, migrations and foreign keys succeeded but \`restore-privacy-replay.log\` records \`LIVE_SOURCE_MUST_BE_READ_ONLY\`, **do not retry \`recovery:resume\` or clear the nonempty private D1**. The new operator-only command \`npm run recovery:finalize:preflight\` verifies the existing encrypted archive (AES-256-GCM), isolated D1, exact table inventory and per-table counts, schema, migration filenames and foreign keys without remote writes, using \`PRIVATE_BACKUP_ROOT\`, \`PRIVATE_BACKUP_DIRECTORY\`, \`PRIVATE_BACKUP_KEY_ROOT\`, \`RESTORE_STAGING_ACCOUNT_ID\`, \`RESTORE_STAGING_D1_ID\`, and a private \`CLOUDFLARE_API_TOKEN\`. It reports whether production source is in \`normal\` (blocked) or \`read_only\`/\`maintenance\` (eligible). No reimport, backup export, Worker deploy, or source mutation occurs. The private archive and keys remain outside Git.

   **Source freeze is a separate owner decision.** Use the authenticated audited admin \`POST /api/admin/maintenance-mode\` with appropriate super_admin session, CSRF protection and an approved maintenance window, *not* raw SQL or a bypass flag. Confirm scheduled jobs, queues, external consumers, erasure outbox/ledger propagation and in-flight writes are quiescent: the HTTP \`read_only\` flag alone does not prove these are frozen. After the owner independently confirms source freeze and preflight still passes, the operator may explicitly run \`AIRDROP_RECOVERY_FINALIZE=APPROVED AIRDROP_SOURCE_FREEZE_CONFIRMED=APPROVED npm run recovery:finalize\`. This reruns target/maintenance isolation, applies external erasure receipts to the **isolated restore only**, verifies replay evidence, rechecks source freeze and outbox/FK, and writes private final evidence and \`PRIVATE_RECOVERY_DRILL_COMPLETED_NOT_RELEASE_APPROVED\` status. If replay errors, retain the encrypted archive and D1 for investigation; never silently bypass it. Restore normal mode only after owner review and safe resumption checks; doing so earlier invalidates the erasure completeness barrier. The command cannot declare production release approval, and a full imported restore that already completed is rejected to prevent concurrent duplicate work.

   **Resume an already encrypted backup after an orchestration failure (18 November 2026):** A successful encrypted backup can be reused without another production export. The initial orchestrator incorrectly rejected a newly created direct-child backup folder with `Backup escaped private directory`; this has been corrected and guarded against symlink and traversal escapes. With the original, complete `manifest.json`, `production.sql.aesgcm` and separate operator-held key, use `npm run recovery:resume` after explicitly setting `PRIVATE_BACKUP_DIRECTORY` to that direct child of `PRIVATE_BACKUP_ROOT`, the same `PRIVATE_BACKUP_KEY_ROOT`, the isolated `RESTORE_STAGING_D1_ID` and `CLOUDFLARE_API_TOKEN`, plus `AIRDROP_RECOVERY_DRILL=APPROVED`. Resume repeats live target and empty-database checks, authenticates and restores existing ciphertext, replays privacy erasure and writes private completion evidence; it **does not re-export D1**, and fails closed if target is already populated or more than 72 hours old. The backup path must not be a symlink or escape the private root. Never paste SQL, ciphertext, keys or token into issue comments or chat.

   **One-command isolated recovery (18 November 2026):** Use `npm run recovery:preflight` (GET-only Cloudflare metadata) and, only after controlled authorization, `npm run recovery:drill`. The drill orchestrator creates one new AES-256-GCM encrypted production export, keeps its generated decryption key in a separate private directory, checks source manifest and local SQLite restore, imports into a newly provisioned empty D1, applies missing migrations, verifies data counts/integrity, replays external privacy erasure ledger, and writes `recovery-drill-evidence.json` beside private encrypted backup evidence. It NEVER deploys a Worker and NEVER modifies production D1. It requires `RESTORE_STAGING_D1_ID`, optional `RESTORE_STAGING_ACCOUNT_ID`, `PRIVATE_BACKUP_ROOT`, `PRIVATE_BACKUP_KEY_ROOT`, `CLOUDFLARE_API_TOKEN` and explicit `AIRDROP_RECOVERY_DRILL=APPROVED`. Keys and artifacts must remain outside the repository and must never be pasted into chat or PRs. The helper does not approve the release: independently review backup, privacy replay and all 13 release gates. A fresh destination database must be no older than 72 hours; historical targets must not be reused.

   An isolated target `airdrop-museum-restore-drill-20261118` (D1 UUID `8dd6f86a-7d64-4d3e-aaee-df7207fcc44b`) was **provisioned in C0 on 2026-11-17 21:18 UTC** and checked empty with no binding among six current Workers (including active serving versions). This is a provisioning/preflight result, **not** successful recovery. Its 72-hour freshness window expires around **2026-11-20 21:18 UTC** and it must not be treated as permanently eligible.

   Example on a secured operator terminal (not CI):
   ```bash
   cd ~/airdropmuseum
   umask 077
   export RESTORE_STAGING_ACCOUNT_ID=9880cf2cc57c2096f8c3ae253d9852e6
   export RESTORE_STAGING_D1_ID=8dd6f86a-7d64-4d3e-aaee-df7207fcc44b
   export PRIVATE_BACKUP_ROOT="$HOME/.local/share/airdropmuseum-recovery/exports"
   export PRIVATE_BACKUP_KEY_ROOT="$HOME/.local/share/airdropmuseum-recovery-keys"
   read -r -s -p "Cloudflare API token: " CLOUDFLARE_API_TOKEN
   printf '\\n'
   export CLOUDFLARE_API_TOKEN
   npm run recovery:preflight
   AIRDROP_RECOVERY_DRILL=APPROVED npm run recovery:drill
   unset CLOUDFLARE_API_TOKEN RESTORE_STAGING_ACCOUNT_ID RESTORE_STAGING_D1_ID PRIVATE_BACKUP_ROOT PRIVATE_BACKUP_KEY_ROOT
   ```
   Stop if the preflight reports a bound Worker, missing permissions, stale target, or any non-empty destination. The D1 script imports real production data to a separate private D1 and should only be run in an authorized operator environment with no public binding and an agreed retention/cleanup plan.

   **Target isolation gate (18 November 2026):** Before decrypting production data and immediately before any remote import, the restore runner now verifies the destination with read-only Cloudflare API calls. It accepts only a D1 created within the past **72 hours** and named `airdrop-museum-restore-drill` (optionally followed by a unique suffix), refuses known production/staging IDs, and scans the current Worker-script settings for D1 bindings referencing it. Any 403, missing permission, incomplete inventory or existing binding is a blocking error. The operator token needs **D1 Read** and **Workers Scripts Read**, plus the separately controlled D1 write permission used only for the authorized isolated restore. Empty table checks still run before import. This automated check is not proof of absence of indirect/future bindings; independently inspect the destination account and reserve a maintenance window. A private `restore-target-preflight.json` evidence file is created only after the read-only check passes.
6. Review all bindings/secrets/cron schedules against `wrangler.jsonc`, admin bootstrap, egress/DNS policy, load results and code rollback. Remove/rotate the runtime deployment credential only in an explicitly approved production configuration window. Record checkpoints and Worker rollback version. No down migrations.

## Production-base concurrency and provenance (18 November 2026)

In addition to the 13 full-release gate artifacts, the privately reviewed full-release evidence manifest must contain the currently observed Cloudflare `production_deployment_id` UUID. The operator runner compares this ID to the live exclusive 100%-traffic deployment at startup, before pending migrations and immediately before Worker upload; any drift fails closed. Copy the real ID from the reviewed live deployment evidence **only**; do not reuse the historical Nov-4 ID.

The approved Wrangler upload now uses `--strict`, `--message "Verified main <commit>; artifact <sha256>"` and `--tag "main-<short-sha>"`. The SHA-256 is for the generated committed `src/worker.mjs` source artifact. After deploy, the runner verifies that the new 100%-traffic Worker version exposes these annotations, matches the exact Git SHA and digest, and has a new deployment UUID. The current version is unannotated; this guard exists to prevent future untraceable releases.

This does **not** supply missing device, restore, erasure-ledger, staging, recovery, or owner-approval evidence.

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

Provide every gate listed in `scripts/release-evidence.mjs`: staging E2E, real Telegram and WalletConnect devices, encrypted backup, isolated restore, erasure ledger, migration review, binding and secret inventories, superadmin bootstrap, rollback drill, load test and explicit production approval. The runner checks the commit, a 24-hour evidence window and each artifact hash. This is a tamper-detection and review record, not an automated proof that a human-performed step happened. **Evidence hardening (18 November 2026):** Each evidence `artifact` must be a regular file contained within the private manifest directory, with a maximum size of 64 MiB. Absolute paths, parent traversal, symlinks, and external private files are blocked. Store evidence and its dependencies under that dedicated private directory; move any existing external evidence inside it before running a reviewed release. Do not put encryption keys or plaintext database exports there. Review actual contents; never create placeholder PASS evidence. Do not store personal backup contents or credential values in public evidence.

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

### Connected activation ordering and recovery

1. Prepare the inactive version with `prepareProductionVersion` from the exact clean, tested `main` tree. An inactive version does not change traffic.
2. Verify encrypted backup and actual isolated restore evidence, erasure completeness, migration hashes and schema checkpoint. Apply only pending forward migrations and verify schema 17 and foreign keys.
3. Activate the prepared version. **Cloudflare version activation resets targeted placement.** Immediately PATCH Worker settings with `config.placement`, `config.observability`, and provenance annotations (`workers/message` containing commit and artifact hash). Omitting annotations from a settings PATCH loses the version's annotation history. Never repeat version activation after this step without reapplying settings.
4. Re-read settings, queue consumers, schedules and bindings. Download the live multipart Worker source, extract `worker.js`, and require its SHA-256 to equal the tested bundle. Verify the production origin, authenticated boundaries and public response privacy. Run the behavioral browser suite and a read-only load test within configured per-IP limits; do not raise limits for a test.
5. Retain all failed/aborted load artifacts alongside the final result. If correctness fails, set the database `system_settings.maintenance_mode` to JSON `"maintenance"` with an operator audit record, retain schema/data and repair forward. Do not activate the October legacy Worker: it lacks the current security fixes. Any code rollback must use a separately verified secure version, preserve current bindings/erasure KV, reapply placement and pass live source-hash/smoke verification.

The pre-release backup is stored encrypted in private R2 `airdrop-museum-d1-recovery` at `controlled-release/20261104/schema5-before-main.sql.aesgcm.base64`; it was read back and its decoded ciphertext hash verified. The AES key and manifest remain on separate protected operator directories outside Git. To recover, download privately, base64-decode, authenticate/decrypt with the matching separately retained key, import into a new unbound D1, apply forward migrations, replay the complete external erasure ledger, then verify integrity and ownership before any service is bound. Never put the key or plaintext export in R2, source, chat or logs. Preserve these operator directories securely before retiring this execution workspace; recoverability depends on retaining the encryption key.
