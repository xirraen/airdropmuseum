const nav=[['Overview','overview'],['Campaigns','campaigns'],['Discovery','discovery'],['Conflicts','conflicts'],['API Keys','keys'],['Webhooks','webhooks'],['Feature Flags','flags'],['System Settings','settings'],['Audit Log','audit'],['Health','health']];
const $=id=>document.getElementById(id),el=(tag,value)=>{const node=document.createElement(tag);node.textContent=value==null?'—':String(value);return node;};
let csrf='',role='',selected=new Set(),active='overview';
const permissions={readonly:['overview','audit','health'],moderator:['overview','campaigns','discovery','conflicts','audit','health'],admin:['overview','campaigns','discovery','conflicts','keys','webhooks','flags','settings','audit','health'],super_admin:nav.map(n=>n[1])};
async function api(path,opts={}){
 const r=await fetch('/api/admin/'+path,{credentials:'same-origin',...opts,headers:{'X-CSRF-Token':csrf,...(opts.body?{'Content-Type':'application/json'}:{}),...opts.headers}});
 const out=await r.json();if(!r.ok)throw Error(out.error||'REQUEST_FAILED');return out;
}
function notify(msg){$('feedback').textContent=msg;}
function btn(text,cb,kind=''){const b=el('button',text);if(kind)b.className=kind;b.addEventListener('click',cb);return b;}
function table(rows,cols){
 const wrap=el('div','');wrap.className='table-wrap';const t=document.createElement('table'),head=document.createElement('tr');
 cols.forEach(([label])=>head.append(el('th',label)));t.append(head);
 for(const row of rows.slice(0,100)){const tr=document.createElement('tr');cols.forEach(([,key])=>tr.append(el('td',typeof key==='function'?key(row):row[key])));t.append(tr);}wrap.append(t);return wrap;
}
function cards(entries){const g=el('div','');g.className='grid';for(const [name,v] of entries){const c=el('div','');c.className='card';c.append(el('small',name),el('strong',v));g.append(c);}return g;}
async function confirmAction(description,fn){
 $('confirm-description').textContent=description;$('confirm-text').value='';const dialog=$('confirm');dialog.showModal();
 return new Promise(resolve=>{dialog.addEventListener('close',async function handler(){dialog.removeEventListener('close',handler);
  if(dialog.returnValue!=='confirm'||$('confirm-text').value!=='KONFIRMASI'){resolve(false);return;}
  try{await fn();resolve(true);}catch(e){notify(e.message);resolve(false);}
 },{once:true});});
}
$('confirm-submit').addEventListener('click',e=>{if($('confirm-text').value!=='KONFIRMASI'){e.preventDefault();notify('Ketik KONFIRMASI terlebih dahulu.');}});
async function show(tab){
 active=tab;selected.clear();$('title').textContent=nav.find(n=>n[1]===tab)?.[0]||tab;$('description').textContent='Konsol manajemen yang dapat diaudit.';$('panel').replaceChildren();
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));notify('');
 try{
  if(tab==='overview'){const d=await api('overview');$('mode').textContent=d.mode;$('mode').className='badge '+d.mode;$('panel').append(cards([['Campaign',d.campaigns],['Discovery pending',d.discovery_pending],['Konflik terbuka',d.conflicts_open],['Webhook pending',d.webhook_pending]]));}
  if(tab==='health'){const d=await api('health');$('mode').textContent=d.status;$('mode').className='badge '+d.status;$('panel').append(cards([['Status',d.status],['Latensi D1',d.d1_latency_ms+' ms'],...Object.entries(d.checks)]));}
  if(tab==='campaigns'){const d=await api('campaigns');$('panel').append(table(d.campaigns,[['ID','id'],['Judul','title'],['Status','status'],['Review','review_status'],['Sumber','source_url']]));
   for(const row of d.campaigns){const b=btn('Pilih '+row.id,()=>{selected.has(row.id)?selected.delete(row.id):selected.add(row.id);b.classList.toggle('primary',selected.has(row.id));});$('panel').append(b);}
   if(role==='admin'||role==='super_admin'){const bar=el('div','');bar.className='toolbar';const type=document.createElement('select');['archive','expire','republish','update_status','assign_reviewer'].forEach(x=>type.append(el('option',x)));const value=el('input','');value.placeholder='Status / reviewer';const go=btn('Preview bulk',async()=>bulk('campaigns',type.value,value.value),'primary');bar.append(type,value,go);$('panel').prepend(bar);}
  }
  if(tab==='discovery'){const d=await api('discovery/queue?status=pending_review');$('panel').append(table(d.items,[['ID','id'],['Judul','title'],['Sumber','source'],['Klasifikasi','classification'],['Confidence','classification_confidence']]));
   for(const row of d.items){const b=btn('Pilih '+row.id,()=>{selected.has(row.id)?selected.delete(row.id):selected.add(row.id);b.classList.toggle('primary',selected.has(row.id));});$('panel').append(b);}
   if(role==='moderator')for(const row of d.items){$('panel').append(btn('Tinjau '+row.id,()=>moderate(row)));}
   if(role==='admin'||role==='super_admin'){const bar=el('div','');bar.className='toolbar';const type=document.createElement('select');['approve','reject','convert','duplicate'].forEach(x=>type.append(el('option',x)));const reason=el('input','');reason.placeholder='Alasan penolakan / duplikat';bar.append(type,reason,btn('Preview moderasi',()=>bulk('discovery',type.value,reason.value),'primary'));$('panel').prepend(bar);}
  }
  if(tab==='conflicts'){const d=await api('conflicts?status=open');$('panel').append(table(d.conflicts,[['ID','id'],['Campaign','campaign_id'],['Field','field'],['Severity','severity'],['Status','status']]));
   if(role!=='readonly')for(const row of d.conflicts){$('panel').append(btn('Selesaikan '+row.id,()=>resolveConflict(row)));}
  }
  if(tab==='keys'){const d=await api('api-keys');$('panel').append(table(d.keys,[['ID','id'],['Nama','name'],['Tier','tier'],['Aktif','enabled'],['Penggunaan/24h','usage_24h']]));
   if(role==='admin'||role==='super_admin'){const form=el('div','');form.className='form';const name=el('input','');name.placeholder='Nama partner';const tier=document.createElement('select');['free','partner','internal'].forEach(x=>tier.append(el('option',x)));form.append(name,tier,btn('Buat API Key',async()=>{try{const v=await api('api-keys',{method:'POST',body:JSON.stringify({name:name.value,tier:tier.value})});notify('API KEY (hanya sekali): '+v.api_key);}catch(e){notify(e.message);}},'primary'));$('panel').prepend(form);}
  }
  if(tab==='webhooks'){const d=await api('webhooks');$('panel').append(table(d.webhooks,[['ID','id'],['URL','url'],['Aktif','enabled'],['Success rate',r=>Math.round(r.success_rate*100)+'%'],['Failure','failure_count'],['Retry','retry_depth']]));
   if(role==='admin'||role==='super_admin')for(const row of d.webhooks){$('panel').append(btn('Test '+row.id,()=>confirmAction('Kirim dummy event ke partner '+row.id,async()=>{await api('webhooks/'+row.id+'/test',{method:'POST',body:'{}'});notify('Test queued.');})));}}
  if(tab==='flags'){const d=await api('feature-flags');$('panel').append(table(d.flags,[['Flag','key'],['Aktif','enabled'],['Rollout','rollout_percentage'],['Diperbarui','updated_at']]));
   if(role==='admin'||role==='super_admin')for(const row of d.flags.filter(f=>f.key!=='maintenance_mode')){$('panel').append(btn((row.enabled?'Nonaktifkan ':'Aktifkan ')+row.key,()=>confirmAction('Ubah feature flag '+row.key,async()=>{await api('feature-flags/'+row.key,{method:'PUT',body:JSON.stringify({enabled:!row.enabled})});await show('flags');})));}
  }
  if(tab==='settings'){const d=await api('system-settings');$('panel').append(table(d.settings,[['Pengaturan','key'],['Nilai',r=>JSON.stringify(r.value)],['Diperbarui','updated_at']]));
   if(role==='super_admin')for(const mode of ['normal','read_only','maintenance'])$('panel').append(btn('Mode '+mode,()=>confirmAction('Ganti mode platform ke '+mode,async()=>{await api('maintenance-mode',{method:'POST',body:JSON.stringify({mode})});await show('settings');})));
  }
  if(tab==='audit'){const d=await api('audit');$('panel').append(table(d.entries,[['Waktu','created_at'],['Admin','admin_scope'],['Aksi','action'],['Target','target_type'],['ID','target_id']]));}
 }catch(e){notify(e.message);}
}
async function bulk(type,action,value){
 if(!selected.size){notify('Pilih minimal satu item.');return;}
 const query=new URLSearchParams({ids:[...selected].join(','),action,...(type==='discovery'?{reason:value}:{status:value,reviewer:value})});
 try{const preview=await api(type+'/bulk-preview?'+query);await confirmAction('Aksi '+action+' pada '+preview.count+' item. Preview berlaku lima menit.',async()=>{
  const r=await api(type+'/bulk-action',{method:'POST',body:JSON.stringify({preview_id:preview.preview_id,confirm_phrase:'KONFIRMASI'})});
  notify('Berhasil: '+r.succeeded+', gagal: '+r.failed);});}catch(e){notify(e.message);}
}
async function moderate(row){
 const action=prompt('Aksi: approve / reject / convert / duplicate');if(!['approve','reject','convert','duplicate'].includes(action))return;
 const reason=action==='reject'||action==='duplicate'?prompt('Alasan (wajib)'):'';
 if((action==='reject'||action==='duplicate')&&!reason){notify('Alasan diperlukan.');return;}
 await confirmAction('Review '+action+' untuk '+row.id,async()=>{
  await api('discovery/items/'+row.id+'/'+action,{method:'POST',body:JSON.stringify({rejection_reason:reason,reason,project_name:row.title})});
  await show('discovery');
 });
}
async function resolveConflict(row){
 const type=prompt('Pilih nilai sumber: a / b, atau ignore');if(!['a','b','ignore'].includes(type))return;
 const reason=prompt('Catatan keputusan (wajib)');if(!reason)return;
 await confirmAction('Tinjau keputusan konflik '+row.id+'. Data campaign hanya berubah setelah konfirmasi.',async()=>{
  await api('conflicts/'+row.id+'/'+(type==='ignore'?'ignore':'resolve'),{method:'POST',body:JSON.stringify({selected_value:type,confirm:'RESOLVE',resolution_note:reason})});await show('conflicts');
 });
}
async function init(){try{const d=await api('session');role=d.role;csrf=d.csrf_token;$('role').textContent=role;
 for(const [label,tab] of nav){if(!permissions[role]?.includes(tab))continue;const b=btn(label,()=>show(tab));b.dataset.tab=tab;$('tabs').append(b);}
 await show('overview');}catch(e){$('panel').replaceChildren(el('p','Akses admin memerlukan session login Airdrop Museum dan role yang terdaftar.'));notify(e.message);}}
init();
