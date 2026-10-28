# Direct Cloudflare staging verification

Updated 29 October 2026, Asia/Jakarta. User authorized direct deployment while skipping GitHub Actions.

Synthetic Worker: https://airdrop-museum-e2e-direct.xirraen.workers.dev/

An isolated synthetic D1 received all 17 migrations through 0019, schema 16. Fourteen real Worker/remote D1 API scenarios passed on the privacy candidate before the latest UI and payload-immutability refinements. Final bundle is built, but upload and final remote rerun are pending: the Cloudflare connector returned tool unavailable. WALLETCONNECT_PROJECT_ID was verified present after the user installed it. Preserve secret_text and secret_key bindings when uploading.

Normal event UPDATE and DELETE were rejected with EVENT_IMMUTABLE. Local tests additionally verify vault immutability, guarded privacy deletion, immutable receipts, owner isolation, stale confirmations, atomic rollback, pending external-ledger retries, missing-payload failures and idempotent erasure replay.

Actual old-snapshot recovery used only synthetic owners: erased owner payloads and links were removed, the other owner's payload and projection survived, and foreign keys remained clean. Replaying again was idempotent. Source writes were frozen for the ledger completeness barrier and restored to normal afterward.

Separate production backup recovery matched all 49 original table counts. Its temporary private clone was removed after verification; it was never bound to a public Worker. The original historical staging database was preserved because its migration history is unreliable.

Browser checks on the prior candidate: Registry and Journal rendered at 390×844 without horizontal overflow. User video confirms the old production Mini App launch/watchlist flow, not the new candidate's sessions or WalletConnect connection. Final browser and real WalletConnect checks remain pending.
