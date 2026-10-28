# Sprint Prompts — siap tempel

## Cara pakai dan urutan

Jalankan satu sprint per perubahan terisolasi. Setiap prompt meminta implementer audit ulang commit terkini sebelum mengubah kode. Tidak ada sprint yang boleh menyatakan `DEPLOYED_VERIFIED` tanpa bukti live. Prompt lama Sprint 1–10 tidak ditemukan; nomor berikut adalah urutan fase konsolidasi, bukan klaim bahwa sprint lama telah dikerjakan. Kerjakan 0→8; sub-sprint 4a/4b/5a/5b membatasi lingkup.

### Sprint 0 — Architecture Reconciliation & Test Baseline
#### Prasyarat
Repo bersih, snapshot upstream terkini, akses baca file dan menjalankan npm.
#### Tujuan
Tetapkan baseline audit/status dan rencana kompatibilitas tanpa mengubah fitur.
#### Batasan
Tidak menambah fitur produk, tidak migrasi/deploy, tidak menghapus dokumen atau data.
#### Audit Awal
Audit README/docs, semua `src/dist/tests/migrations`, package/Wrangler/workflows; klasifikasikan dengan enum wajib dan identifikasi konflik. Jalankan `npm ci`, `npm test`, `npm run build`; laporkan dependency audit.
#### Implementasi
Perbarui dokumen arsitektur/status/glossary; usulkan struktur modular bertahap tanpa pindah file massal.
#### API
Tidak ada perubahan API; inventaris kontrak lama.
#### Data
Dokumentasikan schema 0001–0004 dan ownership aktual; jangan membuat migration.
#### UI
Tidak ada perubahan UI; pertahankan Bahasa Indonesia.
#### Test
Test/build yang ada; tambah hanya test harness/doc lint jika perlu.
#### Definition of Done
Status berbukti dan klaim unsupported terdaftar; test/build baseline dilaporkan.
#### Rollback
Revert dokumen saja; tidak ada perubahan runtime.
#### Deliverable
Audit snapshot, architecture target, backlog dan daftar blocker.

### Sprint 1 — Aggregator Foundation: Catalog + Evidence
#### Prasyarat
Sprint 0 disetujui; migration/test baseline lulus.
#### Tujuan
Perkuat registry campaign editorial, source/evidence versioning dan read model katalog publik.
#### Batasan
Katalog publik mulai kosong; tidak ingestion, auto-publish, source score, eligibility atau klaim otomatis.
#### Audit Awal
Periksa `dist/campaigns.js`, `dist/exhibits.js`, `src/api.mjs`, migration 0001, tests campaigns/exhibits dan docs.
#### Implementasi
Pertahankan record personal/local; rancang projection publik hanya moderator-approved. Tambah provenance/observed-at bila gap disepakati.
#### API
Dokumentasikan endpoint baca yang ada; perubahan bersifat kompatibel dan rate-limited.
#### Data
Jika diperlukan, tambah migration additive `0005_catalog_evidence.sql` setelah schema review, index/rollback diuji.
#### UI
Label demo, self-reported, source/date dan status belum diverifikasi dalam Bahasa Indonesia.
#### Test
Empty catalog, source validation, version/history, owner isolation, public projection, regression suite.
#### Definition of Done
Tidak ada custom/personal data bocor ke katalog; perubahan dan sumber dapat ditelusuri; test/build lulus.
#### Rollback
Disable projection/route atau rollback app; pertahankan data migrasi.
#### Deliverable
Registry/evidence API-contract, schema diff, docs dan test.

### Sprint 2 — Wallet Read-Only + Eligibility Evaluator
#### Prasyarat
Sprint 1 selesai; sumber/ruleset kampanye dengan versioning dan privacy review.
#### Tujuan
Satu jalur evaluasi terbatas yang menghasilkan alasan dan `unknown` saat data/rules tidak cukup.
#### Batasan
Tidak private keys/seed, tidak tanda tangan, tidak auto-claim, tidak menyatakan kelayakan universal. Wallet scan ≠ eligibility.
#### Audit Awal
Audit platform routes/RPC, provider configuration, `wrangler.jsonc`, portfolio, tests dan rate controls.
#### Implementasi
Implementasi terbatas pada chain/read yang disetujui; consent eksplisit; rule version + block/time cutoff; fail closed/unknown on errors.
#### API
Endpoint authenticated user-scoped, rate-limited; response includes scope, rule version, sources, evaluated_at, cutoff, limitations.
#### Data
Migration additive untuk watchlist/snapshot/rules/result hanya setelah minimisasi data, retention/delete dan rollback design.
#### UI
Minta alamat publik saja jika dibutuhkan; jelaskan read-only; tampilkan met/not_met/unknown dan alasan.
#### Test
Address validation, unsupported chain/provider timeout, rate limit, consent/revoke, isolation, reproducibility, no secret acceptance.
#### Definition of Done
Tidak ada status eligible dari observasi yang kurang; privasi, retensi, export/delete teruji.
#### Rollback
Disable feature route/flag; hapus hasil pribadi sesuai request; schema rollback non-destructive.
#### Deliverable
Bounded evaluator dan dokumentasi limitation.

### Sprint 3 — Snapshot, Claim Monitor & Alerts
#### Prasyarat
Catalog/source provenance stabil; consent/delivery boundaries disetujui.
#### Tujuan
Snapshot sumber/deadline dan internal notification workflow idempotent.
#### Batasan
Monitoring observasi, bukan claim transaksi/eligibility. Telegram opt-in saja; tidak kirim outbound sampai secret/provider staging teruji.
#### Audit Awal
Audit `src/delivery.mjs`, cron, alert/preferences, API routes, migration, test dan provider secrets availability tanpa menampilkan secrets.
#### Implementasi
Snapshot bounded; diff dan alert intent deduped; delivery outbox, consent check saat send, retry bounded/dead-letter.
#### API
Pisahkan read status user/admin/internal cron; rate limit dan auth scope.
#### Data
Tabel snapshot/alert/preferences/delivery additive, idempotency unique key, retention dan rollback.
#### UI
Preference per channel, opt-in, opt-out/revoke, status pesan dan batas notifikasi jelas.
#### Test
Duplicate cron, retry, opt-out race, provider down, payload redaction, timezone/deadline, deletion.
#### Definition of Done
Tidak ada send tanpa consent dan test fake provider; event != notification != Telegram message.
#### Rollback
Disable cron/adapter, drain/hold queue; simpan event audit.
#### Deliverable
Monitoring + alert flow dan runbook provider staging.

### Sprint 4a — Quest Tracker & Namespaced Points
#### Prasyarat
Rules quest tercatat dan ownership jelas; Sprint 0–3 relevant DoD lulus.
#### Tujuan
Konsolidasikan quest progress dan idempotent ledger tanpa melebur ledger yang ada.
#### Batasan
XP lokal, referral XP dan quest points berbeda; bukan nilai uang/reward token. Tidak ubah balance lewat client input.
#### Audit Awal
Audit `dist/rewards.js`, `src/rewards-api.mjs`, `platform-api`, migrations 0002/0003, tests.
#### Implementasi
Version quest, progress lifecycle, ledger namespace/event key, compensating entry untuk koreksi.
#### API
Authenticated owner routes; server validates reward conditions; audit privileged edits.
#### Data
Schema additive only; unique(namespace, owner, event_key), caps and retention.
#### UI
Tampilkan sumber poin, status verification dan batasnya; local vs server indicator.
#### Test
Idempotency, replay, self-referral, cross-user isolation, malformed value, caps, backups.
#### Definition of Done
Tidak ada kredit arbitrer/duplikat; ketiga ledger terpisah jelas.
#### Rollback
Disable quest rewards, preserve ledger history; compensating entries.
#### Deliverable
Quest progress/ledger contracts, migration, tests/docs.

### Sprint 4b — Decision Entry (baru)
#### Prasyarat
Evidence/source versioning dan policy retention tersedia; privacy review selesai.
#### Tujuan
Rekam keputusan personal secara temporal untuk pembelajaran retrospektif.
#### Batasan
Privat default, no predictions/EV/reward guarantees; jangan publikasikan tanpa consent per item.
#### Audit Awal
Cari ulang semua string/schema/model; pastikan fitur belum ada atau perbarui status jika bukti baru ditemukan.
#### Implementasi
Append-only application events: `decision_entry_created`, `evidence_attached`, `constraint_set`, `expectation_recorded`, `decision_revised`, `outcome_recorded`, `decision_closed`. `event_version` monotonik; `knowledge_cutoff_at` wajib; revisi sebagai compensating event.
#### API
Owner-only CRUD/append endpoints; no public reads; audit export/delete handling.
#### Data
Decision/event schema additive; payload versioned and bounded; immutable enforced by app/tests, jangan klaim tamper-proof.
#### UI
Form keputusan, constraints, expectation deskriptif (bukan return prediksi), cutoff terlihat; export/delete.
#### Test
Event monotonicity, cutoff, correction, access isolation, consent/publication, backup and deletion.
#### Definition of Done
Hindsight separation teruji; no user data public default.
#### Rollback
Feature disable, maintain data export/deletion; no schema destructive rollback.
#### Deliverable
Decision Entry private MVP + docs.

### Sprint 5a — Outcome Review & Claim Autopsy
#### Prasyarat
Sprint 4b; outcome source policy dan minimum post-window rule disetujui.
#### Tujuan
Review apakah outcome yang dapat diverifikasi sesuai keputusan historis.
#### Batasan
Outcome hanya setelah claim window berakhir atau hasil resmi tersedia. Self-report dilabeli. Tidak ada prediksi, scoring profit, expected value atau jaminan.
#### Audit Awal
Cari ulang autopsy/event/result yang sudah ada; pastikan tidak duplikasi dossier outcome/claim check.
#### Implementasi
Autopsy mengacu ke decision_id dan bukti; status `pending/reported/reviewed/unknown`; pattern hanya agregat dengan minimum threshold ditentukan sebelum analisis.
#### API
Owner-only; redaction/consent endpoint terpisah untuk Evidence Card.
#### Data
Migration additive, versioned outcome/source refs; retention/delete documented.
#### UI
Pisahkan recorded outcome dari official result; timeline cutoff; uncertainty dan sample threshold.
#### Test
Window gate, evidence provenance, corrections append-only, small sample suppression, PII redaction.
#### Definition of Done
Tak ada hasil prematur; private default; insight deskriptif saja.
#### Rollback
Disable new reviews; preserve event history; retract public card on consent revoke.
#### Deliverable
Autopsy workflow, policy, tests and review guide.

### Sprint 5b — Portfolio Intelligence, Export & Backup
#### Prasyarat
Data ownership/boundaries selesai; jalur backup/restore ada.
#### Tujuan
Memperjelas dashboard/ekspor catatan portfolio lokal/server dan backup recovery.
#### Batasan
Manual ledger bukan wallet balance/tax advice; guest ledger terpisah; no silent upload.
#### Audit Awal
Audit `dist/portfolio.js`, backup model, `migrations/0004_workbench.sql`, tests dan existing exports.
#### Implementasi
Export schema-versioned, spreadsheet-safe, bounded; server backup/restore hanya owner-authorized dan audited.
#### API
Authenticated backup endpoint jika memang diperlukan; rate/size limit.
#### Data
Jangan duplikasi holdings yang sudah ada; migrasi additive hanya untuk metadata versi/retention.
#### UI
Pilih scope export, tampilkan data yang disertakan, konfirmasi import/merge yang dapat berdampak.
#### Test
Roundtrip, malformed/oversized import, formulas, isolation, restore, idempotence, delete.
#### Definition of Done
User dapat memahami/mengontrol scope dan tidak ada silent sync.
#### Rollback
Matikan route baru; backup sebelum import; tidak overwrite original tanpa recovery.
#### Deliverable
Export/backup improvements dengan restore evidence.

### Sprint 6 — Discovery Automation & Source Trust
#### Prasyarat
Catalog/evidence, security SSRF review, moderation workflow tersedia.
#### Tujuan
Ingest RSS/Atom secara bounded ke queue review dan dokumentasikan konflik source.
#### Batasan
Tidak auto-publish, tidak klaim trust/scam score, source reputation bukan kebenaran.
#### Audit Awal
Audit feed handling yang ada (jangan asumsikan), cron budget, admin routes dan legal/robots/ToS.
#### Implementasi
Allowlist source; canonicalization/dedup; timeout/size limits; classification hanya assistive; human review; conflict display.
#### API
Admin/review only endpoints; public hanya approved items.
#### Data
Discovery source/items dan evidence linkage terpisah dari campaign; retention raw content.
#### UI
Review queue dan provenance; status rumor/speculative/confirmed tidak dicampur lifecycle.
#### Test
SSRF/redirect, malformed XML, duplicate, poisoned content, conflict, reviewer audit, no auto-publish.
#### Definition of Done
Semua feed item berawal untrusted dan tidak bisa publish tanpa review.
#### Rollback
Disable source poller; pertahankan approved catalog; purge raw feed sesuai retention.
#### Deliverable
Bounded ingestion + review UI/API + source policy.

### Sprint 7 — Public API, OpenAPI, Partner Feed & Admin Console
#### Prasyarat
Read model approved, auth scopes, rate limits, privacy/security review.
#### Tujuan
Expose hanya projection publik dan partner events yang disetujui; lengkapi admin workflows.
#### Batasan
Admin, internal, public API berbeda. Tidak ada PII; tidak menyebarkan user notes/autopsy/wallet. Public API bukan akses ke tabel.
#### Audit Awal
Audit `/api/*`, existing moderation, keys, CORS, response schemas, docs and rate-limit code.
#### Implementasi
Versioned OpenAPI; API key hash/scope/revoke/quota; webhook HMAC, SSRF-safe endpoint policy, retries/dedupe; admin audit.
#### API
Document auth/errors/pagination/version/deprecation, quota and status codes; never reveal secrets.
#### Data
Only missing tables; idempotent usage/delivery logs with short retention.
#### UI
Admin console role scoped, no credential display after creation; Indonesian guidance.
#### Test
Scope isolation, abuse/quota, key revocation, webhook signature/replay/SSRF, admin audit, public projection PII scan.
#### Definition of Done
Public API has no private data, OpenAPI matches tests, admin actions audited.
#### Rollback
Revoke keys, pause webhooks, disable routes; schema/data retained safely.
#### Deliverable
OpenAPI, partner feed and admin console release docs.

### Sprint 8 — Production Hardening & Launch Readiness
#### Prasyarat
Fitur release candidate selesai; staging environment owned and available.
#### Tujuan
Tutup blocker keamanan/operasional, bukan menambah fitur produk.
#### Batasan
No production deploy without explicit owner release authorization; no bulk sends or destructive data changes.
#### Audit Awal
Audit dependency advisories (baseline 11 high), secrets, config, migration, logs, CI, legal, runbooks.
#### Implementasi
CI checks, observability/privacy-safe logs, feature flags/maintenance if approved, backup restore drill, load/security test, policy pages.
#### API
Contract and operational limits verified in staging.
#### Data
Migration/rollback and restore tested on clone; secrets remain runtime-only.
#### UI
Legal/risk disclosures, incident/maintenance state and localization; verify mobile.
#### Test
Full test/build, dependency audit, D1 migration/restore, load, auth, rate-limit, accessibility, provider failure, live staging smoke.
#### Definition of Done
All global DoD + launch checklist signed; vulnerabilities triaged; production verification evidence documented.
#### Rollback
Versioned deployment rollback, DB expand-contract plan, queue pause, user communication; test beforehand.
#### Deliverable
Release notes, security/ops evidence, approved launch checklist.
