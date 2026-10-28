// Derived personal work queue. No new store, reputation score or eligibility claim.
import {dateOnly} from './campaigns.js';
export const ACTION_KINDS={blocked:'Terhambat',verify:'Perlu dicek',date:'Jadwal',source:'Sumber & konteks',next:'Langkah berikutnya'};
const calendarDay=now=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const delta=(a,b)=>(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
export function actionQueue(projects,state,now=new Date()){
 const today=calendarDay(now),out=[];
 for(const p of projects){
  const r=state.records[p.id],c=state.campaigns[p.id],h=state.hunts[p.id];
  if(!state.saved.includes(p.id)||!r||!c||!h||['completed','archived'].includes(r.status))continue;
  const add=(kind,suffix,title,context,action,rank,extra={})=>out.push({id:p.id+':'+suffix,project:p,kind,title,context,action,rank,priority:r.priority,source:c.source||p.website||'',demo:!p.custom,...extra});
  for(const [kind,date,label] of [['deadline',c.deadline,'Tenggat kampanye'],['snapshot',c.snapshot,'Tanggal snapshot'],['personal',r.due,'Target pribadi']]){
   if(!dateOnly(date))continue;const days=delta(date,today);if(days>7)continue;
   add('date',kind+':'+date,label,days<0?`Tanggal tercatat sudah ${Math.abs(days)} hari terlewat. Tinjau perubahan aturan atau sesuaikan rencana.`:days===0?'Tanggal tercatat adalah hari ini. Periksa jam dan zona waktu pada sumber.':`Tanggal tercatat ${days} hari lagi. Periksa kembali aturan pada sumber.`,kind==='personal'?'tasks':'campaign',days<=0?0:2,{date,days,source:kind==='personal'?'':c.source});
  }
  let next=null;
  p.tasks.forEach((title,i)=>{
   const key=p.id+':'+i;if(state.done[key]||state.taskStates[key]==='done')return;
   const status=state.taskStates[key]||'pending';
   if(status==='failed'||status==='verify')add(status==='failed'?'blocked':'verify','task:'+i,title,status==='failed'?'Catat penyebab hambatan dan tinjau langkah yang dapat diulang.':'Periksa hasil dan sumber sebelum menandainya selesai.','tasks',status==='failed'?1:2,{taskKey:key,status});
   else if(!next)next={title,key};
  });
  if(!c.source)add('source','source','Lengkapi sumber aturan','Simpan URL pengumuman dan persyaratan. Situs proyek saja belum menjelaskan aturan kampanye.','campaign',3);
  else if(!c.checkedAt||delta(today,c.checkedAt)>=14)add('source','review','Tinjau ulang aturan kampanye',c.checkedAt?`Tinjauan pribadi terakhir ${c.checkedAt}. Pastikan tanggal dan persyaratan masih sesuai sumber.`:'Belum ada tanggal tinjauan pribadi. Baca aturan lalu catat tanggal Anda memeriksanya.','campaign',3);
  if(h.brief.stage==='submitted'&&!h.brief.submissionURL)add('verify','submission','Lengkapi jejak pengiriman','Brief ditandai dikirim, tetapi URL pengiriman belum dicatat.','brief',2);
  if(next)add('next','next:'+next.key,next.title,'Satu tugas berikutnya dari checklist Anda. Penyelesaiannya tetap dicatat sendiri.','tasks',4,{taskKey:next.key,status:'pending'});
  else if(!h.trail.length)add('next','proof','Dokumentasikan hasil riset','Checklist tidak memiliki tugas tersisa. Simpan konteks pekerjaan di Proof Trail.','proof',4);
 }
 return out.sort((a,b)=>a.rank-b.rank||(a.date||'9999').localeCompare(b.date||'9999')||({high:0,normal:1,low:2}[a.priority]??1)-({high:0,normal:1,low:2}[b.priority]??1)||a.project.name.localeCompare(b.project.name)||a.id.localeCompare(b.id));
}
export function filterActions(items,{kind='all',project='all',query=''}={}){const q=String(query).trim().toLocaleLowerCase('id-ID');return items.filter(a=>(kind==='all'||a.kind===kind)&&(project==='all'||a.project.id===project)&&(!q||[a.title,a.project.name,a.project.chain,a.context].join(' ').toLocaleLowerCase('id-ID').includes(q)))}
export function setActionTask(state,projects,key,status){
 if(!['pending','done','failed','verify'].includes(status))throw Error('Status tugas tidak valid.');
 const p=projects.find(p=>p.tasks.some((_,i)=>key===p.id+':'+i));
 if(!p||!state.saved.includes(p.id)||['completed','archived'].includes(state.records[p.id]?.status))throw Error('Tugas tidak tersedia pada riset aktif.');
 state.done[key]=status==='done';if(status==='pending')delete state.taskStates[key];else state.taskStates[key]=status;
 return p;
}
const line=v=>String(v??'').replace(/[\r\n]+/g,' ').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&');
export function actionPlan(items,now=new Date()){
 return ['# Airdrop Museum — Action Plan',`Generated: ${now.toISOString()}`,'','Personal work plan. Self-reported records; not eligibility, on-chain verification or a reward promise.',`${items.length} actions in the current filter. Review private notes and URLs before sharing.`,
 ...items.flatMap(a=>['',`## ${line(a.project.name)} — ${line(ACTION_KINDS[a.kind])}`,`- [ ] ${line(a.title)}`,`Context: ${line(a.context)}`,`Chain: ${line(a.project.chain)} | ${a.demo?'Fictional demonstration':'Personal project'}`,`Recorded date: ${a.date||'Not set'}`,`Source: ${line(a.source||'Not recorded')}`])].join('\n');
}
