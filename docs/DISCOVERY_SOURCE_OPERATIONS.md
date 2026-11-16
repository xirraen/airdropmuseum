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

## Safety and deployment status

No remote production source was seeded, no admin identity changed, no secret read, and no production write was needed to implement this feature. Keep the PR unmerged until CI and review pass. Rebuild generated assets via `npm run build`; source files `dist/admin.js` and `src/admin/*.ts` are the editable inputs.

Perform `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:runtime`, `npm run test:e2e`, and dependency/security scans before a controlled release. A real Telegram device and authorized admin session remain mandatory for final acceptance.
