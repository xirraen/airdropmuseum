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
function table(rows,cols,selectable=false){
 const wrap=el('div','');wrap.className='table-wrap';const t=document.createElement('table'),head=document.createElement('tr');
 if(selectable)head.append(el('th','Pilih'));
 cols.forEach(([label])=>head.append(el('th',label)));t.append(head);
 for(const row of rows.slice(0,100)){const tr=document.createElement('tr');if(selectable){const cell=document.createElement('td'),box=document.createElement('input');box.type='checkbox';box.className='row-check';box.setAttribute('aria-label','Pilih '+row.id);box.addEventListener('change',()=>{box.checked?selected.add(row.id):selected.delete(row.id);});cell.append(box);tr.append(cell);}cols.forEach(([,key])=>tr.append(el('td',typeof key==='function'?key(row):row[key])));t.append(tr);}wrap.append(t);return wrap;
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
  if(tab==='campaigns'){const d=await api('campaigns');$('panel').append(table(d.campaigns,[['ID','id'],['Judul','title'],['Status','status'],['Review','review_status'],['Sumber','source_url']],role==='admin'||role==='super_admin'));
   for(const row of d.campaigns)if(role!=='readonly')$('panel').append(btn('Edit '+row.id,()=>editCampaign(row)));
   if(role==='admin'||role==='super_admin'){const bar=el('div','');bar.className='toolbar';const type=document.createElement('select');['archive','expire','republish','update_status','assign_reviewer'].forEach(x=>type.append(el('option',x)));const value=el('input','');value.placeholder='Status / reviewer';const go=btn('Preview bulk',async()=>bulk('campaigns',type.value,value.value),'primary');bar.append(type,value,go);$('panel').prepend(bar);}
  }
  if(tab==='discovery'){const d=await api('discovery/queue?status=pending_review');$('panel').append(table(d.items,[['ID','id'],['Judul','title'],['Sumber','source'],['Klasifikasi','classification'],['Confidence','classification_confidence']],role==='admin'||role==='super_admin'));
   if(role==='moderator')for(const row of d.items){$('panel').append(btn('Tinjau '+row.id,()=>moderate(row)));}
   if(role==='admin'||role==='super_admin'){const bar=el('div','');bar.className='toolbar';const type=document.createElement('select');['approve','reject','convert','duplicate'].forEach(x=>type.append(el('option',x)));const reason=el('input','');reason.placeholder='Alasan penolakan / duplikat';bar.append(type,reason,btn('Preview moderasi',()=>bulk('discovery',type.value,reason.value),'primary'));$('panel').prepend(bar);}
  }
  if(tab==='conflicts'){const d=await api('conflicts?status=open');$('panel').append(table(d.conflicts,[['ID','id'],['Campaign','campaign_id'],['Field','field'],['Severity','severity'],['Status','status']]));
   if(role!=='readonly')for(const row of d.conflicts){$('panel').append(btn('Selesaikan '+row.id,()=>resolveConflict(row)));}
  }
  if(tab==='keys'){const d=await api('api-keys');$('panel').append(table(d.keys,[['ID','id'],['Nama','name'],['Tier','tier'],['Aktif','enabled'],['Penggunaan/24h','usage_24h']]));
   if(role==='admin'||role==='super_admin'){for(const row of d.keys){$('panel').append(btn('Edit '+row.name,()=>editKey(row)));if(!row.revoked_at)$('panel').append(btn('Cabut '+row.name,()=>confirmAction('Cabut API key secara permanen tanpa menghapus riwayat '+row.id,async()=>{await api('api-keys/'+row.id,{method:'DELETE'});await show('keys');}),'danger'));}const form=el('div','');form.className='form';const name=el('input','');name.placeholder='Nama partner';const tier=document.createElement('select');['free','partner','internal'].forEach(x=>tier.append(el('option',x)));form.append(name,tier,btn('Buat API Key',async()=>{try{const v=await api('api-keys',{method:'POST',body:JSON.stringify({name:name.value,tier:tier.value})});notify('API KEY (hanya sekali): '+v.api_key);}catch(e){notify(e.message);}},'primary'));$('panel').prepend(form);}
  }
  if(tab==='webhooks'){const d=await api('webhooks');$('panel').append(table(d.webhooks,[['ID','id'],['URL','url'],['Aktif','enabled'],['Success rate',r=>Math.round(r.success_rate*100)+'%'],['Failure','failure_count'],['Retry','retry_depth']]));
   if(role==='admin'||role==='super_admin'){for(const row of d.webhooks){if(row.revoked_at)continue;
    $('panel').append(btn(row.enabled?'Nonaktifkan '+row.id:'Aktifkan '+row.id,()=>confirmAction('Ubah status webhook '+row.id,async()=>{await api('webhooks/'+row.id,{method:'PUT',body:JSON.stringify({enabled:!row.enabled})});await show('webhooks');})));
    $('panel').append(btn('Test '+row.id,()=>confirmAction('Kirim dummy event ke partner '+row.id,async()=>{await api('webhooks/'+row.id+'/test',{method:'POST',body:'{}'});notify('Pengujian masuk antrean.');})));
    $('panel').append(btn('Cabut '+row.id,()=>confirmAction('Cabut webhook '+row.id+' dengan soft-delete.',async()=>{await api('webhooks/'+row.id,{method:'DELETE'});await show('webhooks');}),'danger'));
   }
   const form=el('div','');form.className='form';const key=el('input','');key.placeholder='ID partner API key';const target=el('input','');target.placeholder='HTTPS URL webhook';const events=el('input','');events.value='campaign.updated';events.placeholder='Event dipisahkan koma';
   form.append(key,target,events,btn('Daftarkan Webhook',async()=>{try{const r=await api('webhooks',{method:'POST',body:JSON.stringify({api_key_id:key.value,url:target.value,events:events.value.split(',').map(s=>s.trim())})});notify('Webhook terdaftar '+r.id+'. Secret tidak ditampilkan di admin console.');}catch(e){notify(e.message);}},'primary'));$('panel').prepend(form);
   }}
  if(tab==='flags'){const d=await api('feature-flags');$('panel').append(table(d.flags,[['Flag','key'],['Aktif','enabled'],['Rollout','rollout_percentage'],['Diperbarui','updated_at']]));
   if(role==='admin'||role==='super_admin')for(const row of d.flags.filter(f=>f.key!=='maintenance_mode')){$('panel').append(btn((row.enabled?'Nonaktifkan ':'Aktifkan ')+row.key,()=>confirmAction('Ubah feature flag '+row.key,async()=>{await api('feature-flags/'+row.key,{method:'PUT',body:JSON.stringify({enabled:!row.enabled})});await show('flags');})));}
  }
  if(tab==='settings'){const d=await api('system-settings');$('panel').append(table(d.settings,[['Pengaturan','key'],['Nilai',r=>JSON.stringify(r.value)],['Diperbarui','updated_at']]));
   if(role==='super_admin')for(const item of d.settings.filter(x=>x.key!=='maintenance_mode'))$('panel').append(btn('Ubah '+item.key,async()=>{const v=prompt('Nilai baru untuk '+item.key,String(item.value));if(v===null)return;await confirmAction('Ubah pengaturan '+item.key,async()=>{await api('system-settings/'+item.key,{method:'PUT',body:JSON.stringify({value:Number(v)})});await show('settings');});}));
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
async function editCampaign(row){
 const field=prompt('Field campaign: title / description / category / reviewer'+((role==='admin'||role==='super_admin')?' / status / visibility / chain':''));
 if(!field)return;
 const allowed=(role==='moderator'?['title','description','category','reviewer']:['title','description','category','reviewer','status','visibility','chain']);
 if(!allowed.includes(field)){notify('Field tidak diizinkan.');return;}
 const value=prompt('Nilai baru '+field,field==='title'?row.title:row[field]||'');
 if(value===null)return;
 await confirmAction('Perbarui '+field+' pada '+row.id,async()=>{await api('campaigns/'+row.id,{method:'PUT',body:JSON.stringify({[field]:value})});await show('campaigns');});
}
async function editKey(row){
 const name=prompt('Nama API key',row.name);if(name===null)return;
 const limit=prompt('Rate limit per menit',String(row.rate_limit_per_minute));
 if(limit===null)return;
 await confirmAction('Perbarui metadata key '+row.id,async()=>{await api('api-keys/'+row.id,{method:'PUT',body:JSON.stringify({name,rate_limit_per_minute:Number(limit)})});await show('keys');});
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
