# Permission-gated provider discovery (production-first)

This integration never copies arbitrary Airdrops.io pages or scrapes CryptoRank HTML. It uses the existing private Discovery review queue, audit-protected Admin Console and existing D1 schema. No database schema migration is required, but this is a full application release: isolated staging, recovery, security, and operator approval gates still apply (docs/RISK_SCOPED_RELEASE.md).

## Legal and operational prerequisites

- **CryptoRank:** obtain an API key for the licensed Drophunting API and a suitable data-reuse agreement for the intended use. Current official reference: https://api.cryptorank.io/v2/docs and https://cryptorank.io/terms-and-conditions . Do not assume public website availability grants an extraction or republication license.
- **Airdrops.io:** the site's published Terms of Use restrict copying/republication, including public display. Obtain affirmative written authorization for the feed and intended reuse before enabling. https://airdrops.io/terms-conditions/ . Its robots.txt is not a content license.
- Credentials and license authorizations must **never** enter repository files, browser JavaScript, D1 source URLs or Cloudflare KV logs.

## Source registration via /admin

Both sources start **disabled** through authenticated `POST /api/admin/discovery/sources`. Review, preview, then explicitly enable with a separately audited action.

| Name | source_type | feed_url | Poll cadence |
| --- | --- | --- | --- |
| CryptoRank — Licensed Drophunting API | `json_feed` | `https://api.cryptorank.io/v2/drophunting/activities?limit=100` | at most 1 request / 6 hours |
| Airdrops.io — Permissioned RSS | `rss` | `https://airdrops.io/feed/` | at most 1 request / 6 hours, conditional HTTP requests where supported |

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


## Multi-source opportunity research (18 November 2026)

Research providers complement, but never replace, a project's official announcement.
No source below auto-publishes a campaign or asks for wallet signatures.

| Provider | Source role | Interface | Operational prerequisite | Poll cadence |
| --- | --- | --- | --- | --- |
| Airdrops.io | Aggregator reference | https://airdrops.io/feed/ (RSS) | Written reuse permission and AIRDROPS_IO_LICENSED=YES | 6 hours |
| CoinGecko | Editorial airdrop research | https://www.coingecko.com/learn/category/airdrop-guides | Reference links only; no official airdrop-list API verified | Manual |
| DeFiLlama | TVL research signal, not token verification | https://api.llama.fi/protocols (JSON adapter) | Commercial reuse terms reviewed and DEFILLAMA_DATA_LICENSED=YES | 24 hours |
| CryptoRank | Drophunting metadata | https://api.cryptorank.io/v2/drophunting/activities?limit=100 (JSON adapter) | Licensed key and CRYPTORANK_API_LICENSED=YES | 6 hours |
| RootData | Funding rounds (Plus/Pro) | https://api.rootdata.com/open/get_fac (JSON adapter) | Licensed key and ROOTDATA_API_LICENSED=YES | 24 hours |
| RootData | Incentive events (Pro) | https://api.rootdata.com/open/get_event (JSON adapter) | Pro API key and ROOTDATA_API_LICENSED=YES | 24 hours |

### Implementation details

RootData requests use POST with server-side apikey and Content-Type: application/json.
A funding request has body {"page":1,"page_size":10} and the incentive
event request has body {"page":1,"page_size":10,"type":21}. There is no
pagination loop. At most 10 items are requested per endpoint daily.
Depending on actual billed responses, both endpoints at full capacity
could use about 30 credits per day (funding 2 per row, events 1 per row).
Do not activate without verifying quotas and explicit data reuse rights.

DeFiLlama returns a bulk protocol list. The adapter allows up to
10 MiB per response, selects up to 40 projects with TVL >= USD 5M and
no token symbol reported IN THIS DATASET, labels token/airdrop status
UNVERIFIED, and sends short metadata to private review. Missing symbol
does not prove a token is unissued. High TVL or large funding does not
establish probability of an airdrop. An open API is not automatically a
commercial redistribution grant; keep this adapter off until reviewed.

The five external sources are visible on the Home and Discovery pages
as research reference links, separate from production D1 campaigns.
CoinGecko is not scraped or treated as an official airdrop-list API.
Only official project statements can support CONFIRMED. Source ingestion
remains bounded, fingerprinted, deduplicated, and moderated.

### Operator workflow

First obtain permission and confirm plans, then configure Cloudflare
Worker production secrets (never put keys in GitHub, feed URLs or D1):

- ROOTDATA_API_KEY (secret), ROOTDATA_API_LICENSED set to YES only with a licence.
- DEFILLAMA_DATA_LICENSED set to YES only after checking commercial rights.
- Existing CRYPTORANK_API_KEY, CRYPTORANK_API_LICENSED and AIRDROPS_IO_LICENSED apply unchanged.

Open the authenticated /admin Discovery tab, register a provider source
as disabled using the exact URL/type above. Preview and verify the
response, attribution and source reliability. Enable in a separate
audited operation. Cron will enqueue candidate metadata, not publish
campaigns. A review conversion creates a private draft.

Test locally with npm test, npm run lint, npm run typecheck,
npm run build, npm run test:runtime and npm run test:e2e. Before any
production release, finish the full 13-gate release policy: an encrypted
backup of current D1, verified isolated restore and erasure replay,
physical-device WalletConnect tests, staging and rollback verification,
commit-bound release evidence, dependency audit, binding checks and
explicit operator approval. Do not deploy while release issues #24 or
#39 remain unresolved. A Wrangler dry-run alone is insufficient.

Official documentation:
- RootData https://www.rootdata.com/api/doc
- DeFiLlama https://github.com/DefiLlama/api-docs/blob/main/llms-free.txt
- DefiLlama terms https://defillama.com/terms
- CoinGecko https://www.coingecko.com/learn/category/airdrop-guides
