# Launch Checklist

Status checklist initial audit 28 Oktober 2026. Item belum diverifikasi tetap unchecked; source tree/config tidak membuktikan siap live.

## Pre-launch — engineering

- [x] `npm ci --ignore-scripts` selesai di sandbox dari lockfile.
- [x] `npm test`: 85/85 lulus secara lokal.
- [x] `npm run build` berhasil secara lokal.
- [ ] Triage dan remediasi 11 temuan `npm audit` high; uji regresi dan review lockfile.
- [ ] Tambahkan CI test/build/security checks; tidak ada `.github/workflows` saat audit.
- [ ] Review dependency/license, threat model dan security assessment independen.
- [ ] Terapkan migrasi 0001–0004 berurutan ke D1 staging; validasi `0005+` jika ada; jangan menyentuh production tanpa backup.
- [ ] Backup D1 dan lakukan restore drill yang dibuktikan; definisikan RPO/RTO.
- [ ] Verifikasi secrets/bindings staging (tanpa nilai rahasia dalam dokumen), provider health, CORS/origin, TLS, rate limits.
- [ ] Uji auth/session/expiry/revoke, isolasi scope, sync consent, export/delete, abuse limits.
- [ ] Uji opt-in Telegram/email/push end-to-end dan opt-out saat queued; verifikasi cron retries/idempotency.
- [ ] Uji error provider/RPC, API quota, D1 unavailable, migration mismatch; pastikan fail-closed untuk auth/eligibility.
- [ ] Manual mobile browser + Telegram native QA; accessibility, localization, deep links, safe-area.

## Pre-launch — product/legal/operations

- [ ] Tulis/review Privacy Policy, Terms, retention/deletion, contact/support, risk disclosures.
- [ ] Pastikan demo/fiksi, local/self-reported, status sumber, ruleset, waktu update dan batas eligibility terlihat dekat fitur terkait.
- [ ] Pastikan katalog publik mulai kosong kecuali data approved; sumber primer dan review manusia.
- [ ] Tidak ada copy “guaranteed”, “safe”, scam detection, expected value atau profit guarantee.
- [ ] Tidak ada seed phrase/private key collection, wallet signing atau auto-claim.
- [ ] Tetapkan on-call, incident response, abuse/moderation, kill-switch dan maintenance procedure.
- [ ] Pastikan dashboard telemetry, alert threshold, log redaction, retention dan owner; `/health` saja tidak cukup.
- [ ] Selesaikan legal review dan data protection review untuk tiap provider/jurisdiction.

## Launch — hanya setelah approval pemilik

- [ ] Catat release commit, migration version dan artifact checksum.
- [ ] Backup target dan deployment staged/approved; deployment produksi adalah aksi terpisah.
- [ ] Verifikasi DNS/TLS, public URL, `/api/health`, `/api/capabilities`, static app assets.
- [ ] Smoke test read-only public endpoint; uji user flow dengan test account bukan data pribadi produksi.
- [ ] Konfirmasi database readiness dan secrets redacted; periksa worker logs tanpa payload sensitif.
- [ ] Konfirmasi delivery test hanya untuk recipient internal yang opt-in; tidak ada bulk blast.
- [ ] Publish changelog/status limitations dan support channel.

## Pasca-launch

- [ ] Pantau errors, latency, D1 usage, queue age/retry, auth anomalies, rate limiting, feedback.
- [ ] Rekonsiliasi provider delivery failures dan disable integrasi yang gagal/unsafe.
- [ ] Review audit/moderation logs dan abuse reports sesuai privacy policy.
- [ ] Verifikasi backup terjadwal dan restore sampling; simpan evidence runbook.
- [ ] Review dependency alerts dan security advisories rutin.
- [ ] Tinjau outcome, sumber konflik dan copy status; koreksi menggunakan audit trail.
- [ ] Jangan membuka discovery/API/webhook atau fitur eksperimental tanpa gate, consent dan rollback.

## Status audit awal

Lokal: build dan test pass. Belum diverifikasi: CI/CD, deployment production, DNS/TLS, secrets, migration live, provider delivery, restore drill, legal pages, monitoring operasional. Launch status: **NOT APPROVED / belum diverifikasi**.
