# Controlled production release (operator workstation)

**Source code:** `main`; the integrated PR #15 was merged as `038ce9f276999420da9bbd35d86f9ed1b8c54c29`.

Cloudflare production target is C0 Worker `airdrop-museum`, D1 database `4e75c8b9-6c58-4bac-a180-01e5bec0d0a3`.

The previous production D1 schema is version 5; this release expects version 16 after applying pending migrations through `0019`. The D1 records contain real user data. Never reset the production D1, manually insert migration history, or use a staging API token.

## Before executing

1. Obtain explicit approval and complete a **real isolated restore drill** of a current, protected production database backup. A cryptographic roundtrip or synthetic unit test alone is not a production restore verification.
2. Ensure the Cloudflare API token has the least necessary Worker/D1 permissions and the authenticated target is account C0.
3. Confirm Cloudflare bindings and queue consumers for `TRUST_CACHE`, `JOURNAL_ERASURE_LEDGER`, `AGGREGATOR_BACKUP_BUCKET`, `PUBLIC_API_RATE_LIMITER`, `DISCOVERY_QUEUE`, `PARTNER_WEBHOOK_QUEUE`, and analytics. Confirm all server-only secrets (Telegram, WalletConnect, `ADMIN_CSRF_PEPPER`, `BACKUP_SIGNING_KEY`) exist.
4. Test the integrated Mini App on a **separate** staging Worker, including authentic Telegram initData, WalletConnect mobile flow, Journal privacy/erasure and account isolation. Synthetic tests are not substitutes.
5. Store private encrypted backup files and their separate recovery keys in directories **outside Git**. Preserve external journal erasure receipts before restoring any historical snapshot.

## On a trusted Ubuntu workstation

From a clean local checkout of the updated `main` branch:

```bash
git pull --ff-only origin main
mkdir -p "$HOME/.local/share/airdropmuseum-private-backups"
mkdir -p "$HOME/.local/share/airdropmuseum-private-keys"
chmod 700 "$HOME/.local/share/airdropmuseum-private-backups" "$HOME/.local/share/airdropmuseum-private-keys"

# Export CLOUDFLARE_API_TOKEN in this shell from your password manager.
# Do not paste credentials into source files, shell history, CI logs or chat.
export PRIVATE_BACKUP_ROOT="$HOME/.local/share/airdropmuseum-private-backups"
export PRIVATE_BACKUP_KEY_ROOT="$HOME/.local/share/airdropmuseum-private-keys"
export AIRDROP_PRODUCTION_RELEASE=APPROVED
export RESTORE_DRILL_VERIFIED=YES

node scripts/release-production.mjs
```

The release runner fails before any database write unless all required confirmation, account identity, clean Git branch, backup directories, tests, source audit and encrypted backup stages pass. It then applies migrations with Wrangler, validates the live schema marker and foreign keys, and deploys Worker code.

**Do not set `RESTORE_DRILL_VERIFIED=YES` to bypass an unperformed restore.**

A code rollback does not undo migrations or erase immutable Journal events. If post-deployment checks fail, roll back the Worker code through Cloudflare Workers Deployments while preserving user data and source erasure ledger receipts.

## Current operational state

Merged to main and CI green on release candidate. The previous agent session could verify a fresh encrypted snapshot roundtrip but could **not** complete its actual restore. It also could not execute Wrangler in a trusted operator environment. No subsequent automatic deployment is claimed; verify live production migration/deployment status before running any command.
