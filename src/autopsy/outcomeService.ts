import {outcome,cutoff,expected,refs,text,fail} from './types.ts';
import {appendEvent} from './eventStore.ts';
import {requireFinished} from './decisionService.ts';
export async function recordOutcome(db,scope,state,body){
 await requireFinished(db,state.campaign_id);
 const value=outcome(body.outcome),revision=state.outcome!==null;
 const reason=revision?text(body.revision_reason,500,true):'';
 const event_type=revision?'outcome_revised':'outcome_recorded';
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,
  event_type,expected_version:expected(body.expected_version),knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),
  evidence_refs:refs(body.evidence_refs),payload:{outcome:value,...(revision?{reason}:{} )}});
}
export async function finalize(db,scope,state,body){
 await requireFinished(db,state.campaign_id);
 if(state.outcome===null)fail('OUTCOME_REQUIRED',409);
 return appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,
  event_type:'autopsy_finalized',expected_version:expected(body.expected_version),knowledge_cutoff_at:cutoff(body.knowledge_cutoff_at),
  evidence_refs:refs(body.evidence_refs),payload:{final_note:text(body.note??'',1200)}});
}
