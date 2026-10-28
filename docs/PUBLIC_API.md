# Sprint 8 — Public API & Partner Feed

## Scope and release readiness

This branch extends Sprint 7's D1-backed `am_core_exhibits`, `verification_runs`, `campaign_source_links` and `source_conflicts`. It does **not** merge the separate Sprint 2–5 feature branches. Do not deploy migrations out of order or assume the full aggregator exists in `main` until the prerequisites are reconciled.

The public API is read-only. Only records where `payload.visibility = "public"`, the existing review status is not a draft, `source_url` is valid HTTPS, and an actual completed `verification_runs` row with `finished_at` exists are exposed. No automatic publishing is performed. `confidence_label` is a **platform assessment**, not a safety or eligibility verdict.

## Endpoints and pagination

- `GET /v1/openapi.json`, `GET /docs/api` — OpenAPI 3.1 schema and lightweight HTML documentation.
- `GET /v1/campaigns`, `GET /v1/campaigns/:slug`, `GET /v1/campaigns/:slug/sources`, `GET /v1/campaigns/:slug/timeline`.
- `GET /v1/deadlines`, `GET /v1/snapshots`.
- `GET /v1/feeds/campaigns.xml`, `GET /v1/feeds/deadlines.xml`.
- `POST /v1/webhooks`, `GET /v1/webhooks/:id`, `DELETE /v1/webhooks/:id` (partner API key only).
- `POST /api/admin/api-keys`, `GET /api/admin/api-keys`, `PUT /api/admin/api-keys/:id`, `DELETE /api/admin/api-keys/:id` (authenticated moderator only, existing `MODERATOR_IDS`).

List query parameters: `chain`, `category`, `status`, `snapshot_from`, `snapshot_to`, `deadline_from`, `deadline_to`, `kyc_required`, `updated_since`, `limit`, `cursor`. Date filters accept dates parseable into UTC ISO 8601; the chain filter supports a scalar `chain` or array `chains`. `limit` defaults to 50 and cannot exceed 100. Ordering is `updated_at DESC, id DESC`. The opaque, base64url cursor is bound to the filter set, sorting state, and collection kind. Do not modify it. A campaign without a completed verification run is deliberately absent even if its metadata says it is public.

Responses have a manual-verification disclaimer, HTTP ETag for GET results and `Cache-Control`. Cache validators do not bypass rate limits. The source list omits internal `trust_score`, raw conflict details, admin comments and private identifiers. All public campaign fields are an explicit allowlist, **not** a serialization of raw campaign payload JSON.

## Authentication and rate limits

Public reads may be anonymous or use `Authorization: Bearer am_v1_<64 lowercase hex>`. Admin creates a key via the protected POST route, then transfers it through a secure channel. The response shows the **raw API key only once**; list/detail/update responses never return it. D1 stores only SHA-256 digests of keys. Revoking a key disables its partner webhooks.

Default limits: anonymous **30/min**; free **60/min**, partner **300/min**, internal **600/min**. Authenticated custom limits are configurable in the API key record (1–600/min). Default daily quotas: free 2,000, partner 20,000, internal 100,000; configurable from 1 to 1,000,000. Rate enforcement is the Cloudflare `PUBLIC_API_RATE_LIMITER` binding at 600/min/key **plus** an atomic D1 minute/day counter for per-tier and daily quotas. `api_usage_log` stores aggregates, not raw IPs; anonymous IPs are one-way hashed with `API_HASH_PEPPER`. Atomic counters require a synchronous D1 write to avoid quota races; old aggregates are purged in a scheduled batched operation. Rate responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; HTTP 429 includes `Retry-After: 60`.

For example:

```sh
curl -i 'https://airdrop-museum.xirraen.workers.dev/v1/campaigns?chain=Base&limit=25'
curl -i -H 'Authorization: Bearer am_v1_...' 'https://airdrop-museum.xirraen.workers.dev/v1/deadlines'
```

## Webhooks and signature verification

Partner keys can subscribe only to:

`campaign.created`, `campaign.updated`, `campaign.status_changed`, `snapshot.upcoming`, `claim.opened`, `deadline.upcoming`, `source.conflict_detected`.

Example registration:

```json
{"url":"https://partner.example.org/hook","events":["campaign.updated","deadline.upcoming"]}
```

Only HTTPS hostnames with no credentials, IP literals, loopback/private names or non-standard ports are accepted. HTTP redirects are not followed. A delivery contains:

```json
{
  "event_id":"immutable-event-id",
  "event_type":"campaign.updated",
  "occurred_at":"2026-10-28T12:00:00Z",
  "campaign_slug":"example",
  "data":{"campaign":{"slug":"example","disclaimer":"Manual verification required"}},
  "source_url":"https://official.example.org/source",
  "disclaimer":"Manual verification required"
}
```

On registration, a signing secret prefixed `whsec_` is shown **once**. The D1 record stores only its SHA-256 hash. The Worker deterministically reconstructs that value using HMAC-SHA256 over the webhook UUID with `WEBHOOK_MASTER_SECRET` (which remains a Cloudflare encrypted secret, never in D1). **Changing this master secret invalidates existing signing keys** unless partners re-register.

Signature: HMAC-SHA256 using the *raw, exact request body bytes* and the returned `whsec_` string as HMAC key. Header is `X-AirdropMuseum-Signature: sha256=<hex>`. Also sent: `X-AirdropMuseum-Event` and `X-AirdropMuseum-Delivery`. Partners should compare signatures in constant time, reject unknown event types and deduplicate by delivery/event ID; never reconstruct JSON for verification. Incoming webhook payload size is limited to 16 KiB. The receiver should not follow unexpected redirects.

Example verification (Node):

```js
import {createHmac,timingSafeEqual} from 'node:crypto';
function verify(rawBody,signature,secret) {
  const expected='sha256='+createHmac('sha256',secret).update(rawBody).digest('hex');
  const a=Buffer.from(expected),b=Buffer.from(signature||'');
  return a.length===b.length && timingSafeEqual(a,b);
}
```

A 5-minute cron scans recent public updates, upcoming claim/snapshot/deadline events and new source conflicts, creating deterministic event IDs. Claim-open and status-change notifications require recorded timestamps, not inferred allocations. Webhook fanout is idempotent by `(webhook_id,event_id)`, with no user data. Delivery is queued on `PARTNER_WEBHOOK_QUEUE`, retried with exponential backoff for up to **five delivery attempts**, then routed to `PARTNER_WEBHOOK_DLQ`. DLQ messages are marked dead. Hooks disable after ten failed attempts across deliveries; the partner must register a fresh webhook. Delivery logs contain only limited status/error codes, never response bodies or secrets.

## RSS, attribution, privacy, data retention

RSS 2.0 items include title, canonical detail URL, stable GUID, pubDate, short description, category and `<source>` attribution. Every text/attribute value is XML-escaped. Only explicitly public, verified campaigns are included. RSS responses use 300-second public caching.

Privacy: no wallet addresses, user quest progress, user points, Telegram chat IDs, alert preferences, tokens, secrets, private keys, administrator endpoints or private campaigns are emitted. The schema contains no `is_safe`, `is_scam`, `guaranteed_reward`, or `expected_value` field. No API operation signs transactions or performs claims.

Retention: `api_usage_log` pseudonymous minute aggregates are deleted after **30 days** and `webhook_deliveries` metadata/payloads after **90 days**, by the five-minute cron. Only truncated server-side error codes (not response bodies) are logged. Key metadata and webhook registration remain until revoked/deleted by the authorized operator. Existing upstream registry/verification retention remains unchanged. Do not put PII in campaign descriptions; admin editorial screening remains mandatory.

## Worker bindings and deploy

Required pre-existing bindings: `DB` D1 and Sprint 7's prerequisite migrations. New bindings in `wrangler.jsonc`:

- `PUBLIC_API_RATE_LIMITER`: Workers Rate Limiting namespace `1008`, limit 600 per 60 seconds. The per-tier limits are enforced in D1.
- `PARTNER_WEBHOOK_QUEUE`: producer `airdrop-museum-partner-webhook`, consumer with `max_retries=4` and DLQ `airdrop-museum-partner-webhook-dlq`. DLQ consumer only marks terminal failures.
- `PUBLIC_API_ORIGIN`: absolute HTTPS origin used in RSS and safety checks.
- `PUBLIC_API_ALLOWED_ORIGINS`: comma-separated exact HTTPS browser origins accepted for CORS.
- Cloudflare encrypted secrets: `API_HASH_PEPPER` (random 32+ bytes), `WEBHOOK_MASTER_SECRET` (stable random 32+ bytes). Existing `MODERATOR_IDS` and login configuration are required for admin key management. **Do not commit these secrets.**

Create queues before deployment and apply all prerequisite migrations, then run:

```sh
npm ci
npm run build
npm test
npx wrangler queues create airdrop-museum-partner-webhook
npx wrangler queues create airdrop-museum-partner-webhook-dlq
npx wrangler secret put API_HASH_PEPPER
npx wrangler secret put WEBHOOK_MASTER_SECRET
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

The queue creation commands are one-time setup; existing queues should not be recreated. The migration is additive, but deployment should be postponed until the prior Sprint 2–7 branches are reconciled and real Cloudflare bindings (D1, rate limiting, queues) have been smoke-tested. No live deploy is claimed by this document. For rollback, revert Worker deployment only; preserve migration tables and event IDs pending careful data review.
