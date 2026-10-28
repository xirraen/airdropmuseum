const $=id=>document.getElementById(id);
const boot=window.Telegram?.WebApp?.initData||'';
const state={scope:window.Telegram?.WebApp?.initDataUnsafe?.user?.id?'tg:'+window.Telegram.WebApp.initDataUnsafe.user.id:null,envelope:null};
const status=text=>{$('portfolio-status').textContent=text;};
const safeURL=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
const create=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined&&text!==null)el.textContent=String(text);if(cls)el.className=cls;return el};
function row(parent,title,desc,link){const div=create('article',null,'list-row');div.append(create('strong',title));if(desc)div.append(create('p',desc,'meta'));const url=safeURL(link);if(url){const a=create('a','Sumber resmi');a.href=url;a.target='_blank';a.rel='noopener noreferrer';div.append(a)}parent.append(div);return div}
function clear(id){const el=$(id);el.replaceChildren();return el}
async function api(path,options={}){if(!boot)throw Error('Buka Portfolio melalui Mini App Telegram untuk memverifikasi akun.');const r=await fetch('/api/aggregator'+path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),'X-Telegram-Init-Data':boot,...options.headers},signal:AbortSignal.timeout(45000)});if(!r.ok){let reason;try{reason=(await r.json()).error}catch{}throw Error(reason||'Permintaan tidak berhasil ('+r.status+').')}return r}
async function json(path,options){return (await api(path,options)).json()}
const allActions=a=>[...(a?.harus_segera||[]),...(a?.minggu_ini||[]),...(a?.bisa_menunggu||[])];
async function load(){status('');const d=await json('/portfolio');const container=clear('portfolio-summary'),s=d.summary||{};const metrics=[['Campaign diikuti',s.total_campaigns],['Campaign aktif',s.active_campaigns],['Quest TODO',s.quests?.todo],['In progress',s.quests?.in_progress],['Submitted',s.quests?.submitted],['Verified',s.quests?.verified],['Expired',s.quests?.expired],['Poin internal',s.internal_points],['Wallet dipantau',s.wallets_monitored],['Chain digunakan',s.chains_used],['Claimable berbukti resmi',s.verified_claimable],['Deadline 7 hari',s.deadlines_7d],['Perlu tinjauan',s.manual_review]];for(const [name,value] of metrics){const el=create('div',null,'metric');el.append(create('strong',value??0),create('span',name));container.append(el)}
 const deadline=clear('portfolio-deadlines');for(const x of d.deadlines?.items||[])row(deadline,x.campaign+' · '+x.type,x.deadline,x.source_url);if(!deadline.childElementCount)row(deadline,'Tidak ada deadline dekat','Pantau sumber resmi secara berkala.');
 const exposure=clear('portfolio-exposure');exposure.append(create('p',(d.chain_exposure?.label||'Belum ada data')+' · '+(d.chain_exposure?.total_activity||0)+' observasi'));
 for(const x of d.chain_exposure?.items||[]){const div=row(exposure,x.chain,x.activity+' observasi · '+x.percent+'%');const track=create('div',null,'bar-track'),fill=create('div',null,'bar-fill');fill.style.width=Math.max(0,Math.min(100,x.percent))+'%';track.setAttribute('aria-label',x.chain+': '+x.percent+' persen');track.append(fill);div.append(track)}
 const actions=clear('portfolio-actions');for(const x of allActions(d.next_best_actions).slice(0,25))row(actions,x.campaign_name+' · '+x.quest_title,x.group+' · '+x.status+' · '+x.reason);if(!actions.childElementCount)row(actions,'Belum ada aksi prioritas','Periksa daftar quest untuk campaign yang Anda ikuti.');
 const risk=clear('portfolio-risk');for(const x of d.risk_review?.items||[])row(risk,'Perlu ditinjau · '+x.campaign,x.reason+(x.quest?' · '+x.quest:''),x.source_url);if(!risk.childElementCount)row(risk,'Tidak ada item tertunda yang tercatat','Ini bukan penetapan keamanan campaign.');
}
async function download(filename,blob){const url=URL.createObjectURL(blob);try{const a=create('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove()}finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}}
async function exportAll(format){
 const extension=format==='markdown'?'md':format,parts=[];let offset=0,pages=0,payload=null;
 while(pages++<100){
  const r=await api('/export/'+format+'?limit=100&offset='+offset),text=await r.text();let value=text;
  if(format==='csv'&&offset>0)value=text.slice(text.indexOf('\n')+1);
  if(format==='json'){const data=JSON.parse(text);if(!payload)payload=data;else payload.campaigns.push(...data.campaigns);value='';}
  parts.push(value);const next=r.headers.get('X-Next-Offset');if(!next)break;offset=Number(next);if(!Number.isSafeInteger(offset))throw Error('PAGINATION_INVALID');
 }
 if(pages>100)throw Error('Ekspor melebihi batas halaman; persempit data.');
 const blob=new Blob([format==='json'?JSON.stringify({...payload,next_offset:null},null,2):parts.join(format==='markdown'?'\n\n':'' )],{type:format==='csv'?'text/csv;charset=utf-8':format==='json'?'application/json':'text/markdown;charset=utf-8'});
 await download('airdrop-museum-portfolio.'+extension,blob);status('Ekspor '+format+' selesai.');
}
async function history(){const data=await json('/backup/history');const el=clear('backup-history');for(const x of data.items||[]){const div=row(el,x.kind+' · '+x.status,x.created_at+' · '+x.size+' byte · versi '+x.schema_version);if(x.status==='ready'&&x.kind!=='server'){const b=create('button','Unduh backup');b.onclick=guard(async()=>{const response=await api('/backup/'+x.backup_id);await download('airdrop-museum-backup-'+x.backup_id+'.json',await response.blob())});div.append(b)}}if(!el.childElementCount)row(el,'Belum ada backup','Buat backup untuk menyimpan salinan data pribadi Anda.')}
function guard(fn){return async e=>{const button=e?.currentTarget;if(button?.tagName==='BUTTON')button.disabled=true;try{await fn(e)}catch(ex){status(ex.message)}finally{if(button?.tagName==='BUTTON')button.disabled=false;updateRestore()}}}
function updateRestore(){const file=$('restore-file').files[0],replace=document.querySelector('input[name="restore-mode"]:checked').value==='replace';$('replace-confirm').hidden=!replace;$('restore').disabled=!file||(replace&&(!$('confirm-understanding').checked||$('confirm-phrase').value!=='HAPUS DATA SAYA'));}
$('refresh').onclick=guard(load);
document.querySelectorAll('[data-export]').forEach(b=>b.onclick=guard(()=>exportAll(b.dataset.export)));
$('create-backup').onclick=guard(async()=>{const r=await json('/backup',{method:'POST',body:'{}'});status('Backup dibuat: '+r.backup_id);await history()});
$('load-history').onclick=guard(history);
$('restore-file').addEventListener('change',updateRestore);
document.querySelectorAll('input[name="restore-mode"]').forEach(x=>x.addEventListener('change',updateRestore));
$('confirm-understanding').addEventListener('change',updateRestore);
$('confirm-phrase').addEventListener('input',updateRestore);
$('restore').onclick=guard(async()=>{
 const f=$('restore-file').files[0];if(!f)throw Error('Pilih file backup.');if(f.size>524288)throw Error('BACKUP_TOO_LARGE');let envelope;try{envelope=JSON.parse(await f.text())}catch{throw Error('Backup JSON tidak valid.')}
 const replace=document.querySelector('input[name="restore-mode"]:checked').value==='replace';
 if(!confirm(replace?'Langkah akhir: data portfolio lama akan diganti. Lanjutkan?':'Pulihkan data backup dengan metode merge?'))return;
 const result=await json('/restore',{method:'POST',body:JSON.stringify({envelope,mode:replace?'replace':'merge',...(replace?{confirm_scope:state.scope,confirm_phrase:$('confirm-phrase').value}:{})})});
 status('Restore berhasil. Backup sebelum restore: '+result.pre_restore_backup_id);await load();await history();
});
$('weekly-form').onsubmit=guard(async e=>{e.preventDefault();const data=await json('/portfolio/weekly-preferences',{method:'PUT',body:JSON.stringify({weekly_enabled:$('weekly-enabled').checked,timezone:$('weekly-timezone').value.trim()||'UTC'})});status('Preferensi laporan tersimpan: '+data.timezone)});
async function bootstrap(){if(!boot){status('Portfolio memerlukan verifikasi Telegram Mini App.');return}
 try{const t=await json('/portfolio/weekly-preferences');if(t){$('weekly-enabled').checked=t.weekly_enabled;$('weekly-timezone').value=t.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}await Promise.all([load(),history()]);}catch(e){status(e.message)}}
bootstrap();