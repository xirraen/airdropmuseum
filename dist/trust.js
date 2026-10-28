const $=id=>document.getElementById(id),message=$('message');
const current=new URL(location.href).searchParams.get('campaign_id')||'';
let campaign=current;
const create=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e;};
const append=(parent,...children)=>{parent.append(...children);return parent;};
const button=(label,fn)=>{const b=create('button',label);b.type='button';b.onclick=fn;return b;};
const heading=(title)=>create('h2',title);
const card=()=>create('article',undefined,'card');
const value=v=>typeof v==='string'?v:JSON.stringify(v??null);
const dt=s=>s?new Date(s).toLocaleString('id-ID'):'Belum diperiksa';
const status=s=>create('span',s||'needs_review','status '+(s||''));
function external(url,title){const a=create('a',title);try{const u=new URL(url);if(u.protocol!=='https:')throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{a.removeAttribute('href');}return a;}
async function api(path,body,method=body===undefined?'GET':'POST'){
 const headers={},init=window.Telegram?.WebApp?.initData;if(init)headers['X-Telegram-Init-Data']=init;
 const options={method,headers,credentials:'same-origin'};
 if(body!==undefined){headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
 const response=await fetch('/api/trust'+path,options);
 const data=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));if(!response.ok)throw Error(data.error||'SERVICE_UNAVAILABLE');return data;
}
function clear(){for(const id of ['verification-result','source-list','conflict-list','run-history','register-source'])$(id).replaceChildren();}
function details(c){
 const entry=card(),line=create('div',undefined,'metric');for(const [k,v] of [['Confidence',c.confidence_label],['Konflik terbuka',c.result?.open_conflicts??0],['Sumber bermasalah',c.result?.failed_sources??0]])append(line,append(create('div'),create('span',k),create('strong',v)));
 append(entry,heading('Ringkasan verifikasi'),line,create('p','Penilaian platform; hasil harus diperiksa manual.','muted'));
 if(c.latest)entry.append(create('p','Verifikasi terakhir: '+dt(c.latest.finished_at)+' · '+c.latest.status));
 const actions=append(create('div',undefined,'actions'),button('Jalankan Verifikasi',async()=>{try{message.textContent='';await api('/campaigns/'+encodeURIComponent(campaign)+'/verify',{});await load();}catch(e){message.textContent=e.message;}}));
 entry.append(actions);$('verification-result').append(entry);
 const fields=c.result?.fields||{},names=Object.keys(fields);
 if(names.length){const f=card();append(f,heading('Field terobservasi'));for(const key of names)append(f,create('h3',key),create('div',value(fields[key]),'value'));$('verification-result').append(f);}
}
function listSources(rows){
 const root=$('source-list');root.append(heading('Daftar Sumber'));const grid=create('div',undefined,'stack');
 for(const s of rows){const item=card();append(item,status(s.tier),create('h3',s.host),create('p','Trust score internal: '+s.trust_score+' / 100'),create('p','Diperiksa: '+dt(s.last_fetched_at)),external(s.source_url,'Buka sumber resmi'));grid.append(item);}
 if(!rows.length)grid.append(create('p','Belum ada sumber terdaftar.','empty'));root.append(grid);
}
function conflictCard(c,admin=false){
 const item=card(),pair=create('div',undefined,'pair');
 append(pair,append(create('div'),create('h3','Sumber A'),create('div',value(c.value_a),'value'),external(c.source_a_url,'Buka Sumber A')),
 append(create('div'),create('h3','Sumber B'),create('div',value(c.value_b),'value'),external(c.source_b_url,'Buka Sumber B')));
 append(item,status(c.severity),status(c.status),create('h2',c.field),create('p','Campaign: '+(c.campaign_id||campaign)),pair);
 if(admin&&c.status==='open'){
  const handle=async action=>{const reason=prompt('Alasan keputusan (wajib):');if(!reason?.trim())return;
   try{await api('/conflicts/'+c.id+'/'+action,{reason:reason.trim()});await (campaign?load():loadAdmin());}catch(e){message.textContent=e.message;}};
  append(item,append(create('div',undefined,'actions'),button('Tandai Selesai',()=>handle('resolve')),button('Abaikan',()=>handle('ignore'))));
 }
 return item;
}
function listConflicts(rows){const root=$('conflict-list');root.append(heading('Konflik sumber'));if(!rows.length)root.append(create('p','Tidak ada konflik tercatat.','empty'));for(const c of rows)root.append(conflictCard(c,true));}
function listRuns(rows){const root=$('run-history');root.append(heading('Riwayat verification run'));const e=card();
 if(!rows.length)e.append(create('p','Belum ada run.'));for(const r of rows){append(e,create('p',dt(r.started_at)+' · '+r.status+' · '+r.confidence_label,'muted'));}
 root.append(e);
}
function register(){
 const box=$('register-source');box.append(heading('Daftarkan sumber (Admin)'));
 const form=create('form'),label=(title,input)=>append(create('label',title),input),url=create('input'),official=create('input'),linked=create('input');
 url.type='url';url.required=true;url.placeholder='https://example.org/news';official.type='checkbox';linked.type='checkbox';
 const submit=create('button','Tambahkan Sumber');submit.type='submit';
 append(form,label('URL HTTPS',url),label('Domain resmi terverifikasi',official),label('Ditautkan dari situs resmi',linked),submit);
 form.onsubmit=async e=>{e.preventDefault();try{await api('/sources/'+crypto.randomUUID(),{campaign_id:campaign,source_url:url.value,official_domain_verified:official.checked,linked_from_official:linked.checked},'PUT');message.textContent='Sumber terdaftar. Jalankan verifikasi untuk memeriksa metadata.';await load();}catch(err){message.textContent=err.message;}};
 box.append(form);
}
async function load(){
 clear();if(!campaign)return;
 try{
  const id=encodeURIComponent(campaign);
  const [v,s,c]=await Promise.all([api('/campaigns/'+id+'/verification'),api('/sources?campaign_id='+id),api('/campaigns/'+id+'/conflicts')]);
  details(v);listSources(s.sources);listConflicts(c.conflicts);listRuns(v.runs);register();
  history.replaceState(null,'','/trust.html?campaign_id='+id);
 }catch(e){message.textContent='Data campaign tidak tersedia: '+e.message;}
}
async function loadAdmin(){
 $('admin-conflicts').replaceChildren();message.textContent='';
 try{const rows=(await api('/conflicts?status='+$('conflict-status').value)).conflicts;
  if(!rows.length)$('admin-conflicts').append(create('p','Tidak ada konflik pada status ini.','empty'));
  for(const c of rows)$('admin-conflicts').append(conflictCard(c,true));
 }catch(e){message.textContent='Akses moderator diperlukan: '+e.message;}
}
function switchTab(showAdmin){$('tab-campaign').classList.toggle('active',!showAdmin);$('tab-conflicts').classList.toggle('active',showAdmin);$('campaign-view').hidden=showAdmin;$('admin-view').hidden=!showAdmin;if(showAdmin)loadAdmin();}
$('campaign-id').value=campaign;$('campaign-search').onsubmit=e=>{e.preventDefault();campaign=$('campaign-id').value.trim();message.textContent='';load();};
$('tab-campaign').onclick=()=>switchTab(false);$('tab-conflicts').onclick=()=>switchTab(true);$('conflict-status').onchange=loadAdmin;
if(campaign)load();
