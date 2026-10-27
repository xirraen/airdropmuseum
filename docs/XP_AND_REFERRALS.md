# Progression and referral XP — 0.7

## Navigation and scope

Primary navigation: Beranda, Jelajahi, Misi & Bounty, Profil. Portfolio, calendar and outcome archive are Profile tools. Profile also holds Badge & XP, referral sharing and data/integrations. Existing portfolio/calendar/archive hash routes remain supported and highlight Profile.

The mission center includes seven one-time local objectives, a daily research objective, level progression, streak tracking, eight achievement badges, Wallet Safety 101, eight glossary entries, four editable bounty/testnet/community planning templates and four external resource links. Templates are not active paid campaigns. Bounty scope, actual reward terms and eligibility must be checked with the source program.

## Two separate XP domains

Local exploration XP is derived from explicit objective claims in browser state. Mission XP: first saved exhibit 20; custom sourced project 50; three completed research tasks 60; two evidence categories in a dossier 75; review of at least 40 characters 30; scheduled deadline 25; safety quiz 50. Each is claimable once. A meaningful research/learning action enables a 15-XP daily mission once per local calendar date. Activity days determine a consecutive streak, allowing the current day to remain unfinished. XP travels with backups, and merged claim keys are deduplicated. Earned badges persist as unlocked milestones even if a project is later removed or the streak ends.

Levels use threshold `100 * (level - 1)^2`. Level names are Newcomer, Explorer (2+), Researcher (3+) and Curator (5+). These are app progression indicators, not on-chain credentials, trust scores, identity verification or financial balances. Local state can be modified by its owner; it is never credited as server XP.

## Server referral rules

- Requires a valid signature for this project's Telegram bot. No wallet, referral payment or token transfer exists.
- An opaque server-generated invite code represents the inviter. A recipient explicitly binds a code before completing verified Wallet Safety 101.
- Self-referrals, already-bound recipients and recipients already qualified are rejected. The binding statement itself checks qualification atomically.
- A passing answer vector is checked server-side, then a transactional D1 batch records a unique 50-XP learning event.
- Qualification awards the recipient a unique 25-XP welcome event when a referral is present. The inviter receives 100 XP once for that recipient.
- Inviter bonus limit: ten qualifications per UTC day. Beyond that, qualifications are still recorded but no further inviter XP is credited for that day's events.
- Repeated requests do not duplicate awards because ledger keys are unique and SQL operations are transactional.
- Balances are calculated from the private server ledger, not client-supplied XP or imported backups. Per-account counts and ledger are available only to that authenticated account.
- A signed Telegram account is not proof of a unique human. This is basic integrity protection, not a full Sybil-resistant identity/reputation system.

Code binding, account XP reads, and quiz verification are explicit user actions. Generic sharing without an active verified account does not produce referral attribution or XP. The UI shows a generic link and disabled account actions until the project bot secret and session are available.

## Migration and activation

Apply `migrations/0002_rewards.sql` additively. Tables: `am_xp_accounts`, `am_xp_referrals`, `am_xp_ledger`. Existing legacy/core data is retained. `/api/capabilities` exposes whether reward schema and bot authentication are configured. Production referral XP remains inactive without `TELEGRAM_BOT_TOKEN`; synthetic test credentials are used only for isolated tests.

Endpoints: GET `/api/me/rewards`, POST `/api/me/referral` with `{code}`, POST `/api/me/qualify` with `{answers}`. They inherit signature validation, origin checks, body limits, non-cacheable responses and method restrictions from the server core.

## Learning sources checked 27 October 2026

- Ethereum security: https://ethereum.org/security/
- Ethereum scam/approval guidance: https://ethereum.org/community/support/scams/
- Immunefi program directory: https://immunefi.com/bug-bounty/
- Solana documentation: https://beta.docs.solana.com/

Links are shown with source inspection before external navigation. Resource inclusion is not an endorsement of any campaign, a security audit, or a reward promise.
