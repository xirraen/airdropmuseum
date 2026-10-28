# Migration reconciliation

Verified 28 October 2026 (Asia/Jakarta). Status: PRODUCTION BLOCKED. No remote writes, migrations, backup exports, or deployments were performed in this execution.

Production C0 database 4e75c8b9-6c58-4bac-a180-01e5bec0d0a3 records exactly 0001_core.sql through 0005_aggregator_core.sql; maximum am_core_schema version is 5. Remote PRAGMA foreign_key_check returned no violations.

Existing staging 461404c7-a2c6-4222-bb13-6aa26fce2332 has schema marker 11, autopsy_events and immutable UPDATE/DELETE triggers, no foreign-key violations, and no d1_migrations table. Do not apply the complete Wrangler migration chain there. Create a fresh isolated staging DB, or perform a separately reviewed reconciliation before using Wrangler.

The candidate has 13 actual migration files: the 12 existing RC files plus forward-only 0015_registry_decision_bridge.sql. No previously applied migration was edited. The new migration projects aggregator campaign metadata into reserved agg_ canonical IDs, links them via campaign_registry_links, keeps new mirrors private and preserves historical rows on namespace collisions. It updates existing campaigns without changing their stored values to backfill the projection. Schema marker becomes 12. Detect and resolve any unlinked namespace collision before rollout. The migration does not invent a decision for existing subscriptions.

Fresh local SQLite chain validation passes with foreign keys enabled and checks required immutable/bridge triggers. Local tests cover owner decision isolation, namespace collision preservation, follow-event idempotency, compensation and refollow. This is not evidence of a remote D1 migration or a workerd test. An older non-event-sourced 0014 requires a separate historical-data transition; 0015 is not that transition.
