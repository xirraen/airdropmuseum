# Full blueprint implementation map — 1.0.0

All sections of the supplied blueprint are mapped below. Implemented code is distinguished from production activation and external dependencies; this release is a foundation, not a claim that every provider and moderation workflow has been operated end to end.

| Blueprint area | Implementation | Activation / scope |
|---|---|---|
| Wallet authentication | EOA EIP-191 signature, server-generated domain/chain-bound nonce, five-minute expiry, atomic one-time use, hashed seven-day HttpOnly session, logout | Injected MetaMask/Rabby; no transactions; smart contract wallets excluded |
| WalletConnect | Lazy-loaded provider adapter and QR modal | Requires operator's WalletConnect Project ID |
| Email authentication | Six-digit code, hashed storage, expiry, attempt/rate limits, verified email session | Requires Resend API key and verified MAIL_FROM |
| Profile / privacy | Server username, six vector glyph avatars, favorite chains, private by default, public leaderboard opt-in | No arbitrary remote avatar tracking; public posts remain public |
| Directory | Existing private/demo filters, source-backed campaign metadata, public shared source directory, import into private research, versioned API | Shared directory starts empty; moderator publishes real sourced entries; no fake active campaigns |
| Campaign detail | Requirements, steps, risk dossier, source URLs, explorer URLs, snapshot/deadline, personal change journal | Links and user statements are not independent verification |
| Activity | Four task states, local proof checkpoints, cloud revision sync for wallet and Telegram accounts | No blanket eligibility assertion |
| Read-only wallet | Native balance, transaction count through the connected wallet provider | Only on user action; currently native EVM observation, not universal portfolio indexing |
| Community | Six channels, tagged posts, threaded comments up to six levels, vote replacement/reset, bookmarks, share/deep links, live threads | Public read; authenticated writes; polling every 30 seconds while visible and idle |
| Moderation / Scam Watch | Private evidence reports, independent moderator review, hide/restore, verified report publication, audit log | Requires exact MODERATOR_IDS allowlist; first sign-up never becomes administrator |
| Reputations / badges | Unique server reputation events for reviewed useful guides, verified reports, and chain quests; contributor label | Local XP excluded from public reputation; votes do not mint reputation |
| Leaderboards | Contributors, distinct verified quest activity days, verified scam reports | Private profiles omitted; no synthetic users |
| Security | Client/server English BIP-39 word-run and raw key detection, HTTPS source validation, moderator domain reference list, edit-distance/punycode signals | Heuristics can false-positive/false-negative; not a phishing oracle or comprehensive risk scanner |
| Transaction preview | Provider eth_call and eth_estimateGas; ERC-20 allowance read; large allowance and approve-selector warnings | No broadcast, revoke or claim execution; simulation does not prove safety |
| Notifications | Server inbox: reply, mention, report review, synced source updates and dates; read markers | Polling, not persistent websocket transport |
| External reminders | Hourly cron; opt-in queue; email, Telegram, Discord, Web Push adapters; bounded retries; subscription removal API | Email/bot need credentials; Discord needs user's webhook; push needs browser permission and supported provider |
| Portfolio | Server token records, claim/vesting state, amount/cost/manual price, CoinGecko price refresh, partial-value and PnL display | Manual ledger, not verified balances; missing prices marked unknown; not complete tax/PnL accounting |
| AI assistant | Cloudflare Workers AI summary, conditions, unknowns, gas variables, red flags and contract explanation, three requests/account/UTC day | User explicitly submits material; no audit or eligibility guarantee; no browsing or wallet action |
| On-chain quests | Moderator-defined EVM contract/selector, RPC ownership/success/target check, 12 confirmations, tx replay protection, idempotent points | No quests are fabricated. Ethereum and Base RPC configured; other chains need operator RPC bindings |
| Public API | GET /api/v1/airdrops, /api/exhibits, /api/platform/posts, /thread, /leaderboard, /scam-watch, /domains, /quests | Bounded results; posts have cursor pagination |
| Pages | Existing landing/home, directory/detail, personal portfolio, profile, calendar, Radar plus Network community, account/privacy, inbox, Scam Watch, leaderboards, wallet tools, AI and moderator desk | Main navigation stays four destinations; Network nested under Jelajahi and profile shortcuts |
| Data | Additive D1 migration 0003: users, sessions, challenges, posts, comments, votes, bookmarks, reports, reputation, notifications, preferences, delivery queue, domains, quests, claims, holdings, push subscriptions | Existing project state remains normalized JSON with revision checks; am_user_tasks reserved for relational projection |

## Credentials and operator setup

- `MODERATOR_IDS`: comma-separated exact user IDs (`wallet:0x...` lowercase or `tg:123...`). Configure only verified owners; never grant the first public registrant automatic rights.
- `WALLETCONNECT_PROJECT_ID`: public provider project ID. WalletConnect bundle loads only when requested.
- `EMAIL_API_KEY` secret + `MAIL_FROM`: Resend sender. Email code delivery and email reminders remain unavailable until configured.
- `TELEGRAM_BOT_TOKEN` secret: this project's bot only. No token from other projects is reused. Users must start/login through this bot before opting into its messages.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: generated for this Worker and stored as secrets. Private key never enters Git or client responses. Public key returned to browser for an opt-in push subscription.
- `AI`: Cloudflare AI binding, model `@cf/meta/llama-3.1-8b-instruct`.
- `RPC_1`, `RPC_8453`: fixed official PublicNode endpoint configuration. The server sends submitted transaction hashes to these services only for quest checks.
- `COINGECKO_API_KEY`: optional demo key for price API. No price is fabricated on provider failure.

Delivery is at-least-once: unique queue event keys suppress normal duplicate enqueue, but a crash after sending before acknowledgement can repeat a message for providers without idempotency support. Hourly sweeps process 20 synced accounts (up to five events each) and 20 deliveries per run; this bounded rollout is not a high-volume delivery guarantee. Notification data retained 90 days. Device time and all-day campaign dates still require source checks.

## Validation

68 automated tests cover old workflows and new wallet signature/session boundaries, replay/origin rejection, public/private data separation, nested comments, votes/bookmarks, moderation authorization, privacy, reputation deduplication, provider failure, AI quotas, server quest proof ownership/confirmations and opt-in/idempotent scheduling. Generated Worker modules import successfully. Browser verification covers public navigation and responsive views. No user wallet is signed, transaction executed, public test post published, or external reminder sent during deployment QA.

## Primary integration references

- https://viem.sh/docs/actions/public/verifyMessage (EOA utility scope)
- https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- https://developers.cloudflare.com/workers-ai/configuration/bindings/
- https://ethereum.publicnode.com/
- https://base.publicnode.com/
- https://github.com/resend/resend-openapi/blob/main/resend.yaml

Asset delivery regression: assets are compressed inside the generated Worker to keep deployment size small, then decoded before returning the HTTP response. Edge compression is left to Cloudflare; this avoids double-encoding behavior in intermediary clients.
