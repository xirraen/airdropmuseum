# Permission-gated provider discovery (production-first)

This integration never copies arbitrary Airdrops.io pages or scrapes CryptoRank HTML. It uses the existing private Discovery review queue, audit-protected Admin Console and existing D1 schema. No staging and no schema migration are required.

## Legal and operational prerequisites

- **CryptoRank:** obtain an API key for the licensed Drophunting API and a suitable data-reuse agreement for the intended use. Current official reference: https://api.cryptorank.io/v2/docs and https://cryptorank.io/terms-and-conditions . Do not assume public website availability grants an extraction or republication license.
- **Airdrops.io:** the site's published Terms of Use restrict copying/republication, including public display. Obtain affirmative written authorization for the feed and intended reuse before enabling. https://airdrops.io/terms-conditions/ . Its robots.txt is not a content license.
- Credentials and license authorizations must **never** enter repository files, browser JavaScript, D1 source URLs or Cloudflare KV logs.

## Source registration via /admin

Both sources start **disabled** through authenticated `POST /api/admin/discovery/sources`. Review, preview, then explicitly enable with a separately audited action.

| Name | source_type | feed_url | Poll cadence |
| --- | --- | --- | --- |
| CryptoRank — Licensed Drophunting API | `json_feed` | `https://api.cryptorank.io/v2/drophunting/activities?limit=100` | at most 1 request / 6 hours |
| Airdrops.io — Permissioned RSS | `rss` | `https://airdrops.io/feed/` | normal feed cadence (25 min), conditional HTTP requests where supported |

CryptoRank is parsed as its official JSON API even though `source_type=json_feed` is used for D1 compatibility. An arbitrary JSON feed never receives the API key. Alternate CryptoRank API URL/hostname or an HTML search/scraper endpoint is rejected. Airdrops.io requests are restricted to the exact feed URL and do not traverse the rest of the site.

### Cloudflare runtime secrets

On the production Worker `airdrop-museum` in C0, configure the secret values **only after the rights have been verified**:

```sh
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put CRYPTORANK_API_KEY --name airdrop-museum
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put CRYPTORANK_API_LICENSED --name airdrop-museum
# Enter YES for the license acknowledgment, only with a valid license.

env -u CLOUDFLARE_API_TOKEN npx wrangler secret put AIRDROPS_IO_LICENSED --name airdrop-museum
# Enter YES only with explicit written permission from Airdrops.io.
```

The ingestion runtime fails closed with `PROVIDER_LICENSE_REQUIRED` or `PROVIDER_KEY_REQUIRED` when conditions are not met. A missing license is not a reason to bypass the gate or insert third-party content manually as verified.

### Review procedure

1. Register the source as disabled and preview after the provider rights/secrets exist.
2. Inspect up to ten sanitized metadata candidates in Admin Console; approve source activation separately.
3. Cron scans approved/active sources at bounded rates, enqueues only short metadata including source fingerprint and stable provider ID.
4. Queue consumer deduplicates, classifies and stores as `pending_review`. A provider status such as `CONFIRMED` is **not** independent confirmation by the project's official website.
5. Admin reviews and verifies the actual project's official rules and dates. Conversion creates a private draft, **never** a published or claimable campaign.
6. Periodically review source errors, rate-limit usage, permissions, status changes and deduplication. A licensed data source can be disabled without destroying provenance.

## Limitations

- No provider key or redistribution permission is provisioned by this repository.
- Existing source types are `rss`, `atom`, `json_feed`; migration 0010 has a CHECK constraint, so introducing an additional stored type would break production writes.
- CryptoRank uses API v2's documented `/drophunting/activities` endpoint with a single 100-item page capped to 40 queue entries. Pagination and v3 expansion require separate rate/credit/license review.
- An empty provider feed is **not** replaced with fictional campaigns; public project API remains backed by real D1 campaigns.
- This is not a claim of partner affiliation, automatic eligibility verification, project authorization or completed production deployment.
