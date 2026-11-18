// Mini App-only augmentation of public D1 campaign metadata.
// Facts are copied as recorded; no eligibility score or wallet decision is inferred.
const cleanDate=value=>{
 if(typeof value!=='string')return '';
 const raw=value.trim().slice(0,40);
 return /^\d{4}-\d\d-\d\d/.test(raw)&&Number.isFinite(Date.parse(raw))?raw:'';
};
function parsedFlags(value){
 let list=value;
 if(typeof value==='string'){
  try{list=JSON.parse(value);}catch{return [];}
 }
 if(!Array.isArray(list))return [];
 return list.filter(flag=>typeof flag==='string'&&flag.length<=100).slice(0,16);
}
export function addCampaignEvidence(project,campaign){
 if(!project||!campaign)return null;
 return {...project,
  updatedAt:cleanDate(campaign.updated_at),
  lastVerifiedAt:cleanDate(campaign.last_verified_at),
  claimDeadlineAt:cleanDate(campaign.claim_deadline_at),
  snapshotAt:cleanDate(campaign.snapshot_at),
  riskFlags:parsedFlags(campaign.risk_flags)
 };
}
