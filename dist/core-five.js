
const TABS=[['home','Beranda','home'],['explore','Airdrop','compass'],['missions','Quest','check'],['workspace','Portofolio','layers'],['profile','Profil','user']];
const STORAGE_KEY='airdrop-museum-core-five-v1';
const LEGACY_KEY='airdrop-museum-v1';
const $=sel=>document.querySelector(sel);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const SVG={home:'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3Z',compass:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm4 5-2.5 5.5L8 16l2.5-5.5Z',check:'m5 12 4 4L19 6',layers:'m12 3 10 5-10 5L2 8Zm-9 9 9 4.5 9-4.5M3 16l9 4.5 9-4.5',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2'};
const icon=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+SVG[id]+'"/></svg>';
const DEFAULT={version:1,name:'Penjelajah',tracked:[],notes:{},quests:[],privacyRead:false};
const CORE_QUESTS=[
 {id:'watch',name:'Mulai koleksi',info:'Simpan satu kampanye ke Portofolio.',xp:20,automatic:true},
 {id:'note',name:'Tulis catatan riset',info:'Simpan catatan pribadi untuk satu kampanye.',xp:30,automatic:true},
 {id:'safety',name:'Pahami keamanan wallet',info:'Baca panduan singkat lalu konfirmasi pemahaman sendiri.',xp:20},
 {id:'source',name:'Periksa sumber resmi',info:'Buka sumber HTTPS proyek dari katalog lalu catat verifikasi manual.',xp:20}
];
let page='home',catalog=[],loadState='loading',search='',chainFilter='all',alertTimer=null;
function stableId(v){return typeof v==='string'&&v.length>0&&v.length<150&&!/[<>]/.test(v);}
function cleanState(value){
 const obj=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const tracked=Array.isArray(obj.tracked)?obj.tracked.filter(stableId).slice(0,1000):[];
 const notes={};
 if(obj.notes&&typeof obj.notes==='object'&&!Array.isArray(obj.notes)){
  for(const [id,n] of Object.entries(obj.notes).slice(0,1000))if(stableId(id)&&typeof n==='string')notes[id]=n.slice(0,4000);
 }
 return {version:1,name:typeof obj.name==='string'?obj.name.trim().slice(0,60)||DEFAULT.name:DEFAULT.name,
  tracked:[...new Set(tracked)],notes,quests:[...new Set(Array.isArray(obj.quests)?obj.quests.filter(x=>CORE_QUESTS.some(q=>q.id===x)):[])],
  privacyRead:obj.privacyRead===true};
}
function getInitial(){
 try{const existing=localStorage.getItem(STORAGE_KEY);if(existing)return cleanState(JSON.parse(existing));}catch{}
 try{
  const raw=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
  if(raw&&typeof raw==='object')return cleanState({name:raw.name,tracked:raw.saved,notes:Object.fromEntries(Object.entries(raw.records||{}).filter(([id])=>stableId(id)).map(([id,value])=>[id,typeof value?.notes==='string'?value.notes:'']))});
 }catch{}
 return {...DEFAULT,tracked:[],notes:{},quests:[]};
}
let state=getInitial();
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{notify('Penyimpanan perangkat tidak tersedia. Ekspor data penting.');}}
function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(alertTimer);alertTimer=setTimeout(()=>el.classList.remove('show'),3400);}
function route(v){return TABS.some(x=>x[0]===v)?v:'home';}
function navigate(v){page=route(v);if(location.hash!=='#'+page)history.replaceState(null,'','#'+page);render();window.scrollTo({top:0,behavior:'instant'});}
function cleanUrl(v){try{const u=new URL(v);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function normalizeProject(row){
 if(!row||!stableId(row.id)||typeof row.name!=='string'||!row.name.trim())return null;
 return {id:row.id,name:row.name.trim().slice(0,100),chain:String(row.chain||row.chains?.[0]||'Jaringan belum tersedia').slice(0,55),
 category:String(row.category||'Airdrop').slice(0,60),description:String(row.desc||row.description||'Periksa sumber resmi sebelum berpartisipasi.').slice(0,280),
 url:cleanUrl(row.website||row.source||row.official_urls?.[0]),status:String(row.status||'Riset').slice(0,45)};
}
async function loadCatalog(){
 loadState='loading';render();
 try{
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),12000);
  let response;try{response=await fetch('/api/projects',{signal:ctrl.signal,cache:'no-store'});}finally{clearTimeout(timeout);}
  if(!response.ok)throw Error('HTTP '+response.status);
  const json=await response.json();
  if(!Array.isArray(json.projects))throw Error('Format data tidak dikenali');
  catalog=json.projects.map(normalizeProject).filter(Boolean);loadState='ready';
 }catch{catalog=[];loadState='error';}
 render();
}
function navHTML(){return TABS.map(([key,label,ico])=>'<button type="button" data-tab="'+key+'" class="'+(page===key?'active':'')+'" '+(page===key?'aria-current="page"':'')+'>'+icon(ico)+'<span>'+label+'</span></button>').join('');}
function header(title,summary){return '<div class="page-head"><span class="eyebrow">AIRDROP MUSEUM / RESEARCH ONLY</span><h1>'+title+'</h1><p>'+summary+'</p></div>';}
function empty(title,message){return '<div class="surface empty"><b>'+title+'</b>'+message+'</div>';}
function projectCard(p){
 const saved=state.tracked.includes(p.id);
 return '<article class="surface campaign"><div class="campaign-top"><span class="logo" aria-hidden="true">'+esc(p.name.slice(0,1).toUpperCase())+'</span><div class="campaign-name"><h3>'+esc(p.name)+'</h3><span class="meta">'+esc(p.chain)+' · '+esc(p.category)+'</span></div><span class="chip">'+esc(p.status)+'</span></div><p>'+esc(p.description)+'</p><div class="campaign-foot"><button type="button" class="btn '+(saved?'ghost':'primary')+'" data-save="'+esc(p.id)+'">'+(saved?'Tersimpan':'Simpan ke portofolio')+'</button>'+(p.url?'<a class="btn" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer" data-source="'+esc(p.id)+'">Sumber resmi ↗</a>':'<span class="meta">URL resmi belum tersedia</span>')+'</div></article>';
}
function listedProjects(rows){return rows.length?'<div class="grid">'+rows.map(projectCard).join('')+'</div>':empty('Tidak ada kampanye','Tidak ada kampanye yang cocok dengan filter ini.');}
function home(){
 const tracked=state.tracked.length,notes=Object.values(state.notes).filter(x=>x.trim()).length,points=CORE_QUESTS.filter(q=>state.quests.includes(q.id)).reduce((n,q)=>n+q.xp,0);
 return header('Ruang riset Anda','Katalog airdrop berbasis sumber, checklist manual, dan portofolio pribadi. Tidak ada klaim reward otomatis.')+
 '<section class="surface hero"><span class="eyebrow">DISCOVER · VERIFY · TRACK</span><h2>Temukan informasi. Simpan bukti. Nilai sendiri.</h2><p>Gunakan sumber resmi sebelum mengambil keputusan. Jangan pernah memberikan seed phrase atau private key.</p><button data-tab="explore">Jelajahi Airdrop</button></section>'+
 '<div class="stats"><div class="surface stat"><small>Kampanye tersimpan</small><b>'+tracked+'</b><span>Dalam portofolio lokal</span></div><div class="surface stat"><small>Catatan riset</small><b>'+notes+'</b><span>Disimpan di perangkat</span></div><div class="surface stat"><small>XP lokal</small><b>'+points+'</b><span>Bukan aset kripto</span></div></div>'+
 '<div class="section-head"><h2>Terbaru di katalog</h2><button data-tab="explore">Lihat semua →</button></div>'+
 (loadState==='loading'?empty('Memuat data','Menghubungkan ke katalog kampanye…'):loadState==='error'?empty('Katalog belum tersedia','Koneksi data tidak tersedia. Coba muat ulang dari tab Airdrop.'):listedProjects(catalog.slice(0,4)));
}
function explore(){
 const chains=[...new Set(catalog.map(x=>x.chain))].sort().slice(0,100);
 const available=catalog.filter(x=>(chainFilter==='all'||x.chain===chainFilter)&&[x.name,x.chain,x.category,x.description].some(v=>v.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).slice(0,100);
 return header('Jelajahi Airdrop','Direktori kampanye nyata. Tidak ada kelayakan, transaksi, atau hadiah yang dijanjikan.')+
 '<div class="toolbar"><input id="campaign-search" type="search" placeholder="Cari proyek, kategori, jaringan…" aria-label="Cari kampanye" value="'+esc(search)+'"><select id="chain-filter" aria-label="Filter jaringan"><option value="all">Semua jaringan</option>'+chains.map(c=>'<option value="'+esc(c)+'" '+(chainFilter===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select><button class="btn" data-reload="catalog">Muat ulang</button></div>'+
 '<div class="section-head"><h2>Direktori</h2><span class="counter">'+(loadState==='ready'?available.length+' kampanye':'Belum tersambung')+'</span></div>'+
 (loadState==='loading'?empty('Memuat katalog','Menerima data kampanye dari server…'):loadState==='error'?empty('Data tidak tersedia','Tidak menampilkan kampanye contoh ketika server gagal. Gunakan Muat ulang.'):listedProjects(available));
}
function quest(){
 const done=new Set(state.quests);
 const points=CORE_QUESTS.reduce((n,q)=>n+(done.has(q.id)?q.xp:0),0);
 return header('Quest','Langkah riset yang dapat dikerjakan. XP adalah progres lokal dan bukan token atau klaim reward.')+
 '<div class="surface"><div class="section-head"><h2>Progres riset</h2><span class="counter">'+done.size+'/'+CORE_QUESTS.length+' selesai · '+points+' XP lokal</span></div><div class="callout">Tugas tersimpan di perangkat. Tindakan yang memerlukan verifikasi dilakukan manual; tidak ada interaksi wallet, approval, atau signing.</div></div>'+
 '<div class="quest-list" style="margin-top:14px">'+CORE_QUESTS.map(q=>{
 const finished=done.has(q.id),automatic=q.automatic;
 return '<article class="surface quest '+(finished?'quest-done':'')+'"><div class="quest-main"><h3>'+esc(q.name)+'</h3><p>'+esc(q.info)+'</p></div><b>+'+q.xp+' XP</b>'+ (finished?'<span class="chip">Selesai</span>':automatic?'<button class="btn" data-tab="'+(q.id==='watch'?'explore':'workspace')+'">Kerjakan</button>':'<button class="btn primary" data-quest="'+q.id+'">Tandai selesai</button>')+'</article>';
 }).join('')+'</div>';
}
function portfolio(){
 const rows=state.tracked.map(id=>catalog.find(p=>p.id===id)).filter(Boolean);
 const orphaned=state.tracked.filter(id=>!catalog.some(p=>p.id===id));
 return header('Portofolio','Simpan dan dokumentasikan partisipasi. Hanya catatan pribadi, bukan saldo atau bukti eligibility.')+
 '<div class="section-head"><h2>Kampanye diikuti</h2><span class="counter">'+state.tracked.length+' tersimpan</span></div>'+
 (rows.length?'<div class="surface">'+rows.map(p=>'<div class="portfolio-row"><span class="logo">'+esc(p.name.slice(0,1).toUpperCase())+'</span><div class="details"><h3>'+esc(p.name)+'</h3><small>'+esc(p.chain)+(state.notes[p.id]?.trim()?' · Catatan tersedia':' · Belum ada catatan')+'</small></div><button class="btn" data-note="'+esc(p.id)+'">Catatan</button><button class="btn danger" data-save="'+esc(p.id)+'">Hapus</button></div>').join('')+'</div>':empty('Belum ada kampanye','Pilih Airdrop untuk menyimpan proyek pertama Anda.'))+
 (orphaned.length?'<div class="callout">'+orphaned.length+' ID kampanye tersimpan tidak terdapat dalam katalog saat ini. Data tidak dihapus dan tetap disertakan pada ekspor.</div>':'')+
 '<div class="section-head"><h2>Tambah kampanye</h2><button data-tab="explore">Buka katalog →</button></div>';
}
function profile(){
 const notes=Object.values(state.notes).filter(x=>x.trim()).length;
 return header('Profil','Kelola identitas riset dan cadangan lokal tanpa console admin atau fitur tambahan.')+
 '<section class="surface"><form id="profile-form" class="form"><label>Nama tampilan<input type="text" name="name" maxlength="60" required value="'+esc(state.name)+'"></label><div><button class="btn primary" type="submit">Simpan nama</button></div></form></section>'+
 '<div class="section-head"><h2>Data & privasi</h2></div><section class="surface"><p class="muted">Data lima tab disimpan secara lokal di perangkat. Sinkronisasi cloud, wallet, konsol admin, dan alat eksternal tidak tersedia di antarmuka ini.</p>'+
 '<p class="counter">'+state.tracked.length+' kampanye · '+notes+' catatan · '+state.quests.length+' quest</p><div class="profile-actions"><button class="btn" data-export="json">Ekspor data JSON</button><button class="btn" data-import="json">Impor cadangan</button><input id="backup-file" class="hide" type="file" accept=".json,application/json"></div>'+
 '<div class="callout">Cadangan dapat memuat catatan pribadi. Simpan file dengan aman. Sistem tidak meminta seed phrase, kunci privat, atau tanda tangan transaksi.</div></section>';
}
function render(){
 const nav=navHTML();
 $('#desktop-nav').innerHTML=nav;
 $('#mobile-nav').innerHTML=nav;
 const title=TABS.find(x=>x[0]===page)?.[1]||'Beranda';
 $('#page-title').textContent=title;
 $('#app').innerHTML=({home,explore,missions:quest,workspace:portfolio,profile}[page])();
}
function updateQuest(id){
 if(!CORE_QUESTS.some(q=>q.id===id)||state.quests.includes(id))return;
 state.quests.push(id);save();
}
function saveProject(id){
 const project=catalog.find(p=>p.id===id);if(!project)return notify('Kampanye tidak tersedia.');
 if(state.tracked.includes(id)){state.tracked=state.tracked.filter(x=>x!==id);notify('Dihapus dari portofolio.');}
 else {state.tracked.push(id);updateQuest('watch');notify('Ditambahkan ke portofolio.');}
 save();render();
}
function openNote(id){
 const p=catalog.find(x=>x.id===id);if(!p)return;
 $('#note-title').textContent='Catatan · '+p.name;
 $('#note-id').value=id;
 $('#note-text').value=state.notes[id]||'';
 $('#note-dialog').showModal();
}
function download(json){
 const blob=new Blob([JSON.stringify(json,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='airdrop-museum-portfolio-'+new Date().toISOString().slice(0,10)+'.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
document.addEventListener('click',async event=>{
 const tab=event.target.closest('[data-tab]');if(tab){navigate(tab.dataset.tab);return;}
 const saveButton=event.target.closest('[data-save]');if(saveButton){saveProject(saveButton.dataset.save);return;}
 const note=event.target.closest('[data-note]');if(note){openNote(note.dataset.note);return;}
 const questButton=event.target.closest('[data-quest]');if(questButton){
  if(questButton.dataset.quest==='safety'&&!state.privacyRead){
   $('#safety-dialog').showModal();return;
  }
  if(questButton.dataset.quest==='source'&&!state.quests.includes('watch')){notify('Simpan kampanye terlebih dahulu.');navigate('explore');return;}
  updateQuest(questButton.dataset.quest);render();notify('Progres lokal diperbarui.');return;
 }
 if(event.target.closest('[data-safety-read]')){state.privacyRead=true;updateQuest('safety');$('#safety-dialog').close();save();render();return;}
 if(event.target.closest('[data-export]')){download(state);return;}
 if(event.target.closest('[data-import]')){$('#backup-file').click();return;}
 if(event.target.closest('[data-reload]')){await loadCatalog();return;}
 if(event.target.closest('[data-dialog-close]')){event.target.closest('dialog')?.close();return;}
});
document.addEventListener('input',event=>{if(event.target.id==='campaign-search'){search=event.target.value;const at=event.target.selectionStart;render();const input=$('#campaign-search');input.focus();input.setSelectionRange(at,at);}});
document.addEventListener('change',async event=>{
 if(event.target.id==='chain-filter'){chainFilter=event.target.value;render();return;}
 if(event.target.id==='backup-file'){
  try{
   const file=event.target.files?.[0];if(!file)return;if(file.size>1024*1024)throw Error('Cadangan melebihi 1 MB');
   const data=JSON.parse(await file.text());
   if(data.version!==1||!Array.isArray(data.tracked)||!data.notes||typeof data.notes!=='object'||!Array.isArray(data.quests))throw Error('Format cadangan tidak sesuai');
   if(!confirm('Ganti data lima tab pada perangkat ini dengan cadangan terpilih?'))return;
   state=cleanState(data);save();render();notify('Cadangan berhasil dimuat.');
  }catch(e){notify('Gagal mengimpor: '+e.message);}finally{event.target.value='';}
 }
});
document.addEventListener('submit',event=>{
 if(event.target.id==='profile-form'){event.preventDefault();const value=new FormData(event.target).get('name');if(typeof value!=='string'||!value.trim())return;state.name=value.trim().slice(0,60);save();render();notify('Profil disimpan.');}
 if(event.target.id==='note-form'){event.preventDefault();const id=$('#note-id').value;if(!state.tracked.includes(id))return;state.notes[id]=$('#note-text').value.slice(0,4000);if(state.notes[id].trim())updateQuest('note');save();$('#note-dialog').close();render();notify('Catatan tersimpan.');}
});
window.addEventListener('hashchange',()=>{const selected=route(location.hash.slice(1));if(selected!==page){page=selected;render();}});
page=route(location.hash.slice(1));render();loadCatalog();
try{const tg=window.Telegram?.WebApp;if(tg){tg.ready();tg.expand();tg.BackButton?.hide();}}catch{}
