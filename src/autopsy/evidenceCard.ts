import {campaignBySlug} from '../publicApi/campaignApi.ts';
import {sql,https} from './validation.ts';
export const DISCLAIMER='Kartu bukti ini adalah ringkasan sumber yang telah ditinjau platform, bukan jaminan eligibility, keamanan, atau reward. Verifikasi kembali pada sumber resmi.';
export function assembleEvidenceCard(campaign,rows=[],conflicts=[]){
 const vetted=rows.filter(s=>{try{return !!https(s.source_url);}catch{return false;}});
 const primary=vetted.filter(x=>x.tier==='primary_official'||x.official_domain_verified===1).map(x=>({url:https(x.source_url),last_checked_at:x.last_fetched_at}));
 const confirmation=vetted.filter(x=>x.tier==='independent'||x.tier==='official_social').map(x=>({url:https(x.source_url),tier:x.tier,last_checked_at:x.last_fetched_at}));
 const open=conflicts.filter(x=>x.status==='open').map(x=>({field:x.field,severity:x.severity,status:'open'}));
 return {campaign_slug:campaign.slug,claim:`Status campaign ${campaign.name||campaign.project_name}: ${campaign.status||'belum diketahui'} (sesuai data kurasi).`,
  primary_sources:primary.length?primary:[{url:campaign.source_url,last_checked_at:campaign.last_verified_at}],
  confirmations:confirmation,conflicts:open,
  status:open.length?'conflicted':confirmation.length?'cross_checked':'needs_manual_review',
  last_checked_at:campaign.last_verified_at,source_count:campaign.source_count,
  sample_count:vetted.length,period:{from:null,to:campaign.last_verified_at},
  limitations:'Kartu ini hanya mencakup sumber yang tercatat dan terverifikasi; bukan audit wallet, tidak membuktikan kelayakan, dan tidak berisi data keputusan atau catatan pribadi pengguna.',
  disclaimer:DISCLAIMER};
}
export async function evidenceCard(env,slug){
 // Strict public visibility gate: draft, private, unverified and missing official source return 404.
 const {campaign,row}=await campaignBySlug(env,slug);
 const [sources,conflicts]=await Promise.all([
  sql(env.DB,'SELECT p.source_url,p.tier,p.last_fetched_at,l.official_domain_verified FROM campaign_source_links l JOIN source_trust_profiles p ON p.id=l.source_id WHERE l.campaign_id=? AND l.enabled=1 ORDER BY p.last_fetched_at DESC LIMIT 50',row.id).all(),
  sql(env.DB,"SELECT field,severity,status FROM source_conflicts WHERE campaign_id=? AND status='open' ORDER BY created_at DESC LIMIT 50",row.id).all()
 ]);
 return assembleEvidenceCard(campaign,sources.results||[],conflicts.results||[]);
}
