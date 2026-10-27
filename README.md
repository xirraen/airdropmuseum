# Airdrop Museum

A mobile-first personal airdrop research workspace, deployed as `airdrop-museum` on **Cloudflare C0**. Porcelain, silver and navy branding follows the owner's supplied profile artwork.

## Six distinct tools

| Menu | Purpose |
| --- | --- |
| Dashboard | Active work, upcoming personal deadlines, recent activity |
| Discover | Search/filter directory by chain/category/source; add custom projects with HTTPS sources and research tasks |
| Workspace | Watchlist / in progress / completed boards, checklists, priorities, notes, deadlines |
| Calendar | Monthly personal deadlines, scheduled project list, ICS export |
| Archive | Archived projects, manual cost/reward/net ledger in USD, reopen through project status |
| Profile | Editable local display name, integration status, full JSON backup import/export, activity |

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
