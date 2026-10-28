# Sprint 10 Launch Checklist

**Every item starts unchecked.** Check only after collecting evidence (CI run, operator approval, screenshot, metrics, or restore/rollout record). Branch implementation is not evidence of a live production launch.

## Pre-launch

- [ ] Semua test lulus (link CI run + commit)
- [ ] Build production berhasil
- [ ] Migrasi D1 diterapkan dan memiliki rollback/restore plan teruji
- [ ] Secret production dikonfigurasi pada Workers Secrets
- [ ] Preview environment terpisah dari production (D1 dan rate limiter)
- [ ] Backup harian aktif / Time Travel bookmark harian diverifikasi
- [ ] Restore test berhasil (isolated recovery rehearsal)
- [ ] Rate limiting aktif (IP, API key, route)
- [ ] Security headers aktif
- [ ] Maintenance mode teruji
- [ ] Health check aktif (termasuk degraded state)
- [ ] Structured logging aktif tanpa PII
- [ ] Error alerting aktif dan diuji
- [ ] Admin audit log aktif
- [ ] Public API documentation tersedia
- [ ] RSS feed valid
- [ ] Webhook signature teruji
- [ ] Privacy policy tersedia dan direview
- [ ] Terms tersedia dan direview
- [ ] Disclaimer tersedia dan direview
- [ ] Security contact tersedia dan diuji privat
- [ ] Load test lulus (p95 <500ms cacheable, error <1%)
- [ ] Rollback drill berhasil
- [ ] UI Mini App diuji di Telegram native dan Telegram Web dengan XFO/CSP produksi
- [ ] DNS rebinding/outbound webhook egress protections direview
- [ ] Main dilindungi: wajib PR review, CI, tanpa direct push
- [ ] Security report ditinjau dan risiko residual diterima pengelola
- [ ] 11 dependency advisories severity high diperbaiki atau disetujui melalui risk acceptance formal

## Launch

- [ ] Deploy production melalui approval
- [ ] Terapkan/verifikasi migrasi sesuai urutan
- [ ] Verifikasi /api/health
- [ ] Verifikasi /api/aggregator/health
- [ ] Verifikasi /v1/openapi.json
- [ ] Verifikasi RSS feed
- [ ] Verifikasi admin console dengan role minimal
- [ ] Verifikasi Telegram alert
- [ ] Verifikasi discovery cron
- [ ] Verifikasi backup bookmark / backup job bila diwajibkan
- [ ] Pantau error rate 24 jam pertama

## Sign-off record

Date/UTC: `NOT VERIFIED`

Commit SHA: `NOT VERIFIED`

Preview URL: `NOT VERIFIED`

CI run: `NOT VERIFIED`

D1 backup bookmark (store privately, not in this repo): `NOT VERIFIED`

Load test report: `NOT VERIFIED`

Rollback drill and approval: `NOT VERIFIED`
