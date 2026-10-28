const host=document.getElementById('detail-content');
const caution='Skor ini adalah penilaian internal berbasis sumber publik, bukan jaminan keamanan atau legitimacy.';
const build=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
async function showTrust(button,id){
 const tab=button.closest('.detail-tabs'),body=host?.querySelector('.detail-body');
 if(!body)return;tab.querySelectorAll('button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
 button.classList.add('active');button.setAttribute('aria-pressed','true');body.replaceChildren(build('p','Memuat verifikasi sumber…'));
 const url='/api/trust/campaigns/'+encodeURIComponent(id),header={};
 const init=window.Telegram?.WebApp?.initData;if(init)header['X-Telegram-Init-Data']=init;
 try{
  const results=await Promise.all([fetch(url+'/verification',{headers:header}),fetch('/api/trust/sources?campaign_id='+encodeURIComponent(id),{headers:header}),fetch(url+'/conflicts',{headers:header})]);
  if(!results.every(r=>r.ok))throw Error('Belum ada data server untuk exhibit ini.');
  const [v,s,c]=await Promise.all(results.map(r=>r.json()));
  if(!button.isConnected)return;
  const section=build('section');section.className='panel';section.append(build('h3','Trust & Verifikasi'),build('p',caution),build('p','Confidence: '+v.confidence_label),build('p','Terakhir diperiksa: '+(v.latest?.finished_at||'Belum pernah')));
  for(const source of s.sources){const item=build('p','Sumber '+source.tier+' · '+source.trust_score+'/100 · '+(source.last_fetched_at||'belum diperiksa')+' · ');const link=build('a','Buka sumber');link.href=source.source_url;link.target='_blank';link.rel='noopener noreferrer';item.append(link);section.append(item);}
  section.append(build('h3','Konflik terbuka: '+c.conflicts.filter(x=>x.status==='open').length));
  for(const conflict of c.conflicts.filter(x=>x.status==='open'))section.append(build('p',conflict.field+' · '+conflict.severity+' · '+JSON.stringify(conflict.value_a)+' / '+JSON.stringify(conflict.value_b)));
  section.append(build('h3','Riwayat verifikasi'));for(const run of v.runs.slice(0,5))section.append(build('p',run.started_at+' · '+run.status));
  const link=build('a','Buka Trust & Verifikasi lengkap');link.href='/trust.html?campaign_id='+encodeURIComponent(id);section.append(link);
  body.replaceChildren(section);
 }catch(e){if(button.isConnected)body.replaceChildren(build('p',e.message+' '+caution));}
}
if(host)new MutationObserver(()=>{
 const tabs=host.querySelector('.detail-tabs');if(!tabs||tabs.querySelector('#trust-detail-tab'))return;
 const source=host.querySelector('[data-save]');const id=source?.dataset.save;if(!id)return;
 const button=build('button','Trust & Verifikasi');button.id='trust-detail-tab';button.type='button';button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>showTrust(button,id));tabs.append(button);
}).observe(host,{subtree:true,childList:true});
