const nav=[['Overview','overview'],['Campaigns','campaigns'],['Discovery','discovery'],['Conflicts','conflicts'],['API Keys','keys'],['Webhooks','webhooks'],['Feature Flags','flags'],['System Settings','settings'],['Audit Log','audit'],['Health','health']];
const $=id=>document.getElementById(id),el=(tag,value)=>{const node=document.createElement(tag);node.textContent=value==null?'—':String(value);return node;};
let csrf='',role='',selected=new Set(),active='overview',viewController;
const permissions={readonly:['overview','audit','health'],moderator:['overview','campaigns','discovery','conflicts','audit','health'],admin:['overview','campaigns','discovery','conflicts','keys','webhooks','flags','settings','audit','health'],super_admin:nav.map(n=>n[1])};
async function api(path,opts={}){
 const signal=opts.signal||((opts.method||'GET').toUpperCase()==='GET'?viewController?.signal:undefined);
 const r=await fetch('/api/admin/'+path,{credentials:'same-origin',...opts,...(signal?{signal}:{}),headers:{'X-CSRF-Token':csrf,...(opts.body?{'Content-Type':'application/json'}:{}),...opts.headers}});
 const out=await r.json();if(signal?.aborted)throw new DOMException('Navigation superseded','AbortError');if(!r.ok)throw Error(out.error==='SOURCE_CAMPAIGN_EDIT_REQUIRED'?'Ubah data sumber campaign melalui Aggregator. Registry hanya mengatur publikasi dan reviewer.':out.error||'REQUEST_FAILED');return out;
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
 viewController?.abort();viewController=new AbortController();
 active=tab;selected.clear();$('title').textContent=nav.find(n=>n[1]===tab)?.[0]||tab;$('description').textContent='Konsol manajemen yang dapat diaudit.';$('panel').replaceChildren();
 document.querySelectorAll('#tabs button').forEach(b=>{
  const current=b.dataset.tab===tab;b.classList.toggle('active',current);
  if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });notify('');
 try{
  if(tab==='overview'){const d=await api('overview');$('mode').textContent=d.mode;$('mode').className='badge '+d.mode;
   $('panel').append(cards([['Campaign',d.campaigns],['Sumber Discovery',d.discovery_sources],['Discovery pending',d.discovery_pending],['Konflik terbuka',d.conflicts_open],['Webhook pending',d.webhook_pending]]));
   if(Number(d.discovery_sources)===0){const notice=el('section','');notice.className='notice';notice.append(
    el('h3','Discovery belum memiliki sumber aktif'),
    el('p','Tambahkan sumber RSS, Atom, atau JSON Feed resmi melalui Discovery. Sumber baru selalu nonaktif sampai diverifikasi. Tidak ada campaign yang dipublikasikan otomatis.'));
    if(role==='admin'||role==='super_admin')notice.append(btn('Kelola sumber Discovery',()=>show('discovery'),'primary'));
    $('panel').append(notice);
   }
  }
  if(tab==='health'){const d=await api('health');$('mode').textContent=d.status;$('mode').className='badge '+d.status;
   const reason={NO_SOURCES:'Belum ada sumber feed',NO_ACTIVE_SOURCES:'Semua sumber nonaktif',FETCH_ERRORS:'Ada kegagalan pemindaian',SOURCE_STALE:'Pemindaian belum terbaru',SCHEDULER_BLOCKED:'Scheduler discovery tertahan',READY:'Discovery aktif',DATABASE_UNAVAILABLE:'Diagnostik tidak tersedia'};
   const discovery=d.discovery||{};
   $('panel').append(cards([['Status',d.status],['Latensi D1',d.d1_latency_ms+' ms'],
    ['Discovery',reason[discovery.reason]||discovery.reason||'—'],
    ['Sumber terdaftar',discovery.sources_total??'—'],['Sumber aktif',discovery.sources_enabled??'—'],
    ['Sumber terbaru',discovery.sources_recent??'—'],['Sumber bermasalah',discovery.sources_with_errors??'—'],
    ['Menunggu review',discovery.pending_review??'—'],['Terakhir sukses',discovery.last_successful_fetch||'Belum pernah'],
    ['Status cron discovery',discovery.last_run_status||'Belum dicatat'],['Cron discovery terakhir',discovery.last_run_at||'Belum dicatat'],
    ...Object.entries(d.checks)]));
  }
  if(tab==='campaigns'){const d=await api('campaigns');$('panel').append(table(d.campaigns,[['ID','id'],['Judul','title'],['Status','status'],['Review','review_status'],['Sumber','source_url']],role==='admin'||role==='super_admin'));
   for(const row of d.campaigns)if(role!=='readonly')$('panel').append(btn('Edit '+row.id,()=>editCampaign(row)));
   if(role==='admin'||role==='super_admin'){const bar=el('div','');bar.className='toolbar';const type=document.createElement('select');['archive','expire','republish','update_status','assign_reviewer'].forEach(x=>type.append(el('option',x)));const value=el('input','');value.placeholder='Status / reviewer';const go=btn('Preview bulk',async()=>bulk('campaigns',type.value,value.value),'primary');bar.append(type,value,go);$('panel').prepend(bar);}
  }
  if(tab==='discovery'){
   const data=await api('discovery/sources'),sources=data.sources||[];
   const section=el('div','');section.className='section';
   section.append(el('h3','Sumber Discovery ('+sources.length+')'),
    el('p',sources.length?'Hanya sumber RSS, Atom, atau JSON Feed yang diaktifkan operator akan dipindai.':'Belum ada sumber. Pemindaian otomatis belum dapat menemukan item sampai admin menambahkan dan mengaktifkan feed.'));
   section.append(table(sources,[['Nama','name'],['Jenis','source_type'],['URL','feed_url'],['Aktif',r=>r.enabled?'Ya':'Tidak'],['Trust','trust_level'],['Terakhir diambil','last_fetched_at'],['Kesalahan','last_error'],['Item baru','new_item_count']]));
   if(role==='admin'||role==='super_admin'){
    const form=el('div','');form.className='form';
    const name=el('input','');name.placeholder='Nama feed resmi';name.setAttribute('aria-label','Nama sumber');
    const feed=el('input','');feed.type='url';feed.placeholder='https://example.org/rss';feed.setAttribute('aria-label','URL feed HTTPS');
    const kind=document.createElement('select');kind.setAttribute('aria-label','Format feed');
    for(const type of ['rss','atom','json_feed'])kind.append(el('option',type));
    const trust=document.createElement('select');trust.setAttribute('aria-label','Kepercayaan sumber');
    for(const level of ['low','medium','high'])trust.append(el('option',level));
    form.append(name,feed,kind,trust,btn('Tambahkan sumber (nonaktif)',async()=>{
     try{
      await api('discovery/sources',{method:'POST',body:JSON.stringify({name:name.value,feed_url:feed.value,source_type:kind.value,trust_level:trust.value,enabled:false})});
      await show('discovery');notify('Sumber disimpan nonaktif. Aktifkan setelah URL dan izin feed diverifikasi.');
     }catch(e){notify(e.message);}
    },'primary'));section.prepend(form);
    for(const source of sources){
     const bar=el('div','');bar.className='toolbar';
     bar.append(btn((source.enabled?'Nonaktifkan ':'Aktifkan ')+source.name,()=>confirmAction(
      (source.enabled?'Hentikan pemindaian ':'Mulai pemindaian ')+'sumber '+source.name+'. Pastikan URL resmi dan izin pengambilan feed telah ditinjau.',
      async()=>{await api('discovery/sources/'+source.id,{method:'PUT',body:JSON.stringify({enabled:!source.enabled})});await show('discovery');notify('Status sumber diperbarui.');}
     )));
     bar.append(btn('Pratinjau '+source.name,async()=>{
      try{
       const result=await api('discovery/sources/'+source.id+'/preview',{method:'POST',body:'{}'});
       if(active!=='discovery')return;
       $('feed-preview')?.remove();
       const block=el('section','');block.id='feed-preview';block.className='notice';
       block.append(el('h3','Pratinjau: '+source.name),
        el('p','Metadata valid: '+result.total_sampled+(result.truncated?' (10 contoh ditampilkan)':'')),
        el('p',result.warning||'Informasi belum diverifikasi.'));
       block.append(table(result.items||[],[['Judul','title'],['URL','url'],['Klasifikasi','classification'],['Confidence','classification_confidence'],['Tanggal','published_at']]));
       $('panel').prepend(block);
       notify('Pratinjau selesai. Tidak ada item yang diantrekan atau diterbitkan.');
      }catch(e){if(active==='discovery')notify(e.message);}
     }));
     if(source.enabled)bar.append(btn('Ambil feed '+source.name,()=>confirmAction(
      'Ambil metadata publik dari '+source.name+' ke antrean review privat. Tidak ada campaign yang diterbitkan otomatis.',
      async()=>{const result=await api('discovery/sources/'+source.id+'/fetch',{method:'POST',body:'{}'});await show('discovery');notify(result.error?'Feed gagal: '+result.error:'Metadata masuk antrean: '+result.queued);}
     )));
     let editor=null;
     bar.append(btn('Edit sumber '+source.name,()=>{
      if(editor){editor.remove();editor=null;return;}
      // Build editors only on demand; up to 200 sources may be listed.
      editor=el('div','');editor.className='form source-editor';
      const label=(caption,control)=>{const holder=el('label',caption);holder.append(control);return holder;};
      const editName=el('input','');editName.value=source.name;editName.maxLength=120;
      const editUrl=el('input','');editUrl.type='url';editUrl.value=source.feed_url;editUrl.maxLength=2048;
      const editKind=document.createElement('select');
      for(const type of ['rss','atom','json_feed']){const option=el('option',type);option.value=type;editKind.append(option);}editKind.value=source.source_type;
      const editTrust=document.createElement('select');
      for(const level of ['low','medium','high']){const option=el('option',level);option.value=level;editTrust.append(option);}editTrust.value=source.trust_level;
      const editHint=el('input','');editHint.value=source.project_hint||'';editHint.maxLength=120;
      editor.append(label('Nama sumber',editName),label('URL feed HTTPS',editUrl),
       label('Format sumber',editKind),label('Trust level',editTrust),label('Petunjuk proyek',editHint),
       el('p','Mengubah URL atau format akan menonaktifkan pemindaian hingga sumber diverifikasi kembali.'));
      editor.append(btn('Simpan metadata sumber',async()=>{
       try{const result=await api('discovery/sources/'+source.id,{method:'PUT',body:JSON.stringify({
        name:editName.value,feed_url:editUrl.value,source_type:editKind.value,trust_level:editTrust.value,project_hint:editHint.value
       })});await show('discovery');notify(result.enabled?'Metadata tersimpan.':'Konfigurasi tersimpan. Sumber nonaktif hingga diverifikasi ulang.');}
       catch(e){notify(e.message);}
      },'primary'));
      bar.after(editor);
     }));
     section.append(bar);
    }
   }
   $('panel').append(section);
   const d=await api('discovery/queue?status=pending_review');$('panel').append(table(d.items,[['ID','id'],['Judul','title'],['Sumber','source'],['Klasifikasi','classification'],['Confidence','classification_confidence']],role==='admin'||role==='super_admin'));
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
 }catch(e){if(e.name!=='AbortError')notify(e.message);}
}
async function bulk(type,action,value){
 if(!selected.size){notify('Pilih minimal satu item.');return;}
 const query=new URLSearchParams({ids:[...selected].join(','),action,...(type==='discovery'?{reason:value}:{status:value,reviewer:value})});
 try{const preview=await api(type+'/bulk-preview?'+query);await confirmAction('Aksi '+action+' pada '+preview.count+' item. Preview berlaku lima menit.',async()=>{
  const r=await api(type+'/bulk-action',{method:'POST',body:JSON.stringify({preview_id:preview.preview_id,confirm_phrase:'KONFIRMASI'})});
  await show(type==='campaigns'?'campaigns':'discovery');notify('Berhasil: '+r.succeeded+', gagal: '+r.failed);});}catch(e){notify(e.message);}
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
async function init(){try{const d=await api('session');role=d.role;csrf=d.csrf_token;$('role').textContent=role==='super_admin'?'Super Admin':role;
 for(const [label,tab] of nav){if(!permissions[role]?.includes(tab))continue;const b=btn(label,()=>show(tab));b.dataset.tab=tab;$('tabs').append(b);}
 await show('overview');}catch(e){$('panel').replaceChildren(el('p','Akses admin memerlukan session login Airdrop Museum dan role yang terdaftar.'));notify(e.message);}}
init();
