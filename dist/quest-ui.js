// Sprint 4 UI enhancer for the existing Aggregator page. All template values are escaped.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const init=()=>window.Telegram?.WebApp?.initData||'';
const disclaimer='Status quest adalah catatan pribadi dan bukan jaminan eligibility atau reward.';
const names={social:'Sosial',testnet_task:'Testnet',mainnet_task:'Mainnet',bridge:'Bridge',swap:'Swap',liquidity:'Likuiditas',governance:'Governance',referral:'Referral',kyc:'KYC',custom:'Lainnya'};
const methods={manual:'Manual',wallet_activity:'Aktivitas wallet',url_submission:'Kirim URL',admin_review:'Ditinjau admin',none:'Catatan manual'};
const badge=s=>s==='verified'?'Terverifikasi':s==='expired'?'Kedaluwarsa':s==='submitted'?'Menunggu verifikasi':'Draft lokal';
const datetime=v=>v?new Date(v).toLocaleString('id-ID'):'Tidak tersedia';
const safeLink=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
async function request(path,options={}){
 const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(init()?{'X-Telegram-Init-Data':init()}:{}),...options.headers};
 const res=await fetch('/api/aggregator'+path,{...options,headers,signal:AbortSignal.timeout(15000)});
 const result=await res.json();if(!res.ok)throw Error(result.error||'Layanan tidak tersedia');return result;
}
function message(target,error){const box=$(target);if(box)box.textContent=error?.message||String(error)}
function drafts(){try{return JSON.parse(localStorage.getItem('am_quest_drafts_v1')||'{}')}catch{return {}}}
function draft(qid,status,note,url){const state=drafts();state[qid]={status,note,evidence_url:url,updated_at:Date.now()};localStorage.setItem('am_quest_drafts_v1',JSON.stringify(state))}
async function showQuest(slug){
 const mount=$('quest-mount');if(!mount)return;
 mount.innerHTML='<p>Memuat quest...</p>';
 try{
  const data=await request('/campaigns/'+encodeURIComponent(slug)+'/quests?limit=100');
  const progress=data.quests.filter(q=>q.required===1),completed=progress.filter(q=>q.status==='verified').length;
  mount.innerHTML='<h3>Quest campaign</h3><p class="meta">Poin di sini adalah metrik internal, bukan token atau saldo.</p><div class="quest-progress"><span style="width:'+(progress.length?Math.round(completed/progress.length*100):0)+'%"></span></div><p>'+completed+' dari '+progress.length+' quest wajib terverifikasi</p><p class="notice">'+esc(disclaimer)+'</p><div id="quest-list"></div>';
  $('quest-list').innerHTML=data.quests.map(q=>{
   const local=!init()?(drafts()[q.id]||{}):{},status=q.status!=='todo'?q.status:local.status||'todo',deadline=q.ends_at,expired=deadline&&deadline<Date.now();
   const url=safeLink(q.official_url),start=q.starts_at&&q.starts_at>Date.now();
   return '<article class="card quest-card" data-quest="'+esc(q.id)+'"><div class="quest-heading"><h4>'+esc(q.title)+'</h4><span class="badge">'+esc(expired?'Kedaluwarsa':badge(status))+'</span></div><p>'+esc(q.description)+'</p><p class="meta">'+esc(names[q.quest_type]||q.quest_type)+' · Verifikasi: '+esc(methods[q.verification_method]||q.verification_method)+' · '+esc(q.points)+' poin internal</p><p class="meta">Deadline: '+esc(datetime(deadline))+' · Diperbarui: '+esc(datetime(q.progress_updated_at||local.updated_at||q.updated_at))+'</p>'+(url?'<p><a href="'+esc(url)+'" rel="noopener noreferrer" target="_blank">Sumber resmi</a></p>':'<p>Sumber resmi belum dicantumkan.</p>')+
   '<form data-quest-form="'+esc(q.id)+'"><label>Status<select name="status">'+['todo','in_progress','submitted','failed','not_applicable'].map(s=>'<option value="'+s+'" '+(status===s?'selected':'')+'>'+esc({todo:'Belum dimulai',in_progress:'Sedang dikerjakan',submitted:'Menunggu verifikasi',failed:'Gagal',not_applicable:'Tidak berlaku'}[s])+'</option>').join('')+'</select></label><label>Evidence URL (HTTPS)<input name="evidence_url" type="url" maxlength="2048" placeholder="https://..." value="'+esc(q.my_evidence_url||local.evidence_url||'')+'"></label><label>Catatan<textarea name="note" maxlength="1000">'+esc(q.my_note||local.note||'')+'</textarea></label><button '+(expired||start?'disabled':'')+'>Simpan progres</button></form><p class="quest-feedback" aria-live="polite"></p></article>';
  }).join('')||'<p>Belum ada quest di campaign ini.</p>';
  $('quest-list').querySelectorAll('form[data-quest-form]').forEach(form=>form.onsubmit=async event=>{
   event.preventDefault();const fd=new FormData(form),qid=form.dataset.questForm,body={status:fd.get('status'),note:fd.get('note'),evidence_url:fd.get('evidence_url')||null};
   const feedback=form.parentElement.querySelector('.quest-feedback');
   try{
    if(!init()){draft(qid,body.status,body.note,body.evidence_url);feedback.textContent='Draft lokal tersimpan. Tidak memberikan poin atau eligibility.';return}
    const quest=data.quests.find(x=>x.id===qid),endpoint=quest.verification_method==='url_submission'&&body.status==='submitted'?'/quests/'+qid+'/evidence':'/quests/'+qid+'/progress';
    await request(endpoint,{method:'POST',body:JSON.stringify(body)});
    feedback.textContent='Progres diperbarui.';await Promise.all([showQuest(slug),showNextActions()]);
   }catch(e){feedback.textContent=e.message}
  });
 }catch(error){mount.textContent=error.message}
}
async function showNextActions(){
 const list=$('next-actions-list');if(!list)return;
 if(!init()){list.textContent='Buka melalui Telegram Mini App untuk rekomendasi personal, streak, dan poin terverifikasi.';return;}
 try{
  const [next,profile]=await Promise.all([request('/next-actions'),request('/quests/my?limit=1&ledger_limit=5&tz='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'))]);
  $('quest-stats').innerHTML='<div class="card"><b>'+esc(profile.points)+' poin internal</b><p>Saldo poin tracking, bukan aset.</p></div><div class="card"><b>'+esc(profile.streak)+' hari streak</b><p>Quest terverifikasi harian.</p></div>';
  list.innerHTML=['harus_segera','minggu_ini','bisa_menunggu'].map(group=>'<div class="quest-group"><h3>'+esc(({harus_segera:'Harus segera',minggu_ini:'Minggu ini',bisa_menunggu:'Bisa menunggu'})[group])+'</h3>'+((next[group]||[]).map(q=>'<article class="card"><h4>'+esc(q.quest_title)+'</h4><p class="meta">'+esc(q.campaign_name)+' · '+esc(q.points)+' poin internal · '+esc(q.status)+'</p><p>'+esc(q.reason)+'</p><p class="meta">Deadline: '+esc(datetime(q.deadline))+'. Sisa waktu: '+esc(q.hours_left===null?'Tidak diketahui':q.hours_left+' jam')+'</p><a href="?campaign='+encodeURIComponent(q.campaign_slug)+'">Lihat campaign</a></article>').join('')||'<p>Belum ada tindakan dalam kelompok ini.</p>')+'</div>').join('')+'<p class="notice">'+esc(disclaimer)+'</p>';
 }catch(error){list.textContent=error.message}
}
function mountTab(){
 const body=$('detail-body'),mount=$('quest-mount');if(!body||!mount||body.querySelector('.detail-quest-tabs'))return;const slug=mount.dataset.campaign;
 const nav=document.createElement('div');nav.className='detail-quest-tabs';
 const summary=document.createElement('button'),quest=document.createElement('button');
 summary.textContent='Ringkasan & bukti';quest.textContent='Quest';nav.append(summary,quest);
 const overview=document.createElement('div');
 for(const node of [...body.childNodes])if(node!==mount)overview.append(node);
 mount.hidden=true;body.append(nav,overview,mount);
 const active=isQuest=>{overview.hidden=isQuest;mount.hidden=!isQuest;summary.setAttribute('aria-pressed',String(!isQuest));quest.setAttribute('aria-pressed',String(isQuest));if(isQuest)showQuest(slug)};
 summary.onclick=()=>active(false);quest.onclick=()=>active(true);active(false);
}
const body=$('detail-body');if(body)new MutationObserver(()=>mountTab()).observe(body,{childList:true});
mountTab();showNextActions();
