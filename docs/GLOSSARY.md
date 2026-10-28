# Glossary

| Istilah | Definisi baku |
|---|---|
| Campaign | Program/proyek yang menjadi unit katalog; bukan otomatis airdrop atau jaminan reward. |
| Airdrop | Distribusi aset yang diumumkan pihak proyek; keberadaan kampanye tidak memastikan pengguna memenuhi syarat. |
| Points program | Aturan pencatatan poin tertentu; setiap program memiliki ledger, penerbit, syarat dan nilai yang berbeda. |
| Quest | Aktivitas terdefinisi untuk pengguna; completion quest bukan bukti eligibility airdrop. |
| Task | Langkah personal dalam checklist/workflow, dapat berupa self-reported. |
| Evidence | Rekaman yang mendukung/menyangkal klaim dengan sumber, waktu dan konteks. Bukan kebenaran otomatis. |
| Source | Penerbit/URL asal informasi; reputasi source tidak menjamin semua klaimnya benar. |
| Source conflict | Dua atau lebih sumber/observasi yang tidak konsisten; perlu ditampilkan dan direview, bukan otomatis diputuskan. |
| Eligibility | Status evaluasi terhadap ruleset kampanye spesifik, versi dan snapshot waktu; unknown harus tersedia. |
| Eligibility rule | Kriteria terstruktur, berversi dan punya provenance untuk satu program; bukan aturan universal. |
| Eligibility result | Hasil `met/not_met/unknown` dengan alasan, waktu, cutoff, ruleset dan batas cakupan. |
| Claimable | Hanya label observasi sumber resmi tentang proses klaim pada waktu tertentu; tidak berarti transaksi klaim tersedia bagi user. Gunakan disclaimer. |
| Claim check | Pemeriksaan observasional atas status/link/sumber proses klaim; tidak mengirim transaksi dan bukan eligibility evaluation. |
| Snapshot | Catatan kondisi sumber/data pada waktu tertentu; tidak membuktikan kondisi sekarang atau immutability jika tidak ada mekanisme tamper-evidence. |
| Deadline | Tanggal/waktu dari source tertentu, dengan zona waktu dan checked-at; dapat berubah. |
| Rumor | Informasi belum dikonfirmasi oleh sumber primer yang memadai. |
| Confirmed | Klaim yang didukung sumber primer yang dinilai memadai pada tanggal review; bukan jaminan hasil/reward. |
| Speculative | Hipotesis atau inferensi yang belum dikonfirmasi; harus diberi label eksplisit. |
| XP Museum | Gamifikasi lokal non-finansial dan browser-owned; tidak identik dengan server XP. |
| Referral points | Poin server terkait program referral dengan qualification rules; bukan token, uang, anti-Sybil guarantee atau XP lokal. |
| Quest points | Poin yang jika kelak ada hanya berada dalam ledger quest; bukan referral/campaign points. |
| Campaign points | Belum menjadi fitur/ledger yang disepakati; jangan gunakan sebagai istilah produk aktif. |
| Decision Entry | Rekaman keputusan personal: evidence, constraint, expectation dan cutoff temporal; target masa depan, privat secara default. |
| Claim Autopsy | Review retrospektif atas Decision Entry setelah jendela klaim/hasil memadai; bukan forensic certainty atau prediksi. |
| Outcome | Hasil yang bersumber/diakui pada waktu tertentu; bedakan hasil resmi dan laporan pengguna. |
| Insight | Ringkasan pola deskriptif dari sampel dan metodologi yang dinyatakan. |
| Pattern | Hubungan retrospektif yang terlihat pada data; bukan prediksi kausal. |
| User scope | Batas owner dan audience data (browser-local, authenticated user, admin, public). Selalu eksplisit. |
| Knowledge cutoff | Waktu maksimum bukti yang dipertimbangkan untuk decision/evaluation; wajib agar hindsight tidak bocor ke keputusan historis. |
| Maintenance mode | Mode operasi yang membatasi fungsi saat pemeliharaan; belum ditemukan di repo. |
| Discovery source | Feed yang dapat di-ingest; bukan campaign source atau bukti kebenaran. |
| Discovery item | Kandidat hasil discovery yang belum tentu relevan/benar/publik. |
| Alert event | Peristiwa domain internal yang dapat memicu nol/satu/banyak notification. |
| Notification | Intent/pesan per user dan channel, dengan consent/status delivery. |
| Telegram message | Payload/delivery melalui provider Telegram; bukan alert event itu sendiri. |

## Istilah yang dilarang tanpa disclaimer ketat

- **Guaranteed airdrop / jaminan airdrop:** dilarang; proyek tidak menjamin distribusi.
- **Guaranteed eligibility / pasti eligible:** dilarang; hasil terbatas pada ruleset, data dan waktu tertentu.
- **Auto-claim:** tidak ada dan tidak direncanakan; sistem tidak pernah meminta/menggunakan private key untuk klaim.
- **Scam detector:** jangan klaim deteksi scam. Sinyal risiko heuristik bukan penilaian keselamatan.
- **Safe token / token aman:** tidak dapat disertifikasi oleh produk.
- **Expected value / nilai harapan:** jangan sajikan angka prediksi nilai reward.
- **Profit guarantee / jaminan profit:** dilarang.

Gunakan bahasa “catatan”, “indikasi”, “dilaporkan oleh sumber”, “belum diketahui”, “hasil lokal”, atau “perlu verifikasi” secara akurat. Jangan menyebut bukti user sebagai verifikasi independen.
