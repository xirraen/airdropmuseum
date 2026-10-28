# Direct Cloudflare staging verification

Updated 29 October 2026 (Asia/Jakarta). GitHub Actions bypass authorized by the user due to limits.

## Production backup and isolated restore

Complete production SQL export: 49 tables, integrity OK, foreign keys OK, schema marker 5, five migration checkpoints. Export/checkpoint/manifest and row counts are kept privately outside Git. Fresh private remote D1 restore: all 49 counts matched. Wrangler applied missing migrations and verified all 15 filenames; schema 14, FK clean and immutable UPDATE/DELETE triggers present. No public Worker is bound to this user-data clone.

## Synthetic application staging

Worker: https://airdrop-museum-e2e-direct.xirraen.workers.dev/

A separate empty D1 received all 15 migrations via Wrangler, then a synthetic ended-campaign fixture. The uploaded candidate uses only that DB and an isolated synthetic authentication secret, with no production bot token, queues, cron or AI. Twelve real Worker/remote D1 API scenarios passed. Direct SQL UPDATE and DELETE against synthetic immutable events were rejected with EVENT_IMMUTABLE. Synthetic account/session tests do not certify actual Telegram or wallet interoperability.

Browser checks: Registry and Decision Journal load; 390×844 viewport has document width 375, no horizontal overflow. Production data was not used in the UI.

The original historical staging database lacks reliable d1_migrations history and was not reused or overwritten. No production migration or Worker deployment occurred. Real mobile/wallet/Telegram sessions and complete historical personal-data erasure remain outstanding.

## Telegram bot identity

The user supplied @airdropmuseum_bot. Browser verification of https://t.me/airdropmuseum_bot showed Airdrop Museum 🏛️, the matching username and Start Bot. The public landing page does not establish Mini App menu configuration, launch target, a valid Telegram initData session, or wallet interoperability. No message or /start was sent by the agent. Actual user/device launch remains unverified.
