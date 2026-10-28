const PAGES={
 privacy:{title:'Kebijakan Privasi',sections:[
 ['Data yang diproses','Catatan pribadi dapat disimpan di penyimpanan browser. Bila pengguna mengaktifkan sinkronisasi, profil, pengaturan, riwayat quest dan portofolio terkait akun tersimpan pada layanan Cloudflare D1. Alamat wallet publik yang ditambahkan secara sukarela dapat dipantau melalui penyedia data blockchain; alamat bukan bukti identitas.'],
 ['Data operasional','Kami memproses metadata minimum untuk keamanan: waktu, status, kode respons dan request ID. Log operasional tidak memuat private key, seed phrase, API key, token, email lengkap, alamat wallet lengkap atau isi quest. IP mentah tidak dicatat oleh logger aplikasi.'],
 ['Retensi dan penghapusan','Catatan browser dapat dihapus melalui kontrol profil atau data situs. Data tersinkronisasi harus dihapus melalui mekanisme penghapusan akun/permintaan privasi yang tersedia; konfirmasi penghapusan mengikuti audit dan kewajiban operasional yang berlaku. Catatan keamanan/audit mungkin disimpan secara terbatas sesuai kebijakan retensi dan kewajiban hukum. Tidak ada jaminan bahwa penghapusan local storage menghapus sinkronisasi cloud.'],
 ['Pihak ketiga','Data publik blockchain dapat diperiksa menggunakan endpoint RPC atau provider pihak ketiga. Telegram, Cloudflare dan penyedia yang dipilih pengguna dapat memproses metadata sesuai kebijakan mereka.'],
 ['Kunci wallet','Kami tidak meminta atau menyimpan seed phrase dan private key. Jangan pernah memasukkannya ke formulir, catatan atau chatbot.']
 ]},
 terms:{title:'Syarat Penggunaan',sections:[
 ['Sifat layanan','Airdrop Museum adalah agregator informasi, riset dan pencatatan pribadi. Informasi dapat tertunda, salah atau tidak lengkap dan bukan nasihat keuangan, hukum atau investasi.'],
 ['Risiko','Listing bukan rekomendasi atau verifikasi keamanan. Eligibility, snapshot, deadline dan reward tidak dijamin. Pengguna wajib memeriksa domain, kontrak, dan pengumuman resmi sebelum bertindak.'],
 ['Tanggung jawab','Pengguna bertanggung jawab atas keputusan dan interaksi eksternal. Sejauh diizinkan hukum, layanan diberikan sebagaimana adanya tanpa jaminan hasil atau kompensasi atas kehilangan aset.'],
 ['Penggunaan yang dilarang','Jangan menyalahgunakan API, membocorkan token atau mengganggu integritas layanan. Akses dapat dibatasi demi keamanan.']
 ]},
 disclaimer:{title:'Pernyataan Risiko',sections:[
 ['Perubahan campaign','Airdrop dapat berubah, ditunda atau dibatalkan sewaktu-waktu. Status eligibility dapat salah, kedaluwarsa atau tidak lengkap. Poin internal bukan aset finansial.'],
 ['Verifikasi manual','Periksa domain, sumber, dan alamat kontrak dari kanal resmi proyek. Waspadai phishing, kontrak palsu dan permintaan signature berisiko. Jangan pernah membagikan seed phrase atau private key.'],
 ['Tidak ada eksekusi','Platform tidak melakukan auto-claim, signing atau transaksi on-chain atas nama pengguna.']
 ]},
 security:{title:'Keamanan dan Pelaporan',sections:[
 ['Model perlindungan','Layanan membatasi data publik dan privat, menerapkan autentikasi admin berbasis role, audit tindakan, validasi input, rate limiting, request ID dan pemeriksaan sumber HTTPS. Endpoint publik hanya menyajikan data terkurasi.'],
 ['Privasi wallet','Alamat wallet yang digunakan untuk pemindaian bersifat publik, namun tidak ditampilkan pada log operasional. Tidak ada permintaan seed phrase atau private key.'],
 ['Responsible disclosure','Kirim laporan kerentanan secara privat melalui GitHub Security Advisories repository ini. Sertakan langkah reproduksi dan dampak tanpa menyerang akun pengguna atau mengambil data. Mohon beri kesempatan untuk investigasi sebelum publikasi.'],
 ['Kontak keamanan','Saluran pelaporan privat: https://github.com/xirraen/airdropmuseum/security/advisories/new . Jika saluran tersebut tidak tersedia, hubungi pengelola repo melalui kanal resmi yang tertera pada halaman proyek; jangan menyertakan kredensial atau data pribadi dalam issue publik.']
 ]}
};
function escapeHtml(x){return String(x).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
export function safeLegalPage(request){
 const name=new URL(request.url).pathname.slice(1),page=PAGES[name];
 if(!page)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const body=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(page.title)} — Airdrop Museum</title><style>body{margin:0;padding:2rem 1rem;background:#f5f8fb;color:#183447;font:16px/1.6 system-ui,sans-serif}main{max-width:760px;margin:auto;background:white;border:1px solid #dce6ee;border-radius:20px;padding:clamp(20px,5vw,44px)}h1{font-size:clamp(26px,5vw,38px)}h2{margin-top:2rem;font-size:20px}a{color:#116a78;overflow-wrap:anywhere}nav a{margin-right:12px}small{color:#536779}</style></head><body><main><nav><a href="/">Museum</a><a href="/privacy">Privasi</a><a href="/terms">Ketentuan</a><a href="/disclaimer">Risiko</a><a href="/security">Keamanan</a></nav><h1>${escapeHtml(page.title)}</h1><small>Terakhir diperbarui: 28 Oktober 2026. Informasi ini perlu ditinjau oleh penasihat hukum sebelum peluncuran publik.</small>${page.sections.map(([title,paragraph])=>`<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(paragraph)}</p></section>`).join('')}</main></body></html>`;
 return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
