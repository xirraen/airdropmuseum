const $=id=>document.getElementById(id);
const el=(tag,text,cl)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cl)x.className=cl;return x;};
const append=(p,...children)=>{p.append(...children);return p;};
const box=title=>append(el('article',undefined,'card'),el('h3',title));
const badge=t=>el('span',t,'tag');
const confidenceLabel=k=>({insufficient_data:'Data belum cukup',weak_pattern:'Pola lemah (deskriptif)',moderate_pattern:'Pola moderat (deskriptif)'})[k]||k;
const date=t=>t?new Date(t).toLocaleString('id-ID',{timeZone:'UTC'})+' UTC':'Belum tersedia';
const message=t=>{$('message').textContent=t||'';};
const formValue=(f,k)=>f.elements.namedItem(k).value;
const num=(f,k)=>Number(formValue(f,k));
const token=()=>window.Telegram?.WebApp?.initData||'';
let current=null;
async function api(path,method='GET',payload){
 const headers={'Accept':'application/json'};
 if(token())headers['X-Telegram-Init-Data']=token();
 const init={method,headers,credentials:'same-origin'};
 if(payload!==undefined){headers['Content-Type']='application/json';init.body=JSON.stringify(payload);}
 const response=await fetch(path,init);
 const result=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
 if(!response.ok)throw Error(result.error||'SERVICE_UNAVAILABLE');return result;
}
async function execute(task){try{message('');await task();}catch(error){message(error.message);}}
const base='/api/autopsy';
const refs=()=>current?.evidence?.slice(0,20).map(x=>x.id)||[];
const meta=()=>({expected_version:current.version,knowledge_cutoff_at:new Date().toISOString(),evidence_refs:refs()});
async function send(operation,payload){
 if(!current)throw Error('Pilih keputusan terlebih dahulu');
 const id=current.aggregate_id;
 const result=await api(base+'/'+encodeURIComponent(id)+'/'+operation,'POST',{...meta(),...payload});
 current=result.state;renderState();
 message('Event berhasil ditambahkan. Versi terbaru: '+result.version);
}
function external(url,label){const a=el('a',label);try{const u=new URL(url);if(u.protocol!=='https:')throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{a.textContent='URL tidak valid';}return a;}
function stateTitle(s){
 const d=box('Ringkasan aggregate');
 append(d,el('p','Campaign '+s.campaign_id+' · '+s.status+' · v'+s.version),
 el('p','Cutoff keputusan: '+date(s.decision_cutoff_at)),
 el('p','Cutoff hasil: '+date(s.outcome_cutoff_at)),
 el('p','Outcome: '+(s.outcome||'Belum ditetapkan')+' · Hipotesis: '+(s.hypothesis||'Belum dicatat')),
 el('p','Analisis pribadi: '+(s.analysis_consent?'Diizinkan':'Tidak diizinkan'),'muted'));
 if(s.decision)d.append(external(s.decision.primary_evidence_url,'Buka bukti utama'));
 return d;
}
function renderState(){
 const root=$('event-timeline');root.replaceChildren();
 $('active-aggregate').textContent=current?'Aggregate '+current.aggregate_id:'Pilih keputusan dari jurnal.';
 $('autopsy-actions').hidden=!current;
 if(!current)return;
 $('analysis-consent').checked=!!current.analysis_consent;
 const summary=$('state-summary');summary.replaceChildren(badge('v'+current.version),badge(current.status),badge(current.outcome||'outcome belum ada'));
 root.append(stateTitle(current));
 const header=el('h3','Riwayat event (immutable)');root.append(header);
 for(const event of current.timeline){
  const card=box('#'+event.version+' · '+event.type);
  append(card,el('p','Dicatat '+date(event.recorded_at)),
   el('p','Fase: '+({pre_outcome:'Sebelum outcome',outcome_transition:'Hasil pertama',post_outcome:'Sesudah outcome'}[event.knowledge_phase]||'Tidak diketahui')),
   el('p','Knowledge cutoff '+date(event.knowledge_cutoff_at),'muted'),
   el('p','Evidence refs: '+(event.evidence_refs.join(', ')||'Tidak berlaku'),'muted'));
  if(event.compensated)card.append(badge('Dikompensasi'));
  const allowed=['decision_created','activity_recorded','hypothesis_updated','evidence_added','outcome_recorded','outcome_revised','autopsy_finalized'];
  if(allowed.includes(event.type)&&!event.compensated){
   const b=el('button','Batalkan melalui compensating event');b.type='button';
   b.addEventListener('click',()=>execute(async()=>{
    const reason=prompt('Alasan pembatalan (wajib):');if(!reason?.trim())return;
    await send('compensate',{target_event_id:event.id,reason:reason.trim()});
   }));card.append(b);
  }
  root.append(card);
 }
 const actions=$('autopsy-actions');
 actions.querySelectorAll('form input,form select,form textarea,form button').forEach(x=>{x.disabled=current.status!=='open';});
 $('finalize').disabled=current.status!=='open'||current.outcome===null;
 $('save-consent').disabled=current.status==='cancelled';
}
async function loadState(id){
 const {state}=await api(base+'/'+encodeURIComponent(id));
 current=state;renderState();selectTab('autopsy');
}
async function loadDecisions(){
 const root=$('decision-list');root.replaceChildren(el('p','Memuat…','muted'));
 try{const {items}=await api(base+'/decisions');root.replaceChildren();
  if(!items.length)root.append(el('p','Belum ada keputusan. Buat Decision Entry sebelum mengikuti campaign.','muted'));
  for(const d of items){
   const card=box(d.campaign_id);append(card,el('p',d.reason),el('p','Sumber: '+d.decision_source+' · '+date(d.knowledge_cutoff_at),'muted'),
    external(d.primary_evidence_url,'Lihat bukti utama'));
   const b=el('button','Buka timeline autopsy','primary');b.type='button';
   b.addEventListener('click',()=>execute(()=>loadState(d.aggregate_id)));card.append(b);root.append(card);
  }
 }catch(e){root.replaceChildren(el('p',e.message,'muted'));}
}
function overview(root,data){
 const c=box('Batasan dan cakupan');append(c,el('p','Sampel: '+data.sample_size),el('p','Periode: '+date(data.period?.from)+' — '+date(data.period?.to)),
  el('p',data.notice||'Statistik deskriptif saja'),el('p',data.limitations,'muted'));root.append(c);
}
async function loadPatterns(){
 const root=$('pattern-results');root.replaceChildren();
 try{const data=await api(base+'/insights/patterns');overview(root,data);
  for(const cohort of data.cohorts){
   const c=box(cohort.label);
   append(c,append(el('div',undefined,'kv'),badge('Sampel '+cohort.sample_size),badge('Hasil diketahui '+cohort.known_outcomes),badge(confidenceLabel(cohort.confidence_label))),
    el('p',cohort.description),el('p','Periode: '+date(cohort.period.from)+' — '+date(cohort.period.to),'muted'),
    el('p',cohort.limitations,'muted'));root.append(c);
  }
 }catch(e){root.append(el('p',e.message,'muted'));}
}
async function loadWeekly(){
 const root=$('weekly-results');root.replaceChildren();
 try{const data=await api(base+'/insights/weekly');
  const c=box('Minggu UTC');append(c,append(el('div',undefined,'kv'),badge('Sampel '+data.sample_size),badge('Diketahui '+data.known_outcomes),badge(confidenceLabel(data.confidence_label))),
   el('p','Periode: '+date(data.period.from)+' — '+date(data.period.to)),
   el('p','Alokasi '+data.outcomes.allocated+' · Tidak alokasi '+data.outcomes.not_allocated+' · Unknown '+data.outcomes.unknown+' · Menunggu '+data.outcomes.pending),
   el('p',data.notice),el('p',data.limitations,'muted'));root.append(c);
  const pending=box('Perlu ditinjau ulang');for(const d of data.pending_review)pending.append(el('p',d.campaign_id+' · '+d.reason));root.append(pending);
  const lessons=box('Hipotesis dan pelajaran');for(const l of data.lessons)lessons.append(el('p',l.hypothesis));root.append(lessons);
 }catch(e){root.append(el('p',e.message,'muted'));}
}
async function loadEvidence(slug){
 const root=$('evidence-result');root.replaceChildren();
 try{
  const d=await api(base+'/evidence-card/'+encodeURIComponent(slug));
  const c=box(d.campaign_slug);append(c,el('p',d.claim),append(el('div',undefined,'kv'),badge(d.status),badge('Sampel sumber '+d.sample_count),badge('Konflik '+d.conflicts.length)),
   el('p','Terakhir diperiksa: '+date(d.last_checked_at)),el('p',d.limitations,'muted'));root.append(c);
  const primary=box('Sumber primer');for(const s of d.primary_sources)primary.append(append(el('p'),external(s.url,s.url)));root.append(primary);
  const confirmations=box('Konfirmasi terdaftar');for(const s of d.confirmations)confirmations.append(append(el('p'),external(s.url,s.url)));root.append(confirmations);
  const conflicts=box('Konflik belum selesai');for(const s of d.conflicts)conflicts.append(el('p',s.field+' · '+s.severity));root.append(conflicts);
  const warning=box('Peringatan dan berbagi');warning.append(el('p',d.disclaimer));
  const share=el('button','Bagikan kartu sumber publik','primary');share.type='button';
  share.addEventListener('click',()=>execute(async()=>{
   const content=[d.claim,'Status: '+d.status,'Sampel sumber: '+d.sample_count,
    'Periode: '+(d.period?.from||'—')+' — '+(d.period?.to||'—'),
    'Primer: '+d.primary_sources.map(x=>x.url).join(', '),
    'Konfirmasi: '+d.confirmations.map(x=>x.url).join(', '),
    'Konflik: '+d.conflicts.map(x=>x.field).join(', '),
    'Terakhir diperiksa: '+d.last_checked_at,d.limitations,d.disclaimer].join('\n');
   if(navigator.share)await navigator.share({title:'Evidence Chain '+d.campaign_slug,text:content});
   else if(navigator.clipboard){await navigator.clipboard.writeText(content);message('Kartu publik disalin.');}
  }));warning.append(share);root.append(warning);
 }catch(e){root.append(el('p',e.message,'muted'));}
}
const tabs=['decisions','autopsy','insights','weekly','evidence'];
function selectTab(tab){
 if(!tabs.includes(tab))tab='decisions';
 for(const t of tabs)$(t).hidden=t!==tab;
 for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===tab);
 history.replaceState(null,'',location.pathname+'?tab='+encodeURIComponent(tab));
 if(tab==='decisions')loadDecisions();
 if(tab==='insights')loadPatterns();
 if(tab==='weekly')loadWeekly();
}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>selectTab(b.dataset.tab);
function submit(form,handler){
 form.addEventListener('submit',event=>{event.preventDefault();execute(async()=>{
  const button=form.querySelector('button[type=submit]');button.disabled=true;
  try{await handler(form);}finally{button.disabled=false;}
 });});
}
submit($('decision-form'),async form=>{
 const body={campaign_id:formValue(form,'campaign_id'),reason:formValue(form,'reason'),
  primary_evidence_url:formValue(form,'primary_evidence_url'),decision_source:formValue(form,'decision_source'),
  time_budget_minutes:num(form,'time_budget_minutes'),cost_ceiling_usd:num(form,'cost_ceiling_usd'),
  realistic_expectations:formValue(form,'realistic_expectations'),knowledge_cutoff_at:new Date().toISOString(),expected_version:0};
 const r=await api(base+'/decisions','POST',body);form.reset();message('Keputusan disimpan. Cutoff pengetahuan tercatat.');await loadState(r.aggregate_id);
});
submit($('evidence-form'),async form=>{
 await send('evidence',{kind:formValue(form,'kind'),value:formValue(form,'value')});form.reset();
});
submit($('activity-form'),async form=>{
 await send('activity',{phase:formValue(form,'phase'),quest_count:num(form,'quest_count'),chain_count:num(form,'chain_count'),
  gas_cost_usd:num(form,'gas_cost_usd'),bridge_cost_usd:num(form,'bridge_cost_usd'),research_minutes:num(form,'research_minutes')});form.reset();
});
submit($('hypothesis-form'),async form=>await send('hypothesis',{hypothesis:formValue(form,'hypothesis')}));
submit($('outcome-form'),async form=>await send('outcome',{outcome:formValue(form,'outcome'),revision_reason:formValue(form,'revision_reason')}));
$('save-consent').onclick=()=>execute(()=>send('consent',{enabled:$('analysis-consent').checked}));
$('finalize').onclick=()=>execute(async()=>{if(!confirm('Finalisasi autopsy ini? Riwayat tidak dapat diubah langsung.'))return;await send('finalize',{note:''});});
$('refresh-state').onclick=()=>execute(()=>current&&loadState(current.aggregate_id));
$('reload-decisions').onclick=loadDecisions;
$('reload-insights').onclick=loadPatterns;
$('reload-weekly').onclick=loadWeekly;
submit($('evidence-card-form'),async form=>loadEvidence(formValue(form,'slug')));
selectTab(new URL(location.href).searchParams.get('tab')||'decisions');
