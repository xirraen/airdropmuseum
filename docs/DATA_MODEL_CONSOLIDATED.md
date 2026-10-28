# Data Model Consolidated

> Ini adalah target konseptual untuk fase berikutnya, bukan schema yang seluruhnya sudah ada. Schema aktual saat ini ada di `migrations/0001_core.sql`–`0004_workbench.sql`; jangan menjalankan DDL di bawah tanpa desain SQL final, review dan test.

## Konvensi

Primary key opaque TEXT UUID; timestamps UTC RFC3339 ISO; foreign keys ON; integers bounded; monetary/points values integer minor units bila perlu; JSON hanya untuk payload versioned bounded, bukan relasi; semua private row membawa `owner_scope` (mis. `guest_local` tidak disimpan D1, atau `user:<id>`). Public data memerlukan `visibility='public'` dan status publish. Soft delete untuk user data bila dibutuhkan recovery, dengan purge schedule. Hindari alamat wallet mentah di log. Nama tabel target snake_case jamak; adaptasikan ke prefiks `am_` yang sudah dipakai tanpa rename destruktif.

## Tabel target dan relasi

| Entitas | Kunci/relasi/field wajib dan enum | Index dan ownership/retensi |
|---|---|---|
| `identities` | `identity_id`; `user_id`; `provider`, `provider_subject_hash`, `created_at`, `verified_at`; provider enum `telegram/email/wallet` | unique(provider, subject hash); privat; retain selama akun, hapus/unlink sesuai kebijakan akun |
| `campaigns` | `campaign_id`; slug/name; `lifecycle_status` (`draft/review/published/archived`), `claim_status` (`unknown/rumor/speculative/confirmed/live/ended`), chain/category, timestamps | unique slug; public hanya published; archive mempertahankan provenance |
| `campaign_sources` | `source_id`; campaign FK; canonical URL, publisher, source type, observed_at, checked_at, claim status | index campaign/checked; public jika terkait publik; retensi mengikuti catalog |
| `discovery_sources` | `discovery_source_id`; feed URL, kind (`rss/atom`), active, poll interval, last status | unique canonical URL; admin-owned; raw errors tidak berisi secret |
| `discovery_items` | `item_id`; source FK; canonical URL, content hash, title, discovered_at, review_status (`new/duplicate/reviewed/rejected/published`) | unique(source, hash); private editorial until reviewed; raw content bounded/retention pendek |
| `eligibility_rules` | `rule_id`; campaign FK; version; schema/predicate; source evidence; status (`draft/active/retired`); effective window | unique(campaign,version); admin-owned/public only after publish; version immutable |
| `eligibility_results` | `result_id`; owner user; campaign/rule version; wallet ref; status (`met/not_met/unknown`); evaluated_at, cutoff, explanation codes | index owner/campaign/time; private; retention configurable; delete with user |
| `wallet_watchlist` | `watch_id`; owner; chain_id, address normalized, label, created_at, consent_at | unique(owner,chain,address); private; delete/revoke path |
| `wallet_activity_snapshots` | `snapshot_id`; watch FK; block/time, provider, observation schema, status | index watch/time; private; bounded retention, no full tx payload unless justified |
| `claim_checks` | `check_id`; campaign FK, owner optional, source/evidence FK optional, status (`unknown/open/closed/result_reported`), checked_at, cutoff, notes bounded | owner private; shared public check only moderator-approved; TTL for transient checks |
| `alerts` | `alert_id`; event_type, aggregate, dedupe_key, occurred_at, payload schema, severity (`info/warning/critical`) | unique(dedupe_key); domain/internal; payload excludes PII; retention per audit policy |
| `alert_preferences` | `preference_id`; owner; channel (`in_app/telegram/email/push`), enabled, consent_at, destination ref | unique(owner,channel); private; erase/revoke immediately |
| `quests` | `quest_id`; version, title, rules, reward namespace, status (`draft/published/retired`) | unique(quest,version); public rules; moderator writes |
| `quest_progress` | `progress_id`; owner; quest/version; status (`not_started/active/submitted/verified/rejected/expired`), timestamps | unique(owner,quest,version); private; remove with owner |
| `points_ledger` | `entry_id`; owner; namespace (`museum_local/referral/quest`), event key, delta integer, reason, source ref, created_at | unique(namespace,owner,event_key); private; append-only; corrections compensating row |
| `decision_entries` | `decision_id`; owner; campaign ref optional; created_at, state (`open/revised/closed`), current event version | private; user delete/export; no public default |
| `autopsy_events` | `event_id`; decision FK; event type (7 event types defined in MASTER input), event_version, occurred_at, cutoff, payload version | unique(decision,event_version); append-only application policy; private; corrections compensating event |
| `claim_autopsies` | `autopsy_id`; decision FK; window_end/outcome_source; outcome status (`pending/reported/reviewed/unknown`), reviewed_at | private; create only after window closed or authoritative outcome; delete/export policy explicit |
| `api_keys` | `key_id`; owner/integration; hashed secret, scopes, created/revoked/expiry | unique hash; secret never stored raw or shown again; revoke immediate |
| `api_usage_log` | `usage_id`; key FK optional; route, status, bounded cost, occurred_at | index key/time; no raw request/PII; short retention |
| `partner_webhooks` | `webhook_id`; owner, endpoint, secret hash/reference, subscribed event types, enabled | private; URL SSRF validation, secret rotate/revoke |
| `webhook_deliveries` | `delivery_id`; webhook FK, event/dedupe, status (`queued/delivered/retry/dead_letter`), attempts, next retry | index status/next; bounded payload and retention; no secret in logs |
| `feature_flags` | `flag_id`; name, enabled, rollout config version, updated_by | admin-only; no personal targeting without privacy review |
| `system_settings` | `setting_key`; typed value, version, updated_by | admin-only; secrets must be secret binding, not table |
| `audit_log` | `audit_id`; actor scope/id, action, object ref, reason, occurred_at, correlation id | index object/time; append-only policy; exclude secret/payload PII |

## Relasi utama

Campaign 1:N campaign_sources, eligibility_rules, claim_checks. Discovery source 1:N discovery items; item dapat direview menjadi campaign source/evidence, bukan auto-merge. Rule version 1:N eligibility results. Wallet watch 1:N snapshots; hasil eligibility merujuk versi rule dan snapshot. User 1:N preferences, progress, ledger, decisions, holdings. Decision 1:N autopsy events dan 0:N autopsy review. Alert domain event 0:N notification/delivery; tidak disamakan dengan Telegram message. API key 1:N usage; webhook 1:N delivery.

## Ledger/enum yang tidak boleh dicampur

XP lokal browser saat ini tidak perlu dipindah ke ledger server tanpa consent. Referral XP server (`am_xp_ledger`) tetap domain terpisah dan nama target `namespace=referral`. Quest points bernilai nol/terpisah sampai aturan reward disetujui; campaign points **belum ditetapkan**. Tidak ada transferable token/balance dalam target ini.

Campaign lifecycle editorial (`draft/review/published/archived`) terpisah dari status informasi `rumor/speculative/confirmed/live/ended`. `unknown` bukan false. Hasil eligibility `unknown` adalah fail-closed untuk klaim positif.

## Migrasi dan rollback

Sebelum DDL: audit schema 0001–0004, snapshot D1, cek SQLite support, ukur ukuran/index, buat test migrasi up dan rollback pada salinan. Tambahkan satu migrasi per fase bernama berurutan `0005_...sql`; additive/backward compatible (nullable/additive columns, new tables/index), deployment expand → code dual-read/write bila perlu → backfill bounded → verify → contract hanya pada rilis terpisah. Jangan drop/rename kolom/tabel dalam rollback sederhana. Rollback aplikasi dahulu; untuk data migrasi gunakan compensating migration yang mempertahankan data. Penghapusan kolom/destructive purge memerlukan ekspor/backup terverifikasi dan persetujuan eksplisit. Simpan hasil migration test dan D1 schema version; tidak ada klaim rollback sebelum tes.
