# Sprint 6 — Discovery Automation

## Scope and compatibility
This sprint adds **private, administrator-reviewed discovery**. The current main branch has legacy migrations 0001–0004 (not the user-described Sprint 2–5 aggregator registry). Migration 0010 is additive and uses the existing am_core_exhibits table **only for converted private drafts**. It does not claim an aggregator campaign publication feature is already implemented.

## Architecture
1. The administrator adds an explicit HTTPS RSS 2.0, Atom or JSON Feed URL through /discovery.html (Moderator > Discovery). No implicit sources or broad crawling.
2. Cloudflare cron \`*/30 * * * *\` scans up to 20 enabled/due sources. The existing \`17 * * * *\` delivery cron is retained.
3. Fetcher requests only the configured feed, sends If-None-Match/If-Modified-Since where available, follows at most two validated HTTPS redirects, enforces a 9-second timeout and 512 KiB response cap, then extracts **only** short metadata.
4. DISCOVERY_QUEUE receives item metadata; consumer classifies keywords, calculates a fingerprint and deduplicates in D1. Items start as pending_review.
5. Admin reviews the private queue. Approval does **not** create a campaign. Conversion creates an am_core_exhibits record with review_status=draft and speculative/rumored payload, source evidence and a manual-verification disclaimer. The public /api/exhibits and /api/v1/airdrops endpoints exclude draft/pending_review exhibits.

## Feed formats and constraints
RSS 2.0 (item, guid, link, pubDate, description), Atom (entry, id, alternate link, updated/published, summary) and JSON Feed v1 (items, id, url, date_published, summary) are supported. No full article body, HTML content or on-chain secret is stored. Summaries are plain text capped at 500 characters, titles at 240. URLs must be HTTPS; credentials, fragments, common tracking parameters, loopback/IP-literal and local/private hostnames are rejected. Neither site pages nor source URLs are scraped, so page-level robots.txt fetching is not performed. If page fetch is added in a later sprint, robots.txt and site ToS must be checked first. Admin is responsible for confirming each feed permits automated access under its publisher's terms.

## Deduplication
D1 enforces unique (source_id, external_id), normalized URL and content_fingerprint. Fingerprint is SHA-256(lowercased title + "|" + normalized URL + "|" + published_at). Conflicts refresh last_seen_at without adding another row or campaign. All consumer writes are idempotent; retries do not change reviewed statuses.

## Classifier
Deterministic keyword signals: airdrop, points, testnet, quest, claim, snapshot and unknown. Examples: “airdrop claim is live” 0.8; “points season” 0.6; “incentivized testnet” 0.7; no signal 0. Confidence is only a triage heuristic, not verification or eligibility.

## Admin API
All /api/discovery/ routes require an authenticated existing session or valid Telegram initData **and** membership in \`MODERATOR_IDS\`. State-changing calls require the same-origin Origin header; IP-level rate limiting uses the pre-existing am_rate_limits table.

- GET, POST /api/discovery/sources
- PUT, DELETE /api/discovery/sources/:id
- POST /api/discovery/sources/:id/fetch
- GET /api/discovery/review (status, classification, source, date, confidence)
- GET /api/discovery/items/:id (includes review log)
- POST /api/discovery/items/:id/approve
- POST /api/discovery/items/:id/reject (body: rejection_reason)
- POST /api/discovery/items/:id/convert (optional project_name, chain, campaign_status: rumored/speculative)

A source with existing discovery history cannot be hard-deleted: disable it to preserve audit and referential integrity. Converted draft is **never public**, and project name, chain and manual evidence review remain mandatory before a future separately implemented publication process. No publishing endpoint is introduced here.

## Queue, retries and DLQ
Producer binding: \`DISCOVERY_QUEUE\` -> queue \`airdrop-museum-discovery\`. Worker consumer retries failed messages up to 3 times; dead-letter queue is \`airdrop-museum-discovery-dlq\`. D1 records sanitized \`QUEUE_ITEM_FAILED\` against the source after the final attempt. Queue body contains only title, brief summary, public URL, date, external ID and source ID. Never log full feed bodies, exception details or tokens. Inspect the DLQ manually, repair the cause, then selectively replay after checking uniqueness and source permissions.

## Deployment
1. Ensure pre-existing 0001–0004 migrations are applied. Apply 0010 with \`npx wrangler d1 migrations apply airdrop-museum --remote\` (review the pending set first).
2. Create Cloudflare queues once: \`npx wrangler queues create airdrop-museum-discovery\` and \`npx wrangler queues create airdrop-museum-discovery-dlq\`.
3. Set \`MODERATOR_IDS\` to exact authenticated user IDs (e.g., \`tg:12345\` or \`wallet:0x...\`); configure an existing \`TELEGRAM_BOT_TOKEN\` secret only if Telegram authentication is desired. Existing \`DB\` D1 binding must remain in place. Discovery needs no third-party API keys.
4. Run \`npm ci\`, \`npm run build\`, \`npm test\`. Deploy with \`npx wrangler deploy\` after verifying output and Cloudflare permissions. Do not deploy or apply migrations before review.

## Rollback
Disable the \`*/30 * * * *\` trigger and producer/consumer bindings, stop the queue consumer, drain or preserve the queue, then revert the code. D1 migrations are not automatically rolled back. Backup D1 first. After confirming no operational dependency and preserving audit records, manually drop (in dependency order) discovery_review_log, discovery_items and discovery_sources, then remove schema version 6. **Do not delete converted draft exhibits automatically**; reconcile \`campaign_id\` references first. Existing 0001–0004 tables are unchanged. Rollback SQL is intentionally not auto-executed.
