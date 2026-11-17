# Airdrop Museum — legacy PR reconciliation and production release gates

**Audit date:** 17 November 2026 (Asia/Jakarta)  
**Reference commit:** `64832eea2df196965894a8aa1c16a6b626c1e643` (`main`)  
**Live Cloudflare Worker:** `airdrop-museum`, deployment `26576456-e095-4329-acee-37f4a2e70b27` from 4 November 2026. **The current GitHub commit is not deployed.**

This audit distinguishes **presence of implementations in current main** from **historical pull-request merge status**. Closing an obsolete PR does not mean its commits were merged, nor does CI mean the application was released. Use this page with `docs/CONTROLLED_PRODUCTION_RELEASE.md` and `docs/PRODUCTION_LIVE_RELEASE.md`.

## Historical pull requests

| Original PR | Scope | Reconciliation to current main | Resolution |
| --- | --- | --- | --- |
| #1 | Aggregator Core / migration 0005 | `src/aggregator-api.mjs`, `migrations/0005_aggregator_core.sql` present | Superseded; do **not** replay obsolete branch |
| #2 | First draft Quest/Points | `0008_quest_tracker.sql`, quest tests and UI present; duplicate of #3 | Superseded |
| #3 | Quest/Points | Quest migration, UI and automated tests present | Superseded |
| #4 | Portfolio/exports/backups | `0009_portfolio_intelligence.sql`, portfolio services and UI present | Superseded |
| #5 | Discovery RSS/Atom/JSON | `0010_discovery_automation.sql`, parser and queue present; more recent preview in PR #31 | Superseded |
| #6 | Public API / partner feed | `0012_public_api.sql` and current public API routes present | Superseded |
| #7 | Admin Operations | `0013_admin_operations.sql`, RBAC routes present and verified owner login observed | Superseded |
| #8 | Sprint 10 hardening | Current source contains release, security scan, operator runbook and runtime tests | Superseded; external acceptance remains open |
| #9 | Sprint 11 direct-write draft | Current `0014_claim_autopsy.sql` and event-sourced architecture supersede the initial model | Superseded, **not** a direct merge |
| #10 | Sprint 11 event-sourcing | Current `src/autopsy/eventStore.ts` and architecture/migration present | Superseded |
| #11 | Historical build-plan documents | Some Oct-28 planning files (`MASTER_BUILD_PLAN.md`, `ARCHITECTURE_TARGET.md`, `IMPLEMENTATION_STATUS.md`, `RISK_REGISTER.md`) are **not** in main. The draft used obsolete dependency/release status; retain the original PR as an archive instead of importing stale claims. This current audit and the controlled release runbook supersede operational guidance, **not** every historical proposed document. | Closed as historical/unmerged |
| #12 | Release candidate with 11 high npm advisories | Current release code and successful production-hardening CI supersede the security-blocked draft | Superseded, **not** evidence of release approval |
| #13 | Security, Journal erasure and AES recovery | Current Journal privacy code, private backup/restore scripts and Nov-4 encrypted historical recovery evidence exist; fresh backup/restore required for a new release | Superseded; outstanding gates below |
| #14 | Mobile blue-white dashboard and seven screens | `dist/mini-ui.css`, `dist/navigation.js`, and `tests/miniapp-ux.test.mjs` present in main | Superseded |

All of the above are from the Oct 2026 historical development chain. **Do not merge their stale bases into main.** Verified implementation presence is not a line-by-line functional equivalence certificate. Preserve their discussion/diffs in GitHub after closing. The remaining production acceptance work stays in [issue #24](https://github.com/xirraen/airdropmuseum/issues/24).

## Current live infrastructure snapshot

Read directly from Cloudflare during the 17 November 2026 audit:

| Component | Verified observation |
| --- | --- |
| Worker active deployment | 4 November 2026, not the newest GitHub main |
| Production D1 | `airdrop-museum`, schema version **17** |
| Admin access | 1 enabled `super_admin`; verified Telegram Admin Console login exists |
| Discovery intake | 0 configured sources; 0 discovered items |
| Last cron check | 17 November 2026 UTC: cron records continue |
| R2 recovery bucket | `airdrop-museum-d1-recovery` exists |
| R2 encrypted recovery objects | **Last modified 4 Nov 2026** and 28 Oct 2026 — **no verified fresh 17 Nov backup** |
| Queues | Discovery/aggregator/webhook primary and DLQ resources exist |
| Source build | `main` `64832ee` CI PASS; **not yet a deployed bundle** |

**A bucket or object listing proves presence, not decryption, key custody, restore correctness or erasure replay.** Do not infer that WalletConnect works on a physical device merely because browser tests pass. No discovery source should be invented or activated without verification of official publisher and feed permissions.

## Release gates: do not bypass

The canonical runner `scripts/release-production.mjs` validates the full, commit-bound evidence defined by `scripts/release-evidence.mjs` before production mutation. The following must have reviewed artifacts and verified results for the **exact new main commit**:

- [ ] Isolated staging deployment and staging browser E2E for the candidate.
- [x] Owner Telegram Admin Console login observed on a real device (dated evidence; recheck session for release).
- [ ] Read-only WalletConnect provider lifecycle on the owner's real test device (connect, cancel, timeout, unsupported chain, reconnect, disconnect); no seed/transaction/signature.
- [ ] Fresh **encrypted** D1 export with key custody outside cloud, project repositories, and ciphertext storage; authenticated readback.
- [ ] New private, unbound D1 isolated restore; row counts, ownership, foreign keys, immutable triggers and schema consistency.
- [ ] Complete external erasure ledger scan/replay at the recovery cutoff.
- [ ] Review of migration hashes, Worker bindings, secret inventory and deployment-key separation.
- [ ] Tested rollback of an inactive candidate, preserving forward schema and data.
- [ ] Candidate smoke/load and observability/queue checks.
- [ ] Explicit, current, commit-bound production approval with signed-off evidence.

**Until satisfied, production deployment remains BLOCKED.** Do not forge `PASS` files, backdate evidence, disable gates, upload production credentials into Worker runtime, or overwrite existing security/recovery objects. The previous Nov-4 backup is not a fresh backup of the Nov-17 dataset.

## Required next operator actions

1. Use a private operator workstation with the separately controlled backup and key directories; take and decrypt a **fresh** encrypted D1 backup.
2. Restore the backup to a **new unbound D1 database**, verify all privacy and schema checks and preserve artifacts privately.
3. Complete real Telegram WalletConnect tests and an isolated staging run with synthetic data.
4. Assemble the exact-commit evidence manifest, execute `scripts/release-production.mjs`, verify the installed live Worker source hash, post-release Admin/Discovery and cron, and record the deployment ID.
5. Register and preview verified HTTPS publisher feeds in Admin Console while disabled; activate separately only after editorial and ToS review. No automatic campaign publication.

**Issue #24 remains open** until the external safety/release acceptance criteria are complete. Historical PR closure must not close that gate.
