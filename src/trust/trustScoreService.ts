import {DATE_FIELDS,TRUST_TIERS} from './types.ts';
const WEIGHTS={primary_official:55,official_social:45,independent:30,community:15,unknown:0};
export function computeSourceScore({tier='unknown',linked_from_official=false,consistency=0,material_conflicts=0,minor_conflicts=0,last_fetched_at=null},now=Date.now()){
 const age=last_fetched_at?now-Date.parse(last_fetched_at):Infinity;
 const stalePenalty=age>7*86400000?25:age>86400000?12:0;
 return Math.max(0,Math.min(100,(WEIGHTS[tier]??0)+(linked_from_official?15:0)+Math.max(0,Math.min(15,consistency*5))-material_conflicts*20-minor_conflicts*7-stalePenalty));
}
export function campaignConfidence({sources=[],conflicts=[],fields={},notApplicable=[]}){
 if(!sources.length)return 'needs_review';
 const material=conflicts.some(c=>c.severity==='material'&&c.status==='open');
 const essential=['snapshot_at','claim_opens_at','claim_deadline_at'];
 const enough=essential.some(f=>fields[f]!=null&&fields[f]!=='')||essential.every(f=>notApplicable.includes(f));
 const primary=sources.filter(s=>s.tier==='primary_official'&&s.last_fetched_at&&s.fetch_ok!==false);
 if(primary.length>=2&&!material&&enough)return 'high_confidence';
 const avg=sources.reduce((a,s)=>a+(s.trust_score||0),0)/sources.length;
 if(material||!enough)return 'needs_review';
 if(sources.length>=2&&avg>=45)return 'medium_confidence';
 return avg>=25?'low_confidence':'needs_review';
}
export function summarizeFields(sources){
 const ordered=[...sources].sort((a,b)=>(b.trust_score||0)-(a.trust_score||0));
 const fields={};for(const source of ordered)for(const [k,v] of Object.entries(source.metadata||{}))if(fields[k]===undefined)fields[k]=v;
 return fields;
}
