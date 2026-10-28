const root=document.getElementById('content'),msg=document.getElementById('message');
const state={tab:'review',sources:[],items:[],filters:{status:'pending_review',classification:'',source:'',date:'',confidence:''}};
const elt=(tag,value,cls)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);if(cls)e.className=cls;return e;};
const add=(parent,...items)=>{parent.append(...items);return parent;};
const btn=(title,fn,cls)=>{const b=elt('button',title,cls);b.type='button';b.onclick=fn;return b;};
const label=(title,element)=>add(elt('label',title),element);
const input=(name,type,value='')=>{const e=elt('input');e.name=name;e.type=type;e.value=value;return e;};
const selector=(name,options,value)=>{const s=elt('select');s.name=name;for(const [v,t] of options){const o=elt('option',t);o.value=v;s.append(o);}s.value=value;return s;};
async function api(path,data,method){
 const options={method:method||(data===undefined?'GET':'POST'),headers:{}};
 const init=window.Telegram?.WebApp?.initData;if(init)options.headers['X-Telegram-Init-Data']=init;
 if(data!==undefined){options.body=JSON.stringify(data);options.headers['Content-Type']='application/json';}
 const response=await fetch('/api/discovery'+path,options),body=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
 if(!response.ok)throw Error(body.error||'SERVICE_UNAVAILABLE');return body;
}
async function change(fn){try{await fn();await refresh();msg.textContent='Perubahan berhasil disimpan.';}catch(e){msg.textContent='Gagal: '+e.message;}}
const dt=v=>v?new Date(v.replace(' ','T')+'Z').toLocaleDateString('id-ID'):'Belum pernah';
function makeSelect(key,options){const s=selector(key,options,state.filters[key]);s.onchange=()=>{state.filters[key]=s.value;change(async()=>{await loadItems();});};return s;}
function reviewFilters(){
 const filters=elt('div',undefined,'filters'),statuses=['pending_review','approved','rejected','converted','duplicate','error','all'],classes=['airdrop','points','testnet','quest','claim','snapshot','unknown'];
 filters.append(label('Status',makeSelect('status',statuses.map(x=>[x,x]))),
 label('Klasifikasi',makeSelect('classification',[['','Semua'],...classes.map(x=>[x,x])])),
 label('Sumber',makeSelect('source',[['','Semua'],...state.sources.map(s=>[s.id,s.name])])));
 const date=input('date','date',state.filters.date);date.onchange=()=>{state.filters.date=date.value;change(async()=>{await loadItems();});};
 filters.append(label('Tanggal',date),label('Confidence minimal',makeSelect('confidence',[['','Semua'],['0.3','30%'],['0.5','50%'],['0.7','70%'],['0.9','90%']])));
 return filters;
}
function article(row){
 const card=elt('article',undefined,'card'),info=elt('div'),actions=elt('div',undefined,'actions');
 add(info,elt('span',row.classification,'tag'),elt('h2',row.title),elt('div',row.source_name+' • '+Math.round(row.classification_confidence*100)+'% • '+dt(row.published_at)+' • '+row.status,'meta'),elt('p',row.summary||'Ringkasan tidak tersedia.'));
 if(row.campaign_id)info.append(elt('p','Draft: '+row.campaign_id+' (belum publik)'));
 if(row.status==='pending_review'){
  actions.append(btn('Setujui',()=>change(async()=>{await api('/items/'+row.id+'/approve',{});}), 'primary'),
   btn('Tolak',()=>{const reason=prompt('Alasan penolakan wajib:');if(reason?.trim())change(async()=>{await api('/items/'+row.id+'/reject',{rejection_reason:reason.trim()});});},'danger'));
 }
 if(row.status==='approved')actions.append(btn('Jadikan Draft Campaign',()=>{
  const name=prompt('Nama proyek (boleh dilengkapi kemudian):','');if(name===null)return;
  const chain=prompt('Chain (boleh dilengkapi kemudian):','');if(chain===null)return;
  change(async()=>{await api('/items/'+row.id+'/convert',{project_name:name,chain,campaign_status:'speculative'});});
 },'primary'));
 actions.append(btn('Detail / Log',async()=>{try{const data=await api('/items/'+row.id);msg.textContent='Review: '+(data.review_log.map(x=>x.action+' / '+x.admin_id).join(', ')||'Belum ada');}catch(e){msg.textContent='Gagal: '+e.message;}}));
 const link=elt('a','Buka Sumber');link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);
 add(card,info,actions);return card;
}
function sourceCard(s){
 const card=elt('article',undefined,'card'),info=elt('div'),actions=elt('div',undefined,'actions');
 add(info,elt('span',!s.enabled?'nonaktif':s.last_error?'error':'aktif','tag'),elt('h2',s.name),
  elt('div',s.source_type+' • '+s.trust_level+' • fetch: '+dt(s.last_fetched_at)+' • '+s.new_item_count+' item baru','meta'),
  elt('p',s.feed_url));
 if(s.last_error)info.append(elt('p','Error: '+s.last_error));
 actions.append(btn('Fetch Sekarang',()=>change(async()=>{await api('/sources/'+s.id+'/fetch',{});}), 'primary'),
  btn(s.enabled?'Nonaktifkan':'Aktifkan',()=>change(async()=>{await api('/sources/'+s.id,{enabled:!s.enabled},'PUT');})),
  btn('Edit',()=>{const name=prompt('Nama:',s.name);if(name===null)return;const url=prompt('Feed HTTPS:',s.feed_url);
   if(url!==null)change(async()=>{await api('/sources/'+s.id,{name,feed_url:url},'PUT');});}),
  btn('Hapus',()=>{if(confirm('Hapus sumber yang belum memiliki item?'))change(async()=>{await api('/sources/'+s.id,undefined,'DELETE');});},'danger'));
 add(card,info,actions);return card;
}
function sourceForm(){
 const form=elt('form'),name=input('name','text'),url=input('url','url'),hint=input('hint','text');
 name.required=url.required=true;url.placeholder='https://domain.org/feed.xml';
 const type=selector('source_type',[['rss','RSS'],['atom','Atom'],['json_feed','JSON Feed']],'rss');
 const trust=selector('trust_level',[['low','Low'],['medium','Medium'],['high','High']],'low');
 const submit=elt('button','Tambah Sumber');submit.type='submit';
 form.append(label('Nama Sumber',name),label('Feed HTTPS',url),label('Jenis',type),label('Trust',trust),label('Project hint',hint),submit);
 form.onsubmit=e=>{e.preventDefault();change(async()=>{await api('/sources',{name:name.value,feed_url:url.value,source_type:type.value,trust_level:trust.value,project_hint:hint.value});form.reset();});};
 return form;
}
async function loadItems(){const query=new URLSearchParams(Object.entries(state.filters).filter(([,v])=>v!==''));state.items=(await api('/review?'+query)).items;}
async function refresh(){
 state.sources=(await api('/sources')).sources;if(state.tab==='review')await loadItems();render();
}
function render(){
 root.replaceChildren();
 if(state.tab==='review'){root.append(reviewFilters());const cards=elt('div',undefined,'cards');
 for(const item of state.items)cards.append(article(item));
 if(!state.items.length)cards.append(elt('div','Tidak ada item pada filter ini.','empty'));root.append(cards);
 }else{root.append(sourceForm());const cards=elt('div',undefined,'cards');
 for(const s of state.sources)cards.append(sourceCard(s));
 if(!state.sources.length)cards.append(elt('div','Belum ada feed. Tambahkan sumber resmi yang diizinkan.','empty'));root.append(cards);}
 document.querySelectorAll('[data-tab]').forEach(e=>e.classList.toggle('selected',e.dataset.tab===state.tab));
}
document.querySelectorAll('[data-tab]').forEach(e=>e.onclick=()=>{state.tab=e.dataset.tab;msg.textContent='';refresh().catch(err=>msg.textContent=err.message);});
refresh().catch(err=>root.replaceChildren(elt('div','Akses admin tidak tersedia: '+err.message,'empty')));
