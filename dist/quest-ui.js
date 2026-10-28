export function setupQuestUI({api,initData,guard,notify,telegramRequired,e,link,date}){
 const $=id=>document.getElementById(id);
 const name={social:'Sosial',testnet_task:'Testnet',mainnet_task:'Mainnet',bridge:'Bridge',swap:'Swap',liquidity:'Likuiditas',governance:'Governance',referral:'Referral',kyc:'KYC',custom:'Kustom'};
 const method={manual:'Manual',wallet_activity:'Aktivitas wallet',url_submission:'Pengiriman URL',admin_review:'Tinjauan admin',none:'Catatan manual'};
 const labels={todo:'Belum dimulai',in_progress:'Dikerjakan',submitted:'Dikirim',verified:'Terverifikasi',failed:'Gagal',expired:'Kedaluwarsa',not_applicable:'Tidak berlaku'};
 const badge=q=>q.status==='verified'?'Terverifikasi':q.ends_at&&q.ends_at*1000<=Date.now()?'Kedaluwarsa':q.status==='submitted'?'Menunggu verifikasi':'Draft lokal';
 async function renderQuestPanel(c){
  const el=$('quest-panel');if(!el)return;
  let data;try{data=await api('/campaigns/'+encodeURIComponent(c.slug)+'/quests?limit=100');}catch(err){el.textContent='Quest tidak tersedia: '+err.message;return}
  let progress=null;if(initData())try{progress=await api('/campaigns/'+encodeURIComponent(c.slug)+'/progress')}catch(err){notify(err.message)}
  el.innerHTML='<p class="notice">Status quest adalah catatan pribadi dan bukan jaminan eligibility atau reward.</p>'
   +(progress?'<p><b>'+e(progress.verified)+' / '+e(progress.total)+' quest terverifikasi</b> · '+e(progress.percent)+'%</p><progress value="'+e(progress.percent)+'" max="100"></progress><p class="meta">Quest wajib: '+e(progress.required_verified)+' / '+e(progress.required_total)+' · bukan keputusan eligibility final.</p>':'<p class="meta">Buka melalui Telegram untuk menyimpan progres pribadi.</p>')
   +'<div class="quest-grid">'+data.quests.map(q=>{
    const expired=q.ends_at&&q.ends_at*1000<=Date.now();
    const actions=!initData()||expired||q.status==='verified'?'':'<div class="quest-status-buttons">'+['in_progress','submitted','todo','failed','not_applicable'].map(status=>'<button type="button" data-qid="'+e(q.id)+'" data-qstatus="'+e(status)+'">'+e(labels[status])+'</button>').join('')+'</div>';
    const evidence=!initData()||expired||q.status==='verified'?'':'<form data-quest-evidence="'+e(q.id)+'"><label>Evidence URL HTTPS<input name="evidence_url" type="url" maxlength="2048" placeholder="https://..." required></label><button type="submit">Kirim bukti</button></form>';
    return '<article class="quest-card"><span class="quest-badge">'+e(badge(q))+'</span><h4>'+e(q.title)+'</h4><p>'+e(q.description)+'</p><p class="meta">'+e(name[q.quest_type]||q.quest_type)+' · '+e(method[q.verification_method]||q.verification_method)+'</p><p>Poin internal: <b>'+e(q.points)+'</b> · '+e(q.required?'Wajib':'Opsional')+'</p><p>Status: '+e(labels[q.status]||q.status)+' · Tenggat: '+e(q.ends_at?date(q.ends_at*1000):'Belum ditentukan')+'</p>'+(q.official_url?'<p>'+link(q.official_url,'Sumber resmi')+'</p>':'')+(q.evidence_url?'<p>'+link(q.evidence_url,'Bukti')+'</p>':'')+actions+evidence+'</article>';
   }).join('')+'</div>'+(data.total>data.quests.length?'<p class="meta">Sebagian quest perlu dimuat melalui pagination.</p>':'');
  el.querySelectorAll('[data-qstatus]').forEach(b=>b.onclick=guard(async()=>{telegramRequired();await api('/quests/'+b.dataset.qid+'/progress',{method:'PUT',body:JSON.stringify({status:b.dataset.qstatus})});await renderQuestPanel(c);await renderNextActions()}));
  el.querySelectorAll('[data-quest-evidence]').forEach(form=>form.onsubmit=guard(async event=>{telegramRequired();const evidence_url=String(new FormData(event.target).get('evidence_url'));if(!evidence_url.startsWith('https://'))throw Error('URL bukti harus HTTPS.');await api('/quests/'+form.dataset.questEvidence+'/evidence',{method:'POST',body:JSON.stringify({evidence_url})});await renderQuestPanel(c);await renderNextActions()}));
 }
 async function renderNextActions(){
  const el=$('next-action-list'),stats=$('quest-stats');if(!el||!stats)return;
  if(!initData()){stats.textContent='Buka melalui Telegram untuk melihat rekomendasi, poin dan streak.';el.textContent='';return}
  try{
   const [d,m]=await Promise.all([api('/next-actions?limit=100'),api('/quests/my?limit=10')]);
   stats.innerHTML='<p>Poin internal: <strong>'+e(m.points.points)+'</strong></p><p>Streak: <strong>'+e(m.streak.streak)+' hari</strong></p><small>Bukan saldo/token atau jaminan reward.</small>';
   const groups={harus_segera:'Harus segera',minggu_ini:'Minggu ini',bisa_menunggu:'Bisa menunggu'};
   el.innerHTML=Object.entries(groups).map(([key,label])=>'<article class="quest-card"><h3>'+e(label)+'</h3>'+(d[key].length?d[key].map(x=>'<p><b>'+e(x.campaign_name)+'</b><br>'+e(x.quest_title)+' · '+e(x.points)+' poin internal · '+e(x.hours_left??'—')+' jam tersisa<br><small>'+e(x.reason)+'</small><br><a href="?campaign='+encodeURIComponent(x.campaign_slug)+'">Lihat campaign</a></p>').join(''):'<p>Belum ada tindakan.</p>')+'</article>').join('');
  }catch(err){stats.textContent='Next Best Action tidak tersedia: '+err.message;el.textContent=''}
 }
 return {renderQuestPanel,renderNextActions};
}
