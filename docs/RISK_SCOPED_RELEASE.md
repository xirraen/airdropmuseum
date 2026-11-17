# Risk-scoped production release policy — Airdrop Museum

Updated 17 November 2026. Production target: Cloudflare Worker `airdrop-museum` in account C0; data: D1 `airdrop-museum` (schema 17).

## Why deployment kept stalling

The historical `scripts/release-production.mjs` treated any change as a 13-gate full release, even if the only changes were presentation CSS. This is unnecessarily restrictive for a *genuinely style-only* update. But the current repository has a **mixed backlog**, and those full-release controls are justified whenever a release also changes Worker logic, Admin API, discovery, auth, wallet, D1 schema, bindings or runtime dependencies.

On 17 November the **actual live** Worker deployment `26576456-e095-4329-acee-37f4a2e70b27` reported:

- production commit: `eb29226ae06b9320085410a971f4e01a4c35d950`;
- deployed source artifact annotation SHA-256: `059dfc775c87bc9bf5b7fd5bae494b5d8b2aa34c0134fdc5ef52a35658ee3852`;
- 100% traffic on the Nov-4 version.

GitHub `main` had advanced **72 commits**, modifying source services, JavaScript, Admin API and configuration as well as UI. Therefore **current main is NOT eligible for the presentation release path**. Reclassifying it as a UI update to bypass backup/device requirements is forbidden.

## Release paths

| Path | Eligible changed files since the *currently deployed* commit | Requirements |
| --- | --- | --- |
| **Presentation** | A modification to existing allowlisted bundled `dist/*.css` only, optionally accompanied by added/modified `docs/*` or `tests/*` | Six reviewed evidence gates, live commit/version attestation, complete tests, staging E2E, binding verification, rollback drill, owner approval, D1 schema/FK readback, public and admin smoke |
| **Full** | Any JS/TS, HTML, dependency, runtime, migration, secret/binding/config, asset addition/deletion, renamed file, or mixed backlog | **All original 13 gates remain unchanged**, including current encrypted backup, isolated restore, erasure replay, Telegram/WalletConnect device tests, staging, rollback, operator approval |

The presentation path is deliberately **CSS-only**, not an arbitrary “UI” label. JavaScript controlling a wallet or API, HTML template changes, navigation, service workers and Worker static-asset bundling changes must all use the full path.

Neither path is an automatic CI deployment. Production changes require an operator-controlled machine and least-privilege Cloudflare API token **outside source, tickets, chat and Worker runtime**.

### Read-only preflight

From the clean current checkout:

```bash
CLOUDFLARE_API_TOKEN=<secret via approved secure environment> npm run release:readiness
```

The script reads the current Cloudflare Worker deployment and version annotations, obtains the actual production-base Git SHA, compares its tree to HEAD, and reports which tier is permissible. It lists missing evidence without reading backup contents or mutating Worker, D1 or R2. A missing token or unverifiable deployment annotation **blocks classification**; the base is never guessed. Optional `RELEASE_EVIDENCE_FILE` points to a private manifest to validate.

Do not paste token values into chat or logs. The environment variable above is illustrative only.

### Presentation-only operator release

The script `scripts/release-presentation.mjs` is separate from the existing full release runner and requires:

1. An exact, protected `main` checkout and clean worktree, with the GitHub origin verified.
2. `AIRDROP_PRESENTATION_RELEASE=APPROVED` and a private, exact-commit `RELEASE_EVIDENCE_FILE` whose `tier` is `presentation`.
3. `production_base_commit`, `production_deployment_id`, and `production_base_artifact_sha256` equal to the actual deployed Worker metadata. The production version must receive **100% of traffic** before applying the new candidate. A concurrent deployment aborts the process.
4. Six reviewed artifact hashes from `PRESENTATION_GATES` in `scripts/release-evidence.mjs`: `production_baseline`, `style_only_diff`, `staging_e2e`, `binding_inventory`, `rollback_drill`, and `production_approval`. The manifest must be current (within 24 hours) and held outside Git.
5. Passing locked dependency install, lint, wallet types, build, unit/integration, workerd D1 tests, Playwright mobile/desktop E2E, source credential scan, migration validation and high-severity dependency audit.
6. Matching live bindings and secret *names/types* (not values). D1 must already be schema 17 with no FK errors. **No migrations or database writes occur in the style path.**
7. A second live-version check immediately before `wrangler deploy --strict`. Wrangler must preserve config and attach commit/artifact provenance metadata. Afterward, GET / must return 200 with CSP, anonymous /admin must remain forbidden, and D1 schema/FKs must remain unchanged.

Run only after separately reviewing the six evidence artifacts:

```bash
AIRDROP_PRESENTATION_RELEASE=APPROVED npm run release:presentation
```

This runner **does not** attempt automatic schema rollback, erase journals, modify credentials, or turn a failed check into PASS. A partial post-release failure must be investigated by the operator using the reviewed rollback drill; reverting Worker code does not revert D1 data.

### Full application/security/data release

Continue using `scripts/release-production.mjs` with its original 13 gates and private encrypted backup/restore workflow. This policy does not remove or weaken any of those gates. See `docs/CONTROLLED_PRODUCTION_RELEASE.md` and the live acceptance tracking issue.

## Operational acceptance remaining for current main

- Fresh AES-256-GCM export of *current* production D1, authenticated decryption and a restore to an **unbound** D1 with erasure-ledger replay.
- Complete current-candidate staging and real WalletConnect device lifecycle. No signing, approval, transaction, claim, seed phrase or private key.
- Reconciliation of current production bindings, secret inventory, migration history, current-commit rollback/load and explicit owner review.

**Status on 17 November 2026: FULL RELEASE BLOCKED.** Source integration CI PASS and live D1 `PRAGMA quick_check` PASS are not substitutes for private recovery or authorized production deployment.
