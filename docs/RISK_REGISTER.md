# Risk Register

Skala: likelihood/impact kualitatif; prioritas bukan keputusan keamanan formal.

| ID | Risiko | L/I | Mitigasi / pemilik kerja |
|---|---|---|---|
| R1 | 11 dependency vulnerabilities tingkat high dari `npm audit` | Tinggi/Tinggi | Triage advisories dan path transitive; upgrade teruji tanpa `--force` buta, lockfile review, test/build, SBOM; gate sebelum launch. |
| R2 | Mengira konfigurasi Worker/cron/D1 sebagai deployment aktif | Sedang/Tinggi | Verifikasi live env dan smoke test manual; label semua bukti; jangan publikasikan klaim deployment tanpa log/check. |
| R3 | Rahasia provider tidak ada/terpapar | Sedang/Tinggi | Worker secrets only; rotasi; jangan menyimpan di D1/config/docs; redaksi log; readiness per provider. |
| R4 | Data guest/local tercampur atau terunggah tanpa consent | Sedang/Tinggi | Ownership eksplisit, tindakan sync terpisah, consent UI, scope tests dan deletion/export. |
| R5 | Ekspos alamat wallet, Telegram ID, email, notes/autopsy | Sedang/Tinggi | Least privilege, no public projection, pseudonymous IDs, minimisasi log, retensi dan deletion policy. |
| R6 | Kesan keliru eligibility/claim pasti karena copy/status | Sedang/Tinggi | Tampilkan ruleset/version/source/cutoff, status unknown, disclaimer contextual, human review; larang auto-claim. |
| R7 | Source palsu, feed injection atau malicious link | Tinggi/Tinggi | Feed allowlist, sanitization, SSRF/redirect controls, bounded parser, moderation, no auto-publish, cross-check primary sources. |
| R8 | Wallet read-only scan dapat melampaui rate/menampilkan data salah | Sedang/Tinggi | Batas chain/blocks, provider timeout/rate limits, source/timestamp display, unknown on error, no signing key/seed. |
| R9 | Referral/points abuse atau double-credit | Sedang/Sedang | Idempotency unique event, caps, rate limit, anomaly monitoring, non-financial labels; no anti-Sybil claims. |
| R10 | Alert delivery duplikat, opt-out terabaikan, retry storm | Sedang/Tinggi | Outbox/dedupe, consent check at send-time, bounded exponential retry/dead-letter, unsubscribe/revoke tests. |
| R11 | Autopsy bias hindsight / prediksi tersirat | Sedang/Tinggi | Mandatory `knowledge_cutoff_at`, immutable event policy, compensating revision, sample thresholds, uncertainty and no EV. |
| R12 | Migrasi D1 gagal atau rollback kehilangan data | Sedang/Tinggi | Backup + restore drill, additive expand-contract, migration test sequential, no destructive rollback, staged migration. |
| R13 | Tidak ada CI/CD menyebabkan regression lolos | Tinggi/Sedang | Tambah CI test/build/dependency audit setelah credentials and branch protection policy ditentukan; deployment approval terpisah. |
| R14 | Tidak ada feature flag/maintenance controls untuk insiden | Sedang/Sedang | Rancang flag server-side scoped dan maintenance behavior; emergency kill switch teruji, tidak expose config sensitif. |
| R15 | Legal disclosures belum cukup/Terms/Privacy policy tidak ada | Sedang/Tinggi | Counsel review, privacy notice/terms/retention/contact, consent dan jurisdiction scope sebelum public launch. |
| R16 | Public/partner API membocorkan data private atau disalahgunakan | Sedang/Tinggi | Read-model allowlist, scopes, API key hashing/revocation, quotas, audit logs without PII, schema review. |
| R17 | Admin/moderator account compromise / misuse | Sedang/Tinggi | Exact allowlist, strong auth, step-up where feasible, audit trail, least privilege, review workflow. |
| R18 | UI/manual ledger dipersepsikan sebagai fakta wallet | Sedang/Sedang | Label self-reported/manual di dekat data, timestamp/provenance, no fabricated prices/balance. |
| R19 | Prompt lama yang tidak ditemukan dianggap spesifikasi lengkap | Tinggi/Sedang | Catat gap, treat supplied attachment as sole planning input; require owner review of inferred details. |

## Launch blockers

R1, R2, R3, R5, R6, R7, R10, R12, R15, R16, R17 harus ditangani atau menerima risk formally sebelum public launch. Tidak ada sistem scoring risiko yang dianggap sebagai sertifikasi.
