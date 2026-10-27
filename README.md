# Airdrop Museum

A responsive, mobile-first airdrop research dashboard inspired by the supplied visual reference. Original branding, CSS artwork, violet/cyan dark theme, desktop sidebar, and mobile bottom navigation.

## Run

Serve `dist/` using any static HTTP server, e.g. `python3 -m http.server 8080 --directory dist`.

## Included

- Overview, searchable catalog, category filters, sorting, project details.
- Persistent local bookmarks and self-reported research checklists.
- Derived XP, progress, badges, and JSON export.
- Keyboard-accessible native modal, focus styling, reduced-motion support, mobile safe areas.
- No build step, npm dependency, wallet permission, transaction, or backend required.

## Data and limitations

All six catalog projects are **fictional demonstration data**. No claims of active campaigns, funding, expected payouts, or on-chain eligibility are made. Progress is browser-local and is not authenticated or independently verified. XP has no financial value. No real claim, referral reward, wallet connection, leaderboard, or social verification is implemented.

## Production roadmap

1. Add a curated backend catalog with official source URLs, review timestamps, campaign status and risk labels.
2. Add server-verified Telegram `initData` authentication, database-backed progress and account synchronization.
3. Add wallet connections with a documented chain choice and signatures only where required.
4. Add trusted task verification, abuse controls and an admin review workflow.
5. Publish verified campaigns only after source checks; keep research progress separate from eligibility.

## Deploy

Static directory: `dist`. Compatible with static hosting; no secrets or environment variables required. Google Fonts is optional; system font fallbacks work offline.

## v0.2 — C0 / navy & porcelain identity

- Profile artwork supplied by the owner is included as `dist/brand.jpg`, resized for delivery.
- White/porcelain background, navy accents, silver surfaces, responsive desktop/mobile layouts.
- Telegram SDK: ready, expansion, native header/background colors, back button and haptic feedback. No unverified Telegram identity is trusted.
- Validated JSON backup import merges bookmarks/completed tasks without overwriting existing completion.
- Cloudflare C0 account pinned in `wrangler.jsonc`. Separate Worker: `airdrop-museum`.
- Read-only endpoints: `/api/health`, `/api/projects` (demo catalog).
- Build: `npm run build`; tests: `npm test`; deploy using an authenticated Wrangler session with `npx wrangler deploy`.
- `src/worker.mjs` is generated from static assets; regenerate after edits. No database, secret, wallet integration, or verified login is configured yet.
- Telegram bot/channel usernames and project bot token are still required to configure the launch menu and authenticated account synchronization. Store any future token as a Worker secret, never in Git.
