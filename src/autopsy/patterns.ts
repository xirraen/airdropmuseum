export const INSUFFICIENT='Belum cukup data untuk pola yang dapat dipercaya';
export const LIMITATION='Statistik deskriptif dari catatan yang dipilih pengguna; hasil dilaporkan sendiri, dapat bias dan tidak menunjukkan sebab-akibat atau memprediksi eligibility maupun reward.';
export const MIN_SAMPLE=5;
const date=s=>{const t=Date.parse(String(s||'').replace(' ','T')+(String(s||'').includes('Z')?'':'Z'));return Number.isFinite(t)?new Date(t).toISOString():null;};
export function buildPatterns(rows,min=MIN_SAMPLE){
 const records=rows.filter(r=>Number(r.consent_to_analysis)===1);
 const dates=records.map(r=>date(r.created_at)).filter(Boolean).sort();
 const period={from:dates[0]||null,to:dates.at(-1)||null};
 const base={sample_count:records.length,period,limitations:LIMITATION,notice:records.length<min?INSUFFICIENT:'Ini bukan prediksi dan bukan jaminan alokasi.',min_sample:min};
 if(records.length<min)return {...base,insights:[]};
 const groups=[
  ['activity_before_snapshot',1,'Aktivitas sebelum snapshot'],
  ['activity_after_snapshot',1,'Aktivitas setelah snapshot'],
  ['quest_count',v=>Number(v)>=4,'Empat quest atau lebih'],
  ['chain_count',v=>Number(v)>=2,'Aktivitas pada dua chain atau lebih'],
  ['gas_cost_usd',v=>Number(v)>=10,'Gas setidaknya USD 10 (catatan manual)'],
  ...['official','community','aggregator','social','other','unknown'].map(v=>['decision_source',v,'Sumber keputusan: '+v])
 ];
 const insights=[];
 for(const [field,target,label] of groups){
  const subset=records.filter(r=>typeof target==='function'?target(r[field]):Number.isInteger(target)?Number(r[field])===target:r[field]===target);
  if(subset.length<min)continue;
  const allocated=subset.filter(r=>r.outcome==='allocated').length;
  const not_allocated=subset.filter(r=>r.outcome==='not_allocated').length;
  const unknown=subset.filter(r=>r.outcome==='unknown').length;
  const d=subset.map(r=>date(r.created_at)).filter(Boolean).sort();
  insights.push({field,label,sample_count:subset.length,allocated,not_allocated,unknown,
   period:{from:d[0]||null,to:d.at(-1)||null},limitations:LIMITATION,
   description:`Dari ${subset.length} campaign dengan ${label.toLowerCase()}, ${allocated} tercatat menghasilkan alokasi, ${not_allocated} tidak, dan ${unknown} belum diketahui. Ini bukan jaminan pola yang sama akan berulang.`});
 }
 return {...base,insights,notice:insights.length?base.notice:INSUFFICIENT};
}
export function weekRange(now=new Date()){
 const today=new Date(now),day=today.getUTCDay(),start=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-(day+6)%7));
 const end=new Date(start.getTime()+7*86400000);
 return {start:start.toISOString(),end:end.toISOString()};
}
export function buildWeekly(rows,week=weekRange()){
 const inWeek=rows.filter(r=>{const t=date(r.created_at);return !!t&&t>=week.start&&t<week.end;});
 const counts={allocated:0,not_allocated:0,unknown:0,pending:0};
 const revisit=[],lessons=[];
 let official=0;
 for(const row of inWeek){
  if(row.decision_source==='official')official++;
  if(row.outcome&&Object.hasOwn(counts,row.outcome))counts[row.outcome]++;
  else counts.pending++;
  if(row.lessons)lessons.push({decision_id:row.id,lesson:row.lessons});
  if(!row.outcome||row.decision_source!=='official')revisit.push({decision_id:row.id,campaign_id:row.campaign_id,reason:!row.outcome?'Belum ada Outcome Review':'Tinjau kembali kualitas sumber keputusan'});
 }
 return {sample_count:inWeek.length,period:{from:week.start,to:week.end},campaigns_followed:inWeek.map(r=>({decision_id:r.id,campaign_id:r.campaign_id,created_at:r.created_at})),
  evidence_quality:{primary_source_decisions:official,self_reported:true,notice:'Indikator ini hanya jenis sumber yang dicatat pengguna, bukan penilaian kualitas objektif.'},
  outcomes:counts,lessons:lessons.slice(0,100),revisit:revisit.slice(0,100),
  limitations:LIMITATION,notice:inWeek.length<MIN_SAMPLE?INSUFFICIENT:'Review mingguan berdasarkan keputusan yang dicatat, bukan seluruh aktivitas wallet.'};
}
