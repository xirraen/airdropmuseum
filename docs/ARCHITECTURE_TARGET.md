# Arsitektur Target — Airdrop Museum

## Prinsip

Tetap gunakan modular monolith pada Cloudflare Workers + D1: satu deployment Worker dan satu database binding, dengan batas domain eksplisit, kontrak internal teruji dan migrasi terurut. Hindari microservices sebelum kebutuhan operasional membuktikannya. Target ini adalah desain, bukan deskripsi seluruh fitur aktif.

## Modul dan kewenangan

| Modul | Tanggung jawab | Boleh membaca/menulis |
|---|---|---|
| `core/` | router, config, auth context, scope, errors, clock, validation | context dan utilitas; tidak memiliki domain catalog |
| `catalog/` | campaign registry dan lifecycle editorial | campaigns; write admin/editor terotorisasi |
| `evidence/` | sources, claims, evidence, conflicts, provenance | evidence/source; tidak mengubah status tanpa policy |
| `discovery/` | ingest feed, dedup, classification, review queue | discovery items; tidak auto-publish |
| `eligibility/` | versioned rules dan hasil evaluation explainable | rules/results; tidak mengklaim universal eligibility |
| `wallets/` | address watchlist, bounded read-only observations | wallet data private; tidak menandatangani transaksi |
| `monitoring/` | snapshots, deadlines, claim checks | observation append; tidak melakukan claim |
| `alerts/` | event-to-notification preferences, queue, delivery adapter | notification milik user; external send opt-in |
| `quests/` | quest definition/progress, poin non-finansial | user progress dan ledger namespace terpisah |
| `portfolio/` | local/server holdings dan export | owner-scope holdings; bukan verified balance |
| `autopsy/` | Decision Entry, event history, outcome review, pattern insight | privat default; publish hanya consent eksplisit |
| `publicApi/` | catalog read-only, versi dan OpenAPI | publikasi yang sudah di-approve saja |
| `admin/` | moderation, feature operations, audit | admin scoped + audit trail |
| `shared/` | types, schemas, repositories, adapters lintas modul | tidak mengandung business rules bersama yang ambigu |

## Dependensi

`core` ← semua modul. `catalog` ← `evidence`. `discovery` menghasilkan candidate untuk `evidence` dan antrian `catalog`; tidak menulis campaign live. `eligibility` membaca campaign/evidence dan observasi wallet yang dipilih secara eksplisit. `monitoring` membaca catalog dan sumber resmi; menghasilkan snapshot/claim checks. `alerts` mengonsumsi domain events dari monitoring/quest dan mematuhi preferences. `quests` dapat mengacu campaign/evidence namun ledger XP bernamespace. `autopsy` membaca keputusan/evidence/outcome, tidak menulis hasil otomatis. `publicApi` hanya membaca projection publik. `admin` mengorkestrasi use cases dan tidak bypass repository/policy. Modul domain tidak saling mengakses tabel mentah di luar repository/kontrak.

## Alur data dan ownership

1. Browser-only mode tetap default dan menyimpan catatan personal lokal.
2. Sync hanya oleh aksi user, session valid, endpoint berrevision/If-Match, scope ownership ditegakkan server; import tidak membuat identitas tanpa consent.
3. Katalog publik berawal kosong. Data publik berasal dari editor/moderator dan memiliki provenance. User record pribadi tidak menjadi kandidat publik.
4. Data wallet, alamat, preferensi dan autopsy sensitif selalu scope akun; tidak masuk log payload atau feed publik.
5. External sources adalah untrusted input; batasi ukuran, scheme, redirects, rate, parsing, dan sanitasi konten.

## Event flow (target)

Gunakan event envelope: `event_id`, `event_type`, `event_version`, `occurred_at`, `aggregate_type/id`, `actor_scope`, `correlation_id`, `payload_schema_version`, `knowledge_cutoff_at` untuk insight temporal. Event terkontrol append-only; jangan mengklaim event log immutable jika storage/akses administrator masih dapat mengubahnya.

### Discovery
`feed poll → raw candidate → normalize/hash → deduplicate → classify (untrusted) → human review → evidence/source linkage → catalog publish`. Publish memerlukan reviewer dan audit log. Konflik menghasilkan review, bukan voting otomatis.

### Eligibility
`user-selected wallet + consent → bounded read-only observations → ruleset version + source evidence + cutoff → explainable result (met/not met/unknown) → user display`. Error, missing data atau unsupported chain menjadi `unknown`, tidak pernah `eligible` secara implisit.

### Monitoring / Claim
`campaign source check → snapshot/deadline record → change detection → claim check status` (`unknown/open/closed/result_reported` sebagai observasi terdefinisi) `→ alert event`. Tidak ada transaksi atau klaim otomatis.

### Quest
`quest version published → user starts → evidence/transaction submitted → verification policy → progress/ledger entry idempotent`. XP lokal, referral server dan quest ledger tidak saling mengkredit.

### Claim Autopsy
`decision entry + linked evidence + constraints + expectation at cutoff → post-window outcome review → append-only events/compensating revision → aggregate pattern only above threshold → optional consented evidence card`. Tidak ada prediksi/EV.

### Alert
`domain event → notification intent + dedupe key → preference/consent check → queue/retry → provider adapter → delivery outcome`. Satu event dapat mempunyai nol atau banyak notification; Telegram message bukan domain event.

### Public API
`approved public read model → schema/version/limits → API key/quota if needed → usage log without personal payload`. Admin/internal routes terpisah dan tidak dapat memakai public key.

### Admin moderation
`authenticated exact allowlist/role → validated command → domain policy → write + audit event → public projection update`. Semua perubahan penting mempunyai actor dan alasan.

## Availability dan operasional

D1 sebagai primary persistence; gunakan atomic transactions/batches untuk ledger dan idempotency. Cron harus bounded, retry-safe, observable, dan dapat disabled. Secrets disediakan runtime, bukan repo. Health readiness terpisah dari liveness, dan readiness menyebut dependency yang benar-benar diuji. Tidak ada fail-open pada auth, consent atau eligibility.

## Target struktur

```text
src/{core,catalog,evidence,discovery,eligibility,wallets,monitoring,alerts,quests,portfolio,autopsy,publicApi,admin,shared}/
```

Migrasi dan test mengikuti domain tanpa memecah deployment. Refactor struktur hanya bila mengurangi coupling tanpa perubahan perilaku; setiap fase mempertahankan API/backward compatibility atau menyediakan migrasi/adapter.
