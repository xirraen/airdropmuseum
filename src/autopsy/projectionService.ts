import {sql} from './types.ts';
// Pure projector: every state is rebuildable from immutable events. Cache tables are disposable.
const parse=s=>{try{return JSON.parse(s);}catch{return {};}};
export function replay(rows){
 const ordered=[...rows].sort((a,b)=>a.event_version-b.event_version);
 const compensations=new Set(ordered.filter(e=>e.event_type==='event_compensated').map(e=>parse(e.payload_json).target_event_id));
 const first=ordered[0];
 if(!first)return null;
 const firstOutcome=ordered.find(e=>['outcome_recorded','outcome_revised'].includes(e.event_type)&&!compensations.has(e.id));
 const state={aggregate_id:first.aggregate_id,campaign_id:first.campaign_id,version:ordered.at(-1).event_version,
  status:'open',analysis_consent:false,decision:null,decision_cutoff_at:null,outcome_cutoff_at:null,
  outcome:null,first_outcome_at:firstOutcome?.recorded_at||null,activities:[],hypothesis:'',evidence:[],timeline:[],created_at:first.recorded_at,
  updated_at:ordered.at(-1).recorded_at,finalized_at:null,insights:[]};
 for(const e of ordered){
  const p=parse(e.payload_json),compensated=compensations.has(e.id);
  state.timeline.push({id:e.id,version:e.event_version,type:e.event_type,recorded_at:e.recorded_at,
   knowledge_cutoff_at:e.knowledge_cutoff_at,knowledge_phase:!firstOutcome||e.event_version<firstOutcome.event_version?'pre_outcome':e.event_version===firstOutcome.event_version?'outcome_transition':'post_outcome',evidence_refs:parse(e.evidence_refs),compensated});
  if(compensated&&e.event_type!=='decision_created')continue;
  switch(e.event_type){
   case 'decision_created':
    state.decision={reason:p.reason,primary_evidence_url:p.primary_evidence_url,primary_evidence_ref:p.primary_evidence_ref,
     decision_source:p.decision_source,time_budget_minutes:p.time_budget_minutes,cost_ceiling_usd:p.cost_ceiling_usd,
     realistic_expectations:p.realistic_expectations};
    state.decision_cutoff_at=e.knowledge_cutoff_at;
    state.evidence.push({id:p.primary_evidence_ref,kind:'official_link',value:p.primary_evidence_url,knowledge_cutoff_at:e.knowledge_cutoff_at,recorded_at:e.recorded_at,source_event_id:e.id});
    if(compensated)state.status='cancelled';
    break;
   case 'evidence_added': state.evidence.push({id:p.id,kind:p.kind,value:p.value,knowledge_cutoff_at:e.knowledge_cutoff_at,source_event_id:e.id});break;
   case 'activity_recorded':state.activities.push({id:e.id,knowledge_cutoff_at:e.knowledge_cutoff_at,recorded_at:e.recorded_at,knowledge_phase:!firstOutcome||e.event_version<firstOutcome.event_version?'pre_outcome':'post_outcome',...p});break;
   case 'hypothesis_updated':state.hypothesis=p.text;break;
   case 'outcome_recorded':
   case 'outcome_revised':state.outcome=p.outcome;state.outcome_cutoff_at=e.knowledge_cutoff_at;break;
   case 'autopsy_finalized':state.status='finalized';state.finalized_at=e.recorded_at;break;
   case 'analysis_consent_changed':state.analysis_consent=p.enabled===true;break;
   case 'insight_generated':state.insights.push({id:e.id,sample_size:p.sample_size,confidence_label:p.confidence_label,generated_at:e.recorded_at});break;
  }
 }
 return state;
}
export async function readEvents(db,scope,aggregate){
 const r=await sql(db,'SELECT id,user_scope,aggregate_id,campaign_id,event_version,event_type,knowledge_cutoff_at,evidence_refs,payload_json,recorded_at FROM autopsy_events WHERE user_scope=? AND aggregate_id=? ORDER BY event_version ASC',scope,aggregate).all();
 return r.results||[];
}
export async function rebuild(db,scope,aggregate){
 const rows=await readEvents(db,scope,aggregate);return replay(rows);
}
export function projectionStatements(db,scope,state,previousVersion){
 const decision=state.decision;
 const statements=[
  sql(db,`INSERT INTO claim_autopsies(aggregate_id,user_scope,campaign_id,version,status,outcome,analysis_consent,decision_cutoff_at,outcome_cutoff_at,snapshot_json,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(aggregate_id) DO UPDATE SET
 version=excluded.version,status=excluded.status,outcome=excluded.outcome,analysis_consent=excluded.analysis_consent,
 outcome_cutoff_at=excluded.outcome_cutoff_at,snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at
 WHERE claim_autopsies.user_scope=excluded.user_scope AND claim_autopsies.version=?`,
 state.aggregate_id,scope,state.campaign_id,state.version,state.status,state.outcome,Number(state.analysis_consent),state.decision_cutoff_at,state.outcome_cutoff_at,
 JSON.stringify(state),state.created_at,state.updated_at,previousVersion),
  sql(db,`INSERT INTO decision_entries(aggregate_id,user_scope,campaign_id,reason,primary_evidence_ref,primary_evidence_url,decision_source,time_budget_minutes,cost_ceiling_usd,realistic_expectations,knowledge_cutoff_at,created_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(aggregate_id) DO NOTHING`,
 state.aggregate_id,scope,state.campaign_id,decision.reason,decision.primary_evidence_ref,decision.primary_evidence_url,
 decision.decision_source,decision.time_budget_minutes,decision.cost_ceiling_usd,decision.realistic_expectations,state.decision_cutoff_at,state.created_at),
  sql(db,'UPDATE evidence_items SET revoked=1 WHERE user_scope=? AND aggregate_id=?',scope,state.aggregate_id)
 ];
 for(const item of state.evidence)statements.push(sql(db,`INSERT INTO evidence_items(id,aggregate_id,user_scope,kind,value,knowledge_cutoff_at,source_event_id,revoked)
 VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET revoked=0 WHERE evidence_items.user_scope=excluded.user_scope`,
 item.id,state.aggregate_id,scope,item.kind,item.value,item.knowledge_cutoff_at,item.source_event_id));
 return statements;
}
// Reconciliation intentionally never mutates events. Only projections can be replaced.
export async function reconcile(db,scope,aggregate){
 const state=await rebuild(db,scope,aggregate);
 if(!state)return null;
 // Reconciliation is only appropriate for known cache drift in an admin-controlled repair.
 return state;
}
