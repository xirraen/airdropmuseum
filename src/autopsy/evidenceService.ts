import {evidenceBody,cutoff,expected,refs,text,requiredId,fail} from './types.ts';
import {appendEvent} from './eventStore.ts';
export async function addEvidence(db,scope,state,body){
 const entry=evidenceBody(body),id=crypto.randomUUID();
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,
  expected_version:expected(body.expected_version),event_type:'evidence_added',
  knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),evidence_refs:[id],payload:{id,...entry}});
}
export async function addActivity(db,scope,state,body){
 const {activityBody}=await import('./types.ts');
 const activity=activityBody(body);
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,
  event_type:'activity_recorded',expected_version:expected(body.expected_version),
  knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),evidence_refs:refs(body.evidence_refs),payload:activity});
}
export async function reviseHypothesis(db,scope,state,body){
 const value=text(body.hypothesis,2000,true);
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,
  event_type:'hypothesis_updated',expected_version:expected(body.expected_version),
  knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),evidence_refs:refs(body.evidence_refs),payload:{text:value}});
}
export async function compensate(db,scope,state,body){
 const target=requiredId(body.target_event_id),reason=text(body.reason,500,true);
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,event_type:'event_compensated',
  expected_version:expected(body.expected_version),knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),
  evidence_refs:[],payload:{target_event_id:target,reason}});
}
export async function consent(db,scope,state,body){
 if(typeof body.enabled!=='boolean')fail('INVALID_CONSENT');
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,event_type:'analysis_consent_changed',
  expected_version:expected(body.expected_version),knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),evidence_refs:[],
  payload:{enabled:body.enabled}});
}
