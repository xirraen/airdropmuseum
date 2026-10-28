import {sql,DISCLAIMER,INSUFFICIENT} from './types.ts';
import {appendEvent} from './eventStore.ts';
export const MIN_COHORT=5,MIN_KNOWN=2;
const grade=(n,known)=>n<MIN_COHORT||known<MIN_KNOWN?'insufficient_data':n>=12&&known>=5?'moderate_pattern':'weak_pattern';
function cohort(records,key,label,selector){
 const subset=records.filter(selector),known=subset.filter(s=>s.outcome==='allocated'||s.outcome==='not_allocated');
 const times=subset.map(s=>s.finalized_at).filter(Boolean).sort(),confidence_label=grade(subset.length,known.length);
 return {key,label,sample_size:subset.length,known_outcomes:known.length,confidence_label,
  period:{from:times[0]||null,to:times.at(-1)||null},allocated:known.filter(s=>s.outcome==='allocated').length,
  not_allocated:known.filter(s=>s.outcome==='not_allocated').length,unknown:subset.length-known.length,
  description:confidence_label==='insufficient_data'?INSUFFICIENT:
   `Dari ${subset.length} autopsy dalam kelompok ${label}, ${known.filter(s=>s.outcome==='allocated').length} mencatat alokasi dari ${known.length} hasil diketahui. Ini bukan jaminan pola berulang.`,
  limitations:DISCLAIMER};
}
export function cohorts(states){
 const records=states.filter(s=>s?.status==='finalized'&&s.analysis_consent===true&&s.decision).map(s=>({...s,activities:s.activities.filter(a=>a.knowledge_phase==='pre_outcome')}));
 const specs=[
  ['all','Semua autopsy yang diizinkan',()=>true],
  ['pre_snapshot','Aktivitas sebelum snapshot',s=>s.activities.some(a=>a.phase==='before_snapshot')],
  ['post_snapshot','Aktivitas setelah snapshot',s=>s.activities.some(a=>a.phase==='after_snapshot')],
  ['quests_4','Setidaknya 4 quest',s=>s.activities.some(a=>a.quest_count>=4)],
  ['chains_2','Setidaknya 2 chain',s=>s.activities.some(a=>a.chain_count>=2)],
  ['gas_10','Biaya gas tercatat minimal USD 10',s=>s.activities.some(a=>a.gas_cost_usd>=10)],
  ...['official','community','aggregator','social','other','unknown'].map(k=>['source_'+k,'Sumber keputusan '+k,s=>s.decision.decision_source===k])
 ];
 const list=specs.map(([key,label,fn])=>cohort(records,key,label,fn)),times=records.map(s=>s.finalized_at).filter(Boolean).sort();
 return {sample_size:records.length,period:{from:times[0]||null,to:times.at(-1)||null},
  cohorts:list,limitations:DISCLAIMER,disclaimer:DISCLAIMER,notice:list[0].confidence_label==='insufficient_data'?INSUFFICIENT:'Hasil ini hanya mendeskripsikan catatan historis, bukan prediksi.'};
}
export async function currentStates(db,scope){
 const rows=await sql(db,'SELECT snapshot_json FROM claim_autopsies WHERE user_scope=? ORDER BY updated_at DESC LIMIT 5001',scope).all();
 if((rows.results||[]).length>5000)throw Error('COHORT_LIMIT_EXCEEDED');
 return (rows.results||[]).map(x=>{try{return JSON.parse(x.snapshot_json);}catch{return null;}}).filter(Boolean);
}
export async function patterns(db,scope){return cohorts(await currentStates(db,scope));}
const isoWeek=(now=new Date())=>{const d=new Date(now),dow=(d.getUTCDay()+6)%7;
 const start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-dow));
 return {from:start.toISOString(),to:new Date(start.getTime()+7*86400000).toISOString()};};
export async function weekly(db,scope,now=new Date()){
 const period=isoWeek(now),records=await currentStates(db,scope),week=records.filter(s=>s.created_at>=period.from&&s.created_at<period.to);
 const all=week.length,allocated=week.filter(s=>s.outcome==='allocated').length,
 not_allocated=week.filter(s=>s.outcome==='not_allocated').length,unknown=week.filter(s=>s.outcome==='unknown').length;
 const lessons=week.map(s=>({aggregate_id:s.aggregate_id,hypothesis:s.hypothesis,status:s.status})).filter(s=>s.hypothesis);
 const pending=week.filter(s=>s.status!=='finalized'||!s.outcome).map(s=>({aggregate_id:s.aggregate_id,campaign_id:s.campaign_id,reason:'Outcome atau finalisasi perlu ditinjau ulang'}));
 return {period,sample_size:all,known_outcomes:allocated+not_allocated,confidence_label:grade(all,allocated+not_allocated),
  campaigns:week.map(s=>({aggregate_id:s.aggregate_id,campaign_id:s.campaign_id,status:s.status})),
  outcomes:{allocated,not_allocated,unknown,pending:all-allocated-not_allocated-unknown},
  evidence_quality:{with_primary_evidence:week.filter(s=>s.evidence.length>=1).length,limitations:'Jumlah sumber tercatat, bukan verifikasi independen'},
  lessons,pending_review:pending,limitations:DISCLAIMER,disclaimer:DISCLAIMER,notice:all<MIN_COHORT?INSUFFICIENT:'Ringkasan mingguan bersifat deskriptif.'};
}
export async function recordGeneratedInsight(db,scope,state){
 if(!state.analysis_consent)return null;
 const summary=await patterns(db,scope),first=summary.cohorts[0],stamp=new Date().toISOString();
 const result=await appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,
  event_type:'insight_generated',expected_version:state.version,knowledge_cutoff_at:stamp,evidence_refs:[],
  payload:{sample_size:first.sample_size,known_outcomes:first.known_outcomes,confidence_label:first.confidence_label}});
 await sql(db,'INSERT INTO pattern_snapshots(id,user_scope,aggregate_id,sample_size,known_outcomes,confidence_label,period_start,period_end,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?)',
 crypto.randomUUID(),scope,state.aggregate_id,first.sample_size,first.known_outcomes,first.confidence_label,first.period.from,first.period.to,JSON.stringify(summary)).run();
 return result;
}
