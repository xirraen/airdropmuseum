const $=id=>document.getElementById(id);
const make=(tag,value,className)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);if(className)e.className=className;return e;};
const add=(parent,...children)=>{parent.append(...children);return parent;};
const card=(title)=>add(make('article',undefined,'card'),make('h3',title));
const stat=(value)=>make('span',value,'tag');
const notice=(error)=>{$('message').textContent=error||'';};
const date=(value)=>value?new Date(value).toLocaleString('id-ID',{timeZone:'UTC'})+' UTC':'Tidak tersedia';
const formatUSD=(v)=>Number(v||0).toLocaleString('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2});
const $form=(form,name)=>form.elements.namedItem(name);
const asNumber=(form,name)=>Number($form(form,name).value);
const external=(url,label)=>{const a=make('a',label);try{const u=new URL(url);if(u.protocol!=='https:')throw Error('INVALID_URL');a.href=u.href;a.rel='noopener noreferrer';a.target='_blank';}catch{a.textContent='URL tidak valid';}return a;};
const token=()=>window.Telegram?.WebApp?.initData||'';
async function call(path,method='GET',data){
 const headers={'Accept':'application/json'};
 if(token())headers['X-Telegram-Init-Data']=token();
 const options={method,headers,credentials:'same-origin'};
 if(data!==undefined){headers['Content-Type']='application/json';options.body=JSON.stringify(data);}
 const result=await fetch(path,options),body=await result.json().catch(()=>({error:'INVALID_SERVER_RESPONSE'}));
 if(!result.ok)throw Error(body.error||'REQUEST_FAILED');
 return body;
}
async function refreshDecisions(){
 const root=$('decision-list');root.replaceChildren(make('p','Memuat keputusan…','muted'));
 try{
  const {items}=await call('/api/decisions');root.replaceChildren();
  if(!items.length)return root.append(make('p','Belum ada keputusan tersimpan. Catat alasan sebelum mengikuti campaign.','muted'));
  for(const item of items){
   const e=card(item.campaign_id);add(e,make('p','Dibuat '+date(item.created_at)+' · '+(item.outcome||'Outcome belum dicatat'),'muted'),
    make('p','Alasan: '+item.reason),make('p','Batas biaya USD '+formatUSD(item.cost_ceiling_usd)+' · Waktu '+item.time_budget_minutes+' menit'),
    external(item.primary_evidence_url,'Bukti utama'));
   const form=make('form');form.className='grid';form.style.marginTop='16px';
   const l1=make('label','Hasil');const select=make('select');select.name='outcome';
   for(const [value,name] of [['unknown','Tidak diketahui'],['allocated','Mendapat alokasi'],['not_allocated','Tidak mendapat alokasi']]){
    const option=make('option',name);option.value=value;option.selected=item.outcome===value;select.append(option);
   }
   l1.append(select);const l2=make('label','Pelajaran');l2.className='wide';
   const input=make('textarea');input.required=true;input.maxLength=2000;input.rows=2;input.value=item.lessons||'';l2.append(input);
   const submit=make('button','Simpan Outcome Review','primary wide');submit.type='submit';
   form.append(l1,l2,submit);
   form.addEventListener('submit',async ev=>{ev.preventDefault();submit.disabled=true;try{await call('/api/decisions/'+encodeURIComponent(item.id)+'/outcome','PUT',{outcome:select.value,lessons:input.value});notice('Outcome Review disimpan dan terhubung ke keputusan.');await refreshDecisions();}catch(error){notice(error.message);}finally{submit.disabled=false;}});
   e.append(form);root.append(e);
  }
 }catch(error){root.replaceChildren(make('p',error.message,'muted'));}
}
async function refreshAutopsy(){
 const root=$('autopsy-list');
 try{const {items}=await call('/api/autopsy');root.replaceChildren();
  if(!items.length)return root.append(make('p','Belum ada Claim Autopsy.','muted'));
  for(const r of items){const a=card(r.campaign_id);
   add(a,make('p','Hasil: '+r.outcome+' · '+date(r.created_at)),
    add(make('div',undefined,'kv'),stat('Quest '+r.quest_count),stat('Chain '+r.chain_count),stat('Gas USD '+formatUSD(r.gas_cost_usd)),stat('Bridge USD '+formatUSD(r.bridge_cost_usd))),
    make('p','Hipotesis: '+(r.hypothesis||'Belum ditulis')),    make('p',r.consent_to_analysis?'Analisis pribadi diizinkan':'Tidak disertakan dalam Pattern Review','muted'));
   const actions=make('div',undefined,'kv');
   const consent=make('button',r.consent_to_analysis?'Cabut izin analisis':'Izinkan analisis');consent.type='button';
   consent.onclick=async()=>{try{await call('/api/autopsy/'+encodeURIComponent(r.id)+'/consent','PUT',{consent_to_analysis:!r.consent_to_analysis});notice('Izin analisis diperbarui.');refreshAutopsy();}catch(e){notice(e.message);}};
   const del=make('button','Hapus catatan privat');del.type='button';
   del.onclick=async()=>{if(!confirm('Hapus Claim Autopsy ini secara permanen?'))return;try{await call('/api/autopsy/'+encodeURIComponent(r.id),'DELETE');notice('Catatan dihapus.');refreshAutopsy();}catch(e){notice(e.message);}};
   actions.append(consent,del);a.append(actions);root.append(a);
  }
 }catch(err){root.replaceChildren(make('p',err.message,'muted'));}
}
function sampleInfo(d){
 const container=make('div',undefined,'kv');
 add(container,stat('Sampel '+d.sample_count),stat('Dari '+date(d.period?.from)),stat('Sampai '+date(d.period?.to)));
 return container;
}
async function refreshPatterns(){
 const root=$('pattern-results');root.replaceChildren();
 try{
  const data=await call('/api/insights/patterns');
  const overview=card('Dasar analisis');add(overview,sampleInfo(data),make('p',data.notice),make('p',data.limitations,'muted'));root.append(overview);
  for(const insight of data.insights){const e=card(insight.label);add(e,sampleInfo(insight),make('p',insight.description),make('p',insight.limitations,'muted'));root.append(e);}
 }catch(err){root.append(make('p',err.message,'muted'));}
}
async function refreshWeekly(){
 const root=$('weekly-results');root.replaceChildren();
 try{
  const d=await call('/api/insights/weekly');
  const intro=card('Minggu berjalan');add(intro,sampleInfo(d),
   make('p','Ikut '+d.campaigns_followed.length+' campaign · Alokasi '+d.outcomes.allocated+' · Tidak alokasi '+d.outcomes.not_allocated+' · Tidak diketahui '+d.outcomes.unknown+' · Belum ditinjau '+d.outcomes.pending),
   make('p','Bukti utama dari sumber resmi (menurut catatan): '+d.evidence_quality.primary_source_decisions),
   make('p',d.notice),make('p',d.evidence_quality.notice,'muted'),make('p',d.limitations,'muted'));root.append(intro);
  const revisit=card('Perlu ditinjau ulang');
  if(!d.revisit.length)revisit.append(make('p','Tidak ada item yang perlu ditinjau ulang minggu ini.','muted'));
  for(const r of d.revisit)revisit.append(make('p',r.campaign_id+' — '+r.reason));
  root.append(revisit);
  const lessons=card('Pelajaran');
  if(!d.lessons.length)lessons.append(make('p','Belum ada pelajaran yang dicatat.','muted'));
  for(const l of d.lessons)lessons.append(make('p',l.lesson));
  root.append(lessons);
 }catch(err){root.append(make('p',err.message,'muted'));}
}
async function displayCard(slug){
 const root=$('evidence-result');root.replaceChildren();
 try{
  const d=await call('/api/evidence-card/'+encodeURIComponent(slug));
  const e=card(d.campaign_slug);add(e,make('p',d.claim),add(make('div',undefined,'kv'),stat(d.status),stat('Sumber '+d.source_count),stat('Konflik '+d.conflicts.length)),
   sampleInfo(d),make('p','Terakhir diperiksa: '+date(d.last_checked_at)));
  const sources=card('Sumber primer');for(const s of d.primary_sources) sources.append(add(make('p'),external(s.url,s.url),make('span',' · '+date(s.last_checked_at),'muted')));
  const confirm=card('Konfirmasi');for(const s of d.confirmations)confirm.append(add(make('p'),external(s.url,s.url),make('span',' · '+s.tier,'muted')));
  if(!d.confirmations.length)confirm.append(make('p','Belum ada konfirmasi tambahan yang tercatat.','muted'));
  const conflicts=card('Konflik');for(const c of d.conflicts)conflicts.append(make('p',c.field+' · '+c.severity+' · '+c.status));
  if(!d.conflicts.length)conflicts.append(make('p','Tidak ada konflik terbuka yang tercatat (bukan bukti tidak ada risiko).','muted'));
  const caution=card('Batasan');add(caution,make('p',d.limitations),make('p',d.disclaimer));
  const button=make('button','Bagikan kartu tanpa data pribadi','primary');
  button.addEventListener('click',async()=>{const text=[d.claim,'Status: '+d.status,'Sumber primer: '+d.primary_sources.map(x=>x.url).join(', '),
   'Konfirmasi tambahan: '+(d.confirmations.map(x=>x.url).join(', ')||'Belum ada'),
   'Konflik terbuka: '+(d.conflicts.map(x=>x.field+' ('+x.severity+')').join(', ')||'Tidak ada yang tercatat'),
   'Terakhir diperiksa: '+(d.last_checked_at||'Belum diketahui'),'Sampel sumber: '+d.sample_count,
   'Periode: '+(d.period?.from||'Tidak tersedia')+' — '+(d.period?.to||'Tidak tersedia'),
   d.limitations,d.disclaimer].join('\n');
   try{if(navigator.share)await navigator.share({title:'Evidence Chain: '+d.campaign_slug,text});else if(navigator.clipboard){await navigator.clipboard.writeText(text);notice('Isi kartu publik disalin.');}else notice('Fitur berbagi tidak tersedia.');}catch(err){if(err.name!=='AbortError')notice('Gagal membagikan kartu.');}});
  caution.append(button);root.append(e,sources,confirm,conflicts,caution);
 }catch(err){root.append(make('p',err.message,'muted'));}
}
const sections=['decisions','autopsy','insights','weekly','evidence'];
function tab(id){
 if(!sections.includes(id))id='decisions';
 for(const section of sections)$(section).hidden=section!==id;
 for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===id;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));}
 notice('');
 if(id==='decisions')refreshDecisions();
 if(id==='autopsy')refreshAutopsy();
 if(id==='insights')refreshPatterns();
 if(id==='weekly')refreshWeekly();
 history.replaceState(null,'',location.pathname+'?tab='+encodeURIComponent(id));
}
for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>tab(b.dataset.tab));
$('decision-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
 try{
  const body={campaign_id:$form(form,'campaign_id').value.trim(),reason:$form(form,'reason').value,
   primary_evidence_url:$form(form,'primary_evidence_url').value,decision_source:$form(form,'decision_source').value,
   time_budget_minutes:asNumber(form,'time_budget_minutes'),cost_ceiling_usd:asNumber(form,'cost_ceiling_usd'),
   realistic_expectations:$form(form,'realistic_expectations').value};
  await call('/api/decisions','POST',body);form.reset();notice('Keputusan disimpan. Campaign telah ditandai “diikuti” di jurnal keputusan.');refreshDecisions();
 }catch(err){notice(err.message);}finally{button.disabled=false;}
});
$('autopsy-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
 try{
  const evidence=[];for(const [kind,name] of [['tx_hash','tx_hash'],['screenshot','screenshot'],['official_link','official_link']]){
   const value=$form(form,name).value.trim();if(value)evidence.push({kind,value});
  }
  const body={campaign_id:$form(form,'campaign_id').value.trim(),wallet_address:$form(form,'wallet_address').value.trim(),
   activity_before_snapshot:$form(form,'activity_before_snapshot').checked,activity_after_snapshot:$form(form,'activity_after_snapshot').checked,
   quest_count:asNumber(form,'quest_count'),chain_count:asNumber(form,'chain_count'),
   gas_cost_usd:asNumber(form,'gas_cost_usd'),bridge_cost_usd:asNumber(form,'bridge_cost_usd'),
   research_minutes:asNumber(form,'research_minutes'),decision_source:$form(form,'decision_source').value,
   outcome:$form(form,'outcome').value,hypothesis:$form(form,'hypothesis').value,evidence,
   consent_to_analysis:$form(form,'consent_to_analysis').checked};
  await call('/api/autopsy','POST',body);form.reset();notice('Claim Autopsy tersimpan secara privat.');refreshAutopsy();
 }catch(err){notice(err.message);}finally{button.disabled=false;}
});
$('evidence-form').addEventListener('submit',e=>{e.preventDefault();displayCard(e.currentTarget.elements.namedItem('slug').value.trim());});
$('refresh-decisions').onclick=refreshDecisions;
$('refresh-insights').onclick=refreshPatterns;
$('refresh-weekly').onclick=refreshWeekly;
tab(new URL(location.href).searchParams.get('tab')||'decisions');
