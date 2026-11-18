# Airdrop Museum — Work continuation and operator-safe release gates (2026-11-18)

This is an execution runbook for the current draft PR #38, NOT a release approval. Use the precise branch/head being audited; revalidate all evidence if the head changes.

## Scope / known state
- Repository: `xirraen/airdropmuseum`, branch `feat/multisource-opportunity-research-20261118`.
- Production Cloudflare account: `9880cf2cc57c2096f8c3ae253d9852e6`, Worker `airdrop-museum`, production D1 `4e75c8b9-6c58-4bac-a180-01e5bec0d0a3`.
- Existing private isolated restore D1: `8dd6f86a-7d64-4d3e-aaee-df7207fcc44b`, originally created on 2026-11-17. It ALREADY CONTAINS restored records; **never run `recovery:resume`, `recovery:drill`, another SQL import, D1 reset or D1 delete against this target**.
- Independent read-only inspection found 87 application tables, schema 17, `quick_check=ok`, no foreign-key violations; production `maintenance_mode=normal` and 0 unsynced erasure receipts. This alone does NOT prove encrypted archive auth, exact table counts or successful erasure replay.
- Recovery is blocked until owner-controlled source-write freeze; production release is additionally blocked by #24 and #39. Existing PR stays draft.

## 1 — Work tasks allowed without operator secrets
1. Fetch current PR head, working tree status, recent PR comments, issue #24/#39 and CI of EXACT HEAD.
2. Audit the code paths for privacy replay, finalized restore, D1 query responses, auth, wallet read-only behavior, Worker queues and scheduled jobs.
3. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:runtime`, `npm run build`, `npm run test:e2e`, `npm audit --omit=dev --audit-level=high` in a clean checkout. Do not suppress/omit security failures. Record exit codes and exact commit.
4. Review upstream `GHSA-fc5q-39xc-vjpf` via primary advisory and WalletConnect dependency graph. Do not use `npm audit fix --force` or a pre-release dependency outside compatible peer ranges without complete audited compatibility + physical-device regression evidence.
5. Perform only read-only Cloudflare account/Worker/D1 inspection, honoring API access limitations. Do not reveal secret values in logs, chat, PRs or Git history.
6. Make isolated fixes with regression tests on the draft branch; include concise PR comments with verified results and explicit blockers.

## 2 — Operator host: private recovery preflight
Operator must have access to the **original** AES-256-GCM backup directory and its separately stored decryption key. Work/cloud browser or this GitHub connector cannot substitute for original key custody. Never paste key/token into a chat, issue or PR.

Before changing local files, verify there is no active recovery process and no stale lock that could belong to another operator. Do not kill an active process, overwrite recovery files or remove locks without checking ownership.

From the exact audited checkout with `PRIVATE_BACKUP_ROOT`, `PRIVATE_BACKUP_DIRECTORY`, `PRIVATE_BACKUP_KEY_ROOT`, `RESTORE_STAGING_D1_ID` and valid Cloudflare credentials available securely **in the operator environment**, run:

```bash
npm run recovery:finalize:preflight
```

This must authenticate the encrypted archive, verify isolate target identity/bindings, all restored table inventories/counts, schema, migration set, foreign keys and quick_check. It does NOT apply erasure receipts and does NOT approve release. Preserve private output; only report non-sensitive summary.

A preflight result `RESTORED_D1_VERIFIED_SOURCE_NOT_READ_ONLY` must be treated as a hard stop for finalize until a verified write freeze exists.

## 3 — Freeze gate: operator-controlled maintenance window only
The owner must independently confirm that **every** production writer is quiesced: HTTP mutation paths, Worker cron/scheduled jobs, queue consumers, Telegram/provider hooks and any external scripts. Merely setting `system_settings.maintenance_mode` is not enough. Confirm read-only/maintenance mode and a synced, stable erasure outbox during the entire replay.

Do NOT have an autonomous agent set source mode or freeze flags simply to satisfy a check. The owner must approve source availability impact, maintenance timing, freeze verification, restoration steps and rollback conditions separately.

Only **after** all prerequisites are independently satisfied and the owner explicitly approves finalization, invoke `npm run recovery:finalize` with the documented `AIRDROP_RECOVERY_FINALIZE=APPROVED` and `AIRDROP_SOURCE_FREEZE_CONFIRMED=APPROVED` flags set through the owner's environment. The finalizer writes privacy replay **only to the private restored target**, not production. A nonzero exit requires investigation and never warrants blind rerun/import. Preserve private evidence and complete owner review.

## 4 — Separate production release gates
Even a completed private restore is **NOT** production release authorization. Issue #24 also requires exact-candidate isolated staging, authenticated boundary and real Telegram/WalletConnect physical-device verification, rollback/load/queue checks and complete commit-bound 13-gate evidence. Issue #39 requires a patched dependency, independently reviewed containment or documented and approved alternative; security audit must remain fail-closed.

Do not merge PR #38, update production Worker bindings, deploy, modify production D1, expose private restored data, initiate wallet signatures, claims or transactions, or activate unapproved discovery sources while these gates are unmet.

## 5 — Reporting contract for Work
Record: (a) exact HEAD and commits, (b) test commands, exit codes and CI links, (c) production vs private-target verification separated, (d) encrypted preflight and replay status only if actually executed, (e) unresolved #24/#39, (f) operator-only actions requiring approval. Never claim deployment, completed recovery, device acceptance or security clearance based on synthetic/local tests.
