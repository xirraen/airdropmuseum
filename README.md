# Airdrop Museum

A mobile-first, Indonesian-language airdrop research museum deployed as `airdrop-museum` on **Cloudflare C0**. The editorial porcelain-and-teal UI is designed around evidence, provenance, lifecycle, and visitor judgment.

Public launch caveats and remaining deployment checks are documented in [docs/PUBLIC_LAUNCH_READINESS.md](docs/PUBLIC_LAUNCH_READINESS.md). UI comparison and design adaptations are in [docs/UI_REFERENCE_RESEARCH.md](docs/UI_REFERENCE_RESEARCH.md). These documents prepare the code; they do not establish that a live public domain is deployed or verified.

## Seven navigable areas

| Menu | Purpose |
| --- | --- |
| Museum | Overview, demo-data disclosures, and routes into the catalogue, archive, portfolio, and methodology |
| Galeri | Search and browse the built-in fictional samples or user-added entries by category/chain; no editorial safety ranking |
| Portofolio | Local watchlist, progress, checklists, priorities, personal notes/deadlines, and calendar/ICS tools |
| Arsip | Historical lifecycle records and a manual cost/reward ledger; outcomes remain user-reported |
| Suara Pengunjung | Private, browser-local notes and ratings; not public reviews or identity-verified reputation |
| Profil | Local profile, integration status, data/privacy controls, and full JSON backup import/export |
| Ajak | Share/copy a canonical museum link; no referral attribution, click count, points, or rewards |

Data is stored in this browser. There is no shared backend storage, authenticated login, live campaign ingestion, wallet connection, or automated eligibility verification. Six built-in projects are fictional samples; custom projects are supplied by the user and **not automatically verified**. Manual accounting is not a wallet balance. Completed research tasks do not establish eligibility.

## Development

- `npm run build` regenerates `src/worker.mjs` from `dist/`.
- `npm test` runs the model, backup, calendar and Worker route tests.
- Preview: serve `dist/` with a static HTTP server.
- Deploy: authenticated Wrangler `npx wrangler deploy`; account pinned in `wrangler.jsonc`.
- Read-only endpoints: `/api/health`, `/api/projects` (built-in demo catalog only; personal projects remain browser-local).

## Data portability

Version 1 bookmarks/checklists migrate to the version 2 data model. Full backups preserve custom projects, project management records, completed tasks and activity. Import merges bookmarks, custom projects and completed tasks; existing project management settings take precedence. Invalid custom IDs, non-HTTPS sources, oversized imports, unknown tasks and invalid accounting fields are handled at the data boundary.

The catalog supports up to 100 custom projects and 30 tasks per custom project. Project data is escaped when rendered. Do not enter credentials, seed phrases, private keys, or secrets in research notes.

## Telegram

Display SDK supports ready/expand, header/background colors and the native back button. Telegram identity is not trusted without server verification. A project bot token (stored as a Worker secret) and bot/channel usernames are still needed for verified authentication, launch-menu configuration and synchronization. Desktop browser checks do not verify native Telegram behavior.

## Version 0.3.0

Replaces repeated catalog/progress screens with six connected workflows. Adds custom-project creation, kanban stages, priority, research notes, personal deadlines, calendar navigation/ICS, archive/reopen, manual USD ledger, profile editing and complete portable backups. Existing brand and C0 deployment are retained.

## Version 0.4 — The Open Museum

See `docs/WHITEPAPER_ALIGNMENT.md` for the implemented whitepaper map. Museum-style editorial UI replaces the generic dashboard framing. Gallery, Portfolio, historical Archive and Visitor Voice form distinct workflows. Exhibit dossiers, campaign stages, local reviews and source inspection are included in portable browser-local records. Public trust scoring, crawler aggregation and public community reputation remain unimplemented and are visibly labeled.

## Version 0.5 — server core

Adds a D1-backed server foundation and private Telegram sync path, preserving the latest Ajak/privacy/UI changes. See `docs/SERVER_CORE.md` for configuration, API, migration, privacy and rollback details. The shared catalog starts empty; the six demo projects remain clearly identified. Private sync stays disabled until this project's bot secret is configured. No existing legacy database rows are migrated or exposed.

## Version 0.6 — unified product navigation

Consolidates navigation into Beranda, Jelajahi, Portofolio and Profil. Invitation sharing moves inside Profile; calendar/archive become Portfolio tools; transparency methodology becomes a Gallery tool. A shared navy/silver visual system replaces disconnected panels. Exhibit detail has three focused tabs with session draft preservation. See `docs/UI_STRUCTURE.md`. Existing D1/auth/sync behavior and local data remain compatible.

## Version 0.7 — progression, missions and bounty workbench

Portfolio is now inside Profile. Misi & Bounty adds seven local XP missions, daily activity XP, levels/streaks, eight badges, a three-question wallet-safety lesson, glossary, four planning templates and external resource cards. A separate D1 ledger implements verified Telegram referral/learning XP with idempotent rewards, self-referral rejection and a daily inviter cap. See `docs/XP_AND_REFERRALS.md` for exact rules and activation requirements. Referral rewards remain inactive until the project bot secret/session are configured; browser XP is always explicitly local and non-financial.

## Platform 1.0

The supplied aggregator/community blueprint now has a complete implementation map in [docs/BLUEPRINT_COVERAGE.md](docs/BLUEPRINT_COVERAGE.md). Network pages are nested under Jelajahi; token records and authenticated profile settings are also available from Profil. Run `npm ci`, `npm run build`, `npm test`. `npm run dev` uses an isolated in-memory SQLite database and is not a production data store. Apply migrations through `0003_platform.sql` before deploying this release. Configure exact moderator IDs, this project's bot/email credentials and WalletConnect project ID before enabling those services. Generated delivery/AI behavior always honors account opt-in and server-side quotas.

Version 1.1 adds a guest device ledger, revisioned asset edits/archive/CSV, browser session controls and local contribution drafts. See [docs/WORKBENCH_1_1.md](docs/WORKBENCH_1_1.md). Apply migration `0004_workbench.sql` before deployment.

## Action Desk 1.2

Misi & Bounty now starts with a unified personal action queue: blocked tasks, verification follow-ups, dates, source reviews and next steps. Includes combined filters, direct checklist changes, thirty-row pagination, and a previewable Markdown work plan. No database migration. See [Action Desk notes](docs/ACTION_DESK_1_2.md). Build and 85 tests pass.
