import {verifyCampaign} from './verificationService.ts';
export async function scheduledTrust(env){
 if(!env.DB||!env.TRUST_CACHE)return {scanned:0,skipped:'bindings_missing'};
 try{
  if(!await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=7').first())return {scanned:0,skipped:'migration_required'};
  const rows=await env.DB.prepare(
   "SELECT e.id FROM am_core_exhibits e WHERE e.review_status NOT IN ('draft','pending_review','private_draft') AND EXISTS(SELECT 1 FROM campaign_source_links l WHERE l.campaign_id=e.id AND l.enabled=1) AND NOT EXISTS(SELECT 1 FROM verification_runs r WHERE r.campaign_id=e.id AND r.started_at>datetime('now','-6 hours') AND r.status IN ('running','complete')) ORDER BY "+
   "(CASE WHEN EXISTS(SELECT 1 FROM source_conflicts c WHERE c.campaign_id=e.id AND c.status='open') THEN 0 ELSE 1 END),"+
   "(CASE WHEN json_extract(e.payload,'$.claim_deadline_at') BETWEEN datetime('now') AND datetime('now','+7 days') OR json_extract(e.payload,'$.snapshot_at') BETWEEN datetime('now') AND datetime('now','+7 days') THEN 0 ELSE 1 END),"+
   "(CASE WHEN EXISTS(SELECT 1 FROM campaign_source_links l WHERE l.campaign_id=e.id AND l.updated_at>COALESCE((SELECT MAX(r.started_at) FROM verification_runs r WHERE r.campaign_id=e.id),'1970-01-01')) THEN 0 ELSE 1 END),"+
   "(CASE WHEN json_extract(e.payload,'$.status')='confirmed' OR e.review_status='confirmed' THEN 0 ELSE 1 END),e.updated_at DESC LIMIT 20"
  ).all();
  let scanned=0;for(const row of rows.results||[]){await verifyCampaign(env,row.id,{trigger:'scheduled',actor:'system'});scanned++;}
  return {scanned};
 }catch{return {scanned:0,error:'SCHEDULED_VERIFICATION_FAILED'};}
}
