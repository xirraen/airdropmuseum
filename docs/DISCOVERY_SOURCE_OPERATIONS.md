# Discovery source operations — authenticated Admin Console

## Why this change exists

On 16 November 2026 the production D1 database reported **zero registered discovery sources** and zero discovery items, despite a running cron. The previous Sprint 9 admin route exposed review queues but no authorized source registration flow. Legacy `/api/discovery/*` mutations return HTTP 410 and **must not** be re-enabled.

This feature adds source management under `/admin`, without modifying existing migrations, publishing campaigns, assigning roles, or altering live configuration. The production state above is a dated observation, not a permanent assertion.

## New endpoints

These operations use the existing `am_session` HttpOnly session, Admin Console origin/CSRF verification, rate limiting, and audit log:

| Route | Role | Behavior |
| --- | --- | --- |
| `GET /api/admin/discovery/sources` | moderator/admin/super_admin | List at most 200 feed sources and their operational status. |
| `POST /api/admin/discovery/sources` | admin/super_admin | Register a validated HTTPS RSS/Atom/JSON Feed; **disabled by default**. |
| `PUT /api/admin/discovery/sources/:id` | admin/super_admin | Change metadata or enable/disable scanning. |
| `POST /api/admin/discovery/sources/:id/fetch` | admin/super_admin | Explicitly fetch an enabled source into the private discovery queue; no publish. |

No hard-delete endpoint is exposed. Source URLs are immutable after discovery history exists, preserving evidence provenance; disable the old source and register a new one instead. Duplicate feed URLs return 409. Unrecognized fields, invalid HTTPS URLs, ambiguous `enabled` values, and disabled manual fetches are rejected. An absent discovery queue returns 503.

Audit trails record the actor, action and sanitized source metadata, but not full feed URLs, tokens, fetched content, or queue message bodies. The feed URL is visible only to authenticated admin/moderator readers of the source list; do not register URLs containing embedded credentials.

## Operator workflow

1. Complete identity verification and a least-privilege superadmin bootstrap **outside the application**. Production currently has no active admin. Do not guess the owner principal.
2. Sign in to the Telegram Mini App and activate its secure server session, then open `/admin`.
3. Open **Discovery** and inspect the source list, last fetch, error and new item counters.
4. Confirm each publisher's official RSS/Atom/JSON Feed URL, HTTPS host, robots/ToS permission, editorial ownership, and trust level. No broad crawling and no automatically generated list of feeds.
5. Register the feed. Newly registered sources are deliberately disabled.
6. Enable only the reviewed feed, then optionally run **Ambil feed**. This places short metadata in `DISCOVERY_QUEUE`; downstream review still starts as `pending_review`.
7. Review candidate items via the existing moderated queue. Conversion is a private draft, not an automatic campaign publication.

An empty source list is an **operational configuration gap**, not a scheduler failure. One UTC-minute Cloudflare trigger continues to run scheduled jobs at their previous cadences; existing database and queue bindings remain unchanged.

## Source provenance across queued work

Every newly enqueued feed item includes a SHA-256 fingerprint of the configured, normalized public feed URL. The D1 queue consumer compares that fingerprint with the currently registered source. Messages already in flight when an operator changes the source URL are acknowledged but ignored, rather than being misattributed to the replacement feed. The fetcher also rechecks the active source before enqueueing and conditionally updates its ETag/fetch cursor only when the original feed URL remains enabled.

Legacy queued messages without this field remain compatible during deployment. A source that already has discovery history cannot change its feed URL through the authenticated Admin API. No migrations or additional Cloudflare bindings are required.

## Discovery health diagnostics

The authenticated `GET /api/admin/health` endpoint now includes a source-aggregate `discovery` object. This gives operators an actionable reason when the global health status is degraded, without exposing full feed URLs or private user data.

| `discovery.reason` | Interpretation | Operator action |
| --- | --- | --- |
| `NO_SOURCES` | No sources registered. | Verify and register official publisher feeds. |
| `NO_ACTIVE_SOURCES` | Registered feeds are all disabled. | Review publisher permission, then enable a source. |
| `SOURCE_STALE` | One or more enabled feeds has not had a recent successful fetch. | Check cron, queue binding and last error for each feed. |
| `FETCH_ERRORS` | One or more enabled feeds has a recorded fetch/queue failure. | Inspect sanitized error code and the associated queue/DLQ. |
| `READY` | All enabled feeds have fetched successfully within the configured threshold. | Continue manual review. This does **not** certify campaign accuracy. |
| `DATABASE_UNAVAILABLE` | Discovery health query failed. | Investigate D1 without exposing raw database errors. |

Fields: `sources_total`, `sources_enabled`, `sources_recent`, `sources_with_errors`, `pending_review`, `last_successful_fetch`. The lag window is the validated `discovery_lag_warning_minutes` setting or 240 minutes by default. A successful fetch is **not** a guarantee that item records were classified, stored or published. In particular, `READY` can coexist with zero new feed items. The Admin Console health tab shows these metrics to authorized roles.

## Scheduled intake reliability and aggregate runtime evidence

The scheduler now runs each due source with bounded concurrency (three per batch; at most 20 per run) and isolates failures per feed. A malformed historic source or an upstream error does not prevent later sources from being scanned. A thrown exception is reduced to `DISCOVERY_FETCH_FAILED` and recorded on the matching active source only. Existing per-feed sanitized codes and 25-minute retry pacing remain intact.

On schema 9+ the scheduler also writes **aggregate-only** records in existing `operational_events`, without a migration:

- `discovery_run` — `idle`, `ok`, `partial`, `failed`, or `blocked`; `count` equals sources scanned and `duration_ms` measures runtime.
- `discovery_queued` — `count` equals extracted metadata sent to the private review queue.
- `discovery_fetch_failed` — `count` equals sources failing a fetch in that run.

No source URLs, source IDs, wallet addresses, Telegram data, or raw exception strings enter these aggregate records. If the telemetry store is unavailable, the fetch result is still returned. Admin Health now exposes `last_run_at` and `last_run_status`; `SCHEDULER_BLOCKED` distinguishes a missing queue from a healthy source with a previous successful fetch. A `cron_run` event alone is **not evidence** that discovery scanned or enqueued anything.

This does not add a discovery feed, activate a disabled source, or publish a campaign. Register sources only after manual source verification; do not treat elapsed cron time as a guarantee of verified airdrop intelligence.

## Safety and deployment status

No remote production source was seeded, no admin identity changed, no secret read, and no production write was needed to implement this feature. Keep the PR unmerged until CI and review pass. Rebuild generated assets via `npm run build`; source files `dist/admin.js` and `src/admin/*.ts` are the editable inputs.

Perform `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:runtime`, `npm run test:e2e`, and dependency/security scans before a controlled release. A real Telegram device and authorized admin session remain mandatory for final acceptance.
