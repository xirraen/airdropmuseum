import {sql,fail,decisionBody,cutoff,expected,requiredId} from './types.ts';
import {appendEvent} from './eventStore.ts';
export async function lookupCampaign(db,id){
 const r=await sql(db,"SELECT id,payload,review_status FROM am_core_exhibits WHERE id=? OR json_extract(payload,'$.slug')=? LIMIT 1",id,id).first();
 if(!r)fail('CAMPAIGN_NOT_FOUND',404);
 if(['draft','pending_review','private_draft','unreviewed'].includes(r.review_status))fail('CAMPAIGN_NOT_REVIEWED',409);
 let payload;try{payload=JSON.parse(r.payload||'{}');}catch{fail('CAMPAIGN_INVALID',503);}
 return {id:r.id,payload};
}
export async function requireFinished(db,id){
 const c=await lookupCampaign(db,id);
 const status=String(c.payload.status||'').toLowerCase();
 const finished=['completed','ended','closed','expired','claimed','archived'].includes(status);
 const date=Date.parse(c.payload.claim_deadline_at||'');
 if(!finished&&!(Number.isFinite(date)&&date<=Date.now()))fail('CAMPAIGN_NOT_FINISHED',409);
 return c;
}
export async function createDecision(db,scope,body){
 const decision=decisionBody(body),record=await lookupCampaign(db,decision.campaign_id);
 expected(body.expected_version);if(body.expected_version!==0)fail('VERSION_CONFLICT',409);
 const knowledge=cutoff(body.knowledge_cutoff_at),aggregate_id=crypto.randomUUID(),primary_evidence_ref=crypto.randomUUID();
 const existing=await sql(db,'SELECT aggregate_id FROM decision_entries WHERE user_scope=? AND campaign_id=?',scope,record.id).first();
 if(existing)fail('DECISION_ALREADY_EXISTS',409);
 const result=await appendEvent(db,{scope,aggregate_id,campaign_id:record.id,event_type:'decision_created',
  expected_version:0,knowledge_cutoff_at:knowledge,evidence_refs:[primary_evidence_ref],
  payload:{...decision,campaign_id:record.id,primary_evidence_ref}});
 return result;
}
export async function decisions(db,scope,limit=50){
 if(!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_LIMIT');
 const r=await sql(db,'SELECT aggregate_id,campaign_id,reason,primary_evidence_url,decision_source,time_budget_minutes,cost_ceiling_usd,realistic_expectations,knowledge_cutoff_at,created_at FROM decision_entries WHERE user_scope=? ORDER BY created_at DESC LIMIT ?',scope,limit).all();
 return r.results||[];
}
