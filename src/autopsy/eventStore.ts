import {TYPES,CLAIM_EVENTS,fail,sql,cutoff,refs,expected,requiredId,text} from './types.ts';
import {readEvents,replay,projectionStatements} from './projectionService.ts';
const parse=s=>JSON.parse(s);
const dbError=error=>{const message=String(error?.message||'');if(/VERSION_CONFLICT|UNIQUE constraint failed: autopsy_events/i.test(message))fail('VERSION_CONFLICT',409);
 if(/AGGREGATE_MISMATCH/i.test(message))fail('AGGREGATE_MISMATCH',409);
 if(/UNIQUE constraint failed: decision_entries/i.test(message))fail('DECISION_ALREADY_EXISTS',409);
 throw error;};
export async function appendEvent(db,{scope,aggregate_id,campaign_id,event_type,expected_version,knowledge_cutoff_at,evidence_refs,payload}){
 requiredId(aggregate_id);requiredId(campaign_id);
 if(!TYPES.includes(event_type))fail('UNKNOWN_EVENT_TYPE');
 const version=expected(expected_version),stamp=cutoff(knowledge_cutoff_at);
 const evidenceRefs=event_type==='insight_generated'||event_type==='analysis_consent_changed'||event_type==='event_compensated'?[]:refs(evidence_refs);
 if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('INVALID_EVENT_PAYLOAD');
 const rows=await readEvents(db,scope,aggregate_id),prior=replay(rows);
 if(rows.length>=500)fail('EVENT_LIMIT_REACHED',422);
 if(event_type==='evidence_added'&&prior?.evidence.length>=20)fail('EVIDENCE_LIMIT_REACHED',422);
 if((prior?.version||0)!==version)fail('VERSION_CONFLICT',409);
 if(prior&&prior.campaign_id!==campaign_id)fail('AGGREGATE_MISMATCH',409);
 if(!prior&&event_type!=='decision_created')fail('DECISION_REQUIRED',409);
 if(prior&&event_type==='decision_created')fail('DECISION_ALREADY_EXISTS',409);
 if(prior?.status==='cancelled')fail('DECISION_CANCELLED',409);
 if(prior?.status==='finalized'&&!['event_compensated','analysis_consent_changed','insight_generated'].includes(event_type))fail('AUTOPSY_FINALIZED',409);
 if(prior?.outcome_cutoff_at&&stamp<prior.outcome_cutoff_at)fail('KNOWLEDGE_CUTOFF_REGRESSION',409);
 if(prior?.decision_cutoff_at&&stamp<prior.decision_cutoff_at)fail('KNOWLEDGE_CUTOFF_REGRESSION',409);
 if(CLAIM_EVENTS.has(event_type)){
  if(event_type==='decision_created'){
   if(evidenceRefs.length!==1||evidenceRefs[0]!==payload.primary_evidence_ref)fail('PRIMARY_EVIDENCE_REF_REQUIRED');
  }else if(event_type==='evidence_added'){
   if(evidenceRefs.length!==1||evidenceRefs[0]!==payload.id||prior.evidence.some(x=>x.id===payload.id))fail('INVALID_EVIDENCE_REF');
  }else{
   const valid=new Set(prior.evidence.map(x=>x.id));
   if(evidenceRefs.some(r=>!valid.has(r)))fail('UNKNOWN_EVIDENCE_REF',422);
  }
 }
 if(event_type==='outcome_recorded'&&prior.outcome!==null)fail('OUTCOME_EXISTS',409);
 if(event_type==='outcome_revised'&&prior.outcome===null)fail('OUTCOME_NOT_RECORDED',409);
 if(event_type==='outcome_revised'&&!text(payload.reason,500,true))fail('REVISION_REASON_REQUIRED');
 if(event_type==='autopsy_finalized'&&prior.outcome===null)fail('OUTCOME_REQUIRED',409);
 if(event_type==='event_compensated'){
  const target=rows.find(e=>e.id===payload.target_event_id);
  if(!target)fail('TARGET_EVENT_NOT_FOUND',404);
  if(!['activity_recorded','hypothesis_updated','evidence_added','outcome_recorded','outcome_revised','autopsy_finalized','decision_created'].includes(target.event_type))fail('COMPENSATION_NOT_SUPPORTED',409);
  if(rows.some(e=>e.event_type==='event_compensated'&&parse(e.payload_json).target_event_id===target.id))fail('ALREADY_COMPENSATED',409);
  if(target.event_type==='decision_created'&&rows.length!==1)fail('DECISION_COMPENSATION_REQUIRES_EMPTY_JOURNAL',409);
  if(target.event_type==='evidence_added'&&rows.some(e=>e.event_version>target.event_version&&!['event_compensated','insight_generated'].includes(e.event_type)&&parse(e.evidence_refs).includes(parse(target.payload_json).id)))fail('EVIDENCE_STILL_REFERENCED',409);
 }
 const id=crypto.randomUUID(),recordedAt=new Date().toISOString();
 const event={id,user_scope:scope,aggregate_id,campaign_id,event_version:version+1,event_type,knowledge_cutoff_at:stamp,evidence_refs:JSON.stringify(evidenceRefs),payload_json:JSON.stringify(payload),recorded_at:recordedAt};
 const state=replay([...rows,event]);
 if(!state)fail('REPLAY_FAILED',503);
 if(typeof db.batch!=='function')fail('D1_BATCH_REQUIRED',503);
 const write=sql(db,`INSERT INTO autopsy_events(id,user_scope,aggregate_id,campaign_id,event_version,event_type,knowledge_cutoff_at,evidence_refs,payload_json,recorded_at)
 VALUES(?,?,?,?,?,?,?,?,?,?)`,id,scope,aggregate_id,campaign_id,version+1,event_type,stamp,JSON.stringify(evidenceRefs),JSON.stringify(payload),recordedAt);
 const projections=projectionStatements(db,scope,state,version);
 // A cohort snapshot can contain this autopsy even when attached to another aggregate.
 // Invalidate every cached cohort for this owner atomically with consent withdrawal.
 if(event_type==='analysis_consent_changed'&&payload.enabled===false)
  projections.push(sql(db,'DELETE FROM pattern_snapshots WHERE user_scope=?',scope));
 try{await db.batch([write,...projections]);}catch(error){dbError(error);}
 return {id,version:version+1,state};
}
