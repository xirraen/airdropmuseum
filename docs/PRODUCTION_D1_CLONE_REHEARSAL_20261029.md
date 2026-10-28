# Production D1 Clone Migration Rehearsal — 29 October 2026

This is a **rehearsal performed on isolated D1**, not evidence that Sprint 11 has been deployed to production.

## Verified C0 account and environment
- Cloudflare account: `9880cf2cc57c2096f8c3ae253d9852e6`
- Production D1: `airdrop-museum` (`4e75c8b9-6c58-4bac-a180-01e5bec0d0a3`)
- Isolated rehearsal D1: `airdrop-museum-restorecheck-20261029` (`1abf92ac-1405-401c-b622-31e6685489a3`), not bound to any live Worker.
- Preflight: live production schema version **5**; migration history records `0001_core.sql` through `0005_aggregator_core.sql`.

## Source clone and isolation verification
A read-only copy of the then-current production schema and records was transferred **within the same Cloudflare account** to the isolated D1. The source database was not modified.

- 49 application tables recreated with the original table schema.
- 28 schema objects (indexes) recreated.
- 45 rows restored across those tables, including 3 campaigns, 15 campaign-source records, and 1 user record.
- Canonical per-row comparison across all 49 tables matched source and clone (0 discrepancies).
- `PRAGMA foreign_key_check` on the clone returned 0 violations.

This is an independent **live logical clone** of then-current production, but it **does not prove the previously encrypted R2 snapshot was restored from its ciphertext**. The separate encrypted backup roundtrip was verified previously, but the encrypted-snapshot restore remains a release gate until checked in the owner's trusted private environment.

## Forward-migration rehearsal
The following 12 files from the integrated `main` tree were applied sequentially to the isolated clone using authenticated Cloudflare D1 SQL API; all statements returned success:

```text
0008_quest_tracker.sql
0009_portfolio_intelligence.sql
0010_discovery_automation.sql
0011_source_trust.sql
0012_public_api.sql
0013_admin_operations.sql
0014_claim_autopsy.sql
0015_registry_decision_bridge.sql
0016_registry_projection_guards.sql
0017_projection_repair_guards.sql
0018_journal_privacy_vault.sql
0019_journal_payload_immutability.sql
```

Post-rehearsal:
- `am_core_schema` highest version = **16**.
- Existing 3 campaigns and 15 campaign sources were preserved.
- Campaign registry projection contains 3 rows.
- Required `autopsy_events`, private vault and projection-guard tables exist.
- Append-only/immutable and private-vault triggers exist.
- `PRAGMA foreign_key_check` returns 0 violations.

**Important migration-history distinction:** rehearsal SQL was applied through the D1 SQL API rather than Wrangler; its `d1_migrations` metadata still reflects the original 5 migrations. It must **not** be treated as a migration-managed production target or promoted to production.

## Production deployment blockers / next operational action
1. Verify an independent restore **from the encrypted backup itself** and keep its private key under owner control. The last encrypted snapshot is a separate R2 object, not the same as this D1 clone.
2. Ensure production secret and resource bindings are complete, staging Worker E2E tests including Telegram session and WalletConnect have passed, and production release approval is active.
3. Deploy only using the repository's `scripts/release-production.mjs` with a fresh protected encrypted backup, Wrangler's actual `d1 migrations apply --remote`, mandatory schema/foreign-key checks and versioned Worker deployment.
4. Run post-release smoke checks and safely remove this isolated clone containing production-derived data when it is no longer needed.

**No production D1 migration or new Worker application deployment was performed during this rehearsal.**
