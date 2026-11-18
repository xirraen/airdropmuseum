// Public evidence activity and bounded source fingerprint monitor.
// The UI displays source evidence, never eligibility or claim confirmations.
const TYPES=new Set(['official_docs','official_blog','contract','explorer']);
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const iso=()=>new Date().toISOString();
export async function sourceActivity(db){
 const result=await db.prepare(
  "SELECT s.id,s.campaign_id,c.name AS campaign_name,c.status AS campaign_status,s.source_url,s.source_type,s.captured_at,s.event_type "+
  "FROM campaign_sources s JOIN campaigns c ON c.id=s.campaign_id "+
  "WHERE s.verified_by='system' AND s.source_type IN ('official_docs','official_blog','contract','explorer') "+
  "AND c.status!='archived' ORDER BY s.captured_at DESC,s.id DESC LIMIT 100"
 ).all();
 const events=[];
 for(const row of result.results||[]){
  if(!TYPES.has(row.source_type)||typeof row.campaign_id!=='string')continue;
  let url;
  try{url=new URL(row.source_url);if(url.protocol!=='https:')continue;}catch{continue;}
  const type=row.event_type==='source_changed'?'changed':
   row.event_type==='source_unavailable'?'unavailable':
   row.event_type==='source_restored'?'restored':
   String(row.event_type||'').startsWith('status:')?'status':'record';
  const description=type==='changed'?'Isi sumber berubah; status atau kelayakan belum diverifikasi ulang.':
   type==='unavailable'?'Sumber gagal diakses berulang kali; periksa secara manual.':
   type==='restored'?'Sumber kembali dapat dibaca setelah gangguan; aturan dan kelayakan tetap perlu diperiksa.':
   type==='status'?'Status tercatat berubah; periksa sumber sebelum mengambil keputusan.':
   'Pemeriksaan sumber tercatat; bukan bukti kelayakan atau reward.';
  events.push({
   id:String(row.id||'').slice(0,100),campaignId:'campaign-'+row.campaign_id,
   name:String(row.campaign_name||'Kampanye').slice(0,100),
   timestamp:String(row.captured_at||'').slice(0,35),sourceUrl:url.href,
   sourceType:row.source_type,type,description
  });
 }
 return {events,checkedAt:iso()};
}
function cleanText(body){
 return String(body).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
// Every request and redirect must stay inside the explicitly configured official domains.
// This is not an open URL fetcher. In particular, never permit custom ports, credentials
// or literal IP/localhost targets, even if an operator accidentally added one to the list.
function allowedSourceUrl(value,hosts){
 try{
  const url=new URL(value);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
   !hosts.has(host)||!host.includes('.')||host==='localhost'||
   host.endsWith('.localhost')||host.endsWith('.local')||
   /^\d+(?:\.\d+){3}$/.test(host)||host.includes(':'))return null;
  url.hash='';
  return url.href;
 }catch{return null;}
}
async function fetchSourceText(url,fetcher,hosts){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 const seen=new Set();
 let target=url;
 let response;
 try{
  for(let hop=0;hop<=3;hop++){
   if(seen.has(target))throw Error('SOURCE_REDIRECT_LOOP');
   seen.add(target);
   response=await fetcher(target,{method:'GET',redirect:'manual',signal:controller.signal,
    headers:{Accept:'text/html,text/markdown;q=0.9,text/plain;q=0.8,application/json;q=0.7'}});
   if([301,302,303,307,308].includes(response.status)){
    if(hop===3)throw Error('SOURCE_TOO_MANY_REDIRECTS');
    const location=response.headers.get('location');
    const next=location&&allowedSourceUrl(new URL(location,target).href,hosts);
    if(!next)throw Error('SOURCE_REDIRECT_NOT_ALLOWLISTED');
    try{await response.body?.cancel();}catch{}
    target=next;
    continue;
   }
   break;
  }
  if(!response.ok)throw Error('SOURCE_HTTP_'+response.status);
  const contentType=(response.headers.get('content-type')||'').toLowerCase();
  if(contentType&&!/text\/html|text\/markdown|text\/plain|application\/json|application\/ld\+json/.test(contentType))throw Error('SOURCE_TYPE');
  const length=Number(response.headers.get('content-length')||0);
  if(length>131072)throw Error('SOURCE_TOO_LARGE');
  if(!response.body)throw Error('NO_SOURCE_BODY');
  const reader=response.body.getReader();
  let size=0;const chunks=[];
  try{
   while(true){
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>131072)throw Error('SOURCE_TOO_LARGE');
    chunks.push(value);
   }
  }finally{void reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=cleanText(new TextDecoder().decode(bytes));
  if(text.length<80||/^(?:page not found|access denied|just a moment|verify you are human)/i.test(text))throw Error('SOURCE_UNAVAILABLE');
  return text;
 }finally{clearTimeout(timeout);}
}
function parseMonitorState(value){
 try{
  const state=JSON.parse(value||'null');
  if(state&&typeof state==='object'){
   return {failures:Number.isSafeInteger(state.failures)&&state.failures>0?Math.min(state.failures,100):0,
    outage:state.outage===true};
  }
 }catch{}
 return {failures:0,outage:false};
}
// Called only on the existing UTC cron. Never claims, signs, or scans wallet accounts.
export async function monitorOfficialSources(env,fetcher=fetch){
 if(!env.DB||env.AGGREGATOR_MONITOR_SOURCES!=='1')return {checked:0,changed:0,unavailable:0};
 const hosts=new Set(String(env.AGGREGATOR_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
 if(!hosts.size)return {checked:0,changed:0,unavailable:0};
 const campaigns=(await env.DB.prepare("SELECT id,official_urls,risk_flags FROM campaigns WHERE status!='archived' ORDER BY id LIMIT 500").all()).results||[];
 const urls=[];
 for(const c of campaigns){
  let entries;
  try{entries=JSON.parse(c.official_urls);}catch{continue;}
  if(!Array.isArray(entries))continue;
  for(const value of entries.slice(0,3)){
   try{
    const u=new URL(value);
    const url=allowedSourceUrl(u.href,hosts);
    if(!url)continue;
    urls.push({campaign:c,url});
   }catch{}
  }
 }
 if(!urls.length)return {checked:0,changed:0,unavailable:0};
 const saved=await stmt(env.DB,"SELECT value FROM aggregator_cursor WHERE name='source-monitor-offset'").first();
 const cursor=Number.isSafeInteger(Number(saved?.value))?Math.max(0,Number(saved.value))%urls.length:0;
 const batch=urls.slice(cursor,cursor+6);
 let checked=0,changed=0,unavailable=0;
 for(const {campaign:c,url} of batch){
  const urlHash=await digest(url);
  const stateKey='official-source-state:'+c.id+':'+urlHash;
  const oldState=parseMonitorState((await stmt(env.DB,'SELECT value FROM aggregator_cursor WHERE name=?',stateKey).first())?.value);
  let body;
  try{body=await fetchSourceText(url,fetcher,hosts);}
  catch{
   unavailable++;
   const at=iso(),failures=Math.min(100,oldState.failures+1);
   const report=failures>=2&&!oldState.outage;
   const actions=[
    stmt(env.DB,'INSERT INTO aggregator_cursor(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
     stateKey,JSON.stringify({failures,outage:oldState.outage||report,checked_at:at}))
   ];
   if(report)actions.push(
    stmt(env.DB,'INSERT INTO campaign_sources(id,campaign_id,source_url,source_type,captured_at,note,verified_by,event_type) VALUES(?,?,?,?,?,?,?,?)',
     crypto.randomUUID(),c.id,url,'official_docs',at,
     'Sumber tidak dapat dibaca pada dua pemeriksaan berturut-turut; penilaian status belum berubah.','system','source_unavailable')
   );
   await env.DB.batch(actions);
   continue;
  }
  const fingerprint=await digest(body),key='official-source:'+c.id+':'+urlHash;
  const prior=await stmt(env.DB,'SELECT value FROM aggregator_cursor WHERE name=?',key).first();
  let previous;
  try{previous=JSON.parse(prior?.value||'null');}catch{previous=null;}
  const at=iso();
  const actions=[
   stmt(env.DB,'INSERT INTO aggregator_cursor(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
    stateKey,JSON.stringify({failures:0,outage:false,checked_at:at}))
  ];
  if(oldState.outage)actions.push(
   stmt(env.DB,'INSERT INTO campaign_sources(id,campaign_id,source_url,source_type,captured_at,note,verified_by,event_type) VALUES(?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),c.id,url,'official_docs',at,
    'Sumber kembali dapat dibaca; status kampanye tetap memerlukan verifikasi manual.','system','source_restored')
  );
  if(previous?.hash!==fingerprint){
   const changedSincePrior=!!previous?.hash,event=changedSincePrior?'source_changed':'source_baseline';
   const note=changedSincePrior?'Isi teks sumber resmi berubah. Status dan aturan belum ditinjau ulang; periksa manual.':'Baseline sumber resmi dicatat; bukan bukti eligibility.';
   if(changedSincePrior){
    let risk=[];try{risk=JSON.parse(c.risk_flags||'[]');}catch{}
    if(!Array.isArray(risk))risk=[];
    actions.push(stmt(env.DB,'UPDATE campaigns SET risk_flags=?,updated_at=? WHERE id=?',
     JSON.stringify([...new Set([...risk,'source_changed_review_required'])]),at,c.id));
   }
   actions.push(stmt(env.DB,
    'INSERT INTO campaign_sources(id,campaign_id,source_url,source_type,captured_at,note,verified_by,event_type,content_hash) VALUES(?,?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),c.id,url,'official_docs',at,note,'system',event,fingerprint));
   actions.push(stmt(env.DB,'INSERT INTO aggregator_cursor(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
    key,JSON.stringify({hash:fingerprint,checked_at:at})));
   if(changedSincePrior)changed++;
  }
  await env.DB.batch(actions);
  checked++;
 }
 await stmt(env.DB,"INSERT INTO aggregator_cursor(name,value) VALUES('source-monitor-offset',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",String(cursor+batch.length>=urls.length?0:cursor+batch.length)).run();
 return {checked,changed,unavailable};
}
