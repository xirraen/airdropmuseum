import {FIELDS,MATERIAL_FIELDS} from './types.ts';
import {canonicalValue,conflictFingerprint,stableJSON} from './fingerprint.ts';
export function severityFor(field){return MATERIAL_FIELDS.has(field)?'material':field==='project_name'?'minor':'informational';}
export function valuesDiffer(field,a,b){const left=canonicalValue(field,a),right=canonicalValue(field,b);return stableJSON(left)!==stableJSON(right);}
export async function detectConflicts(campaignId,sources){
 const valid=sources.filter(s=>s.metadata&&typeof s.metadata==='object');
 const found=[];for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
  const a=valid[i],b=valid[j];if(a.id===b.id)continue;
  for(const field of FIELDS){if(a.metadata[field]==null||b.metadata[field]==null)continue;
   if(!valuesDiffer(field,a.metadata[field],b.metadata[field]))continue;
   const ordered=[{source_id:a.id,value:a.metadata[field],url:a.url},{source_id:b.id,value:b.metadata[field],url:b.url}].sort((x,y)=>x.source_id.localeCompare(y.source_id));
   const fingerprint=await conflictFingerprint(campaignId,field,ordered[0],ordered[1]);
   found.push({fingerprint,campaign_id:campaignId,field,severity:severityFor(field),source_a:ordered[0].source_id,value_a:JSON.stringify(ordered[0].value),source_b:ordered[1].source_id,value_b:JSON.stringify(ordered[1].value)});
  }
 }
 return found.slice(0,300);
}
