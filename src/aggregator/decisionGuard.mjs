import {appendEvent} from '../autopsy/eventStore.ts';
import {rebuild} from '../autopsy/projectionService.ts';
// New participation requires an event-backed, owner-scoped decision. Legacy rows remain readable.
export async function requireDecision(db,scope,campaignId){
 const row=await db.prepare(`SELECT d.aggregate_id FROM campaign_registry_links l
 JOIN decision_entries d ON d.campaign_id=l.canonical_id AND d.user_scope=?
 JOIN claim_autopsies a ON a.aggregate_id=d.aggregate_id AND a.user_scope=d.user_scope
 WHERE l.aggregator_id=? AND a.status!='cancelled'
 AND EXISTS(SELECT 1 FROM autopsy_events e WHERE e.aggregate_id=d.aggregate_id AND e.user_scope=d.user_scope AND e.event_type='decision_created')`).bind(scope,campaignId).first();
 if(!row)throw Object.assign(Error('DECISION_REQUIRED'),{status:409});
 return row.aggregate_id;
}

export async function followCampaign(db,scope,campaignId){
 const aggregate_id=await requireDecision(db,scope,campaignId);
 const state=await rebuild(db,scope,aggregate_id);
 const existing=await db.prepare('SELECT 1 FROM user_campaign_subscriptions WHERE user_scope=? AND campaign_id=?').bind(scope,campaignId).first();
 if(existing&&state.activities.some(a=>a.activity_kind==='follow_campaign'))return aggregate_id;
 await appendEvent(db,{scope,aggregate_id,campaign_id:state.campaign_id,event_type:'activity_recorded',
  expected_version:state.version,knowledge_cutoff_at:new Date().toISOString(),evidence_refs:[state.evidence[0].id],
  payload:{activity_kind:'follow_campaign',phase:'unspecified',quest_count:0,chain_count:0,gas_cost_usd:0,bridge_cost_usd:0,research_minutes:0}});
 return aggregate_id;
}

export async function unfollowCampaign(db,scope,campaignId){
 const linked=await db.prepare(`SELECT d.aggregate_id FROM campaign_registry_links l JOIN decision_entries d ON d.campaign_id=l.canonical_id WHERE l.aggregator_id=? AND d.user_scope=?`).bind(campaignId,scope).first();
 const state=linked?await rebuild(db,scope,linked.aggregate_id):null;
 const follows=state?.activities.filter(a=>a.activity_kind==='follow_campaign')||[];
 if(!follows.length){
  await db.prepare('DELETE FROM user_campaign_subscriptions WHERE user_scope=? AND campaign_id=?').bind(scope,campaignId).run();return;
 }
 let version=state.version;
 for(const activity of follows){
  const result=await appendEvent(db,{scope,aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,event_type:'event_compensated',expected_version:version,knowledge_cutoff_at:new Date().toISOString(),evidence_refs:[],payload:{target_event_id:activity.id,reason:'User unfollowed campaign'}});
  version=result.version;
 }
}
