# Production release — Airdrop Museum (current)

Updated 19 November 2026. This is the active deployment procedure. Older AUD issue numbers, 13-gate evidence manifests, separate CSS-only release paths, and historical BLOCKED checklists are **not** release prerequisites.

## Production identity

- GitHub: xirraen/airdropmuseum, branch main.
- Worker: airdrop-museum, Cloudflare account 9880cf2cc57c2096f8c3ae253d9852e6.
- D1: airdrop-museum / 4e75c8b9-6c58-4bac-a180-01e5bec0d0a3.
- Public endpoint: https://airdrop-museum.xirraen.workers.dev/.
- Keep workers_dev:true while Mini App still uses this route. Setting it to false without a replacement route will take the Mini App offline.

## Code-only releases

The standard release publishes Worker code **without altering the production database schema or data**. No 13-gate AUD manifest, manual device-test certificate, backup-path environment variable, or restore-drill artifact is required for a code-only release.

1. Reconcile live code into main; never deploy older main over independently deployed features.
2. Work from a clean main checkout with the tested dependency lockfile and committed generated bundles.
3. Supply CLOUDFLARE_API_TOKEN from a private secure environment. Do not commit, print, or bind it to Worker runtime.
4. Run the read-only preflight and release:

       npm run release:readiness
       AIRDROP_PRODUCTION_RELEASE=APPROVED node scripts/release-production.mjs

5. The operator script validates target IDs and live ancestry, keeps the public route available, runs build/tests/parity, verifies binding destinations, reads D1 migration metadata, records the prior Worker version and deploys code. A public route smoke test runs after deployment.

## Database schema changes

Pending migrations require a **separate** additive-only migration operation with a current recoverable backup. The Worker release script never invokes a production D1 migration apply, so a code-only deploy cannot change user data.

## Recovery

If the smoke check fails, use the logged previous version ID to roll back code. Rolling back a Worker version does not restore database contents.

## CI

Pull requests retain unit/runtime tests, browser E2E, generated parity, source credential scan and dependency checks. These are technical correctness checks, not historical AUD issue checklists. Old evidence documents describe historical deployments only.
