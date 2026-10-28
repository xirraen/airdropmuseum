import {cleanText,DiscoveryError} from './types.ts';
const sql=(db,q,...values)=>db.prepare(q).bind(...values);
export async function reviewItem(db,id,admin,action,body={}){
 const item=await sql(db,'SELECT * FROM discovery_items WHERE id=?',id).first();
 if(!item)throw new DiscoveryError('ITEM_NOT_FOUND',404);
 const to=action==='approve'?'approved':action==='reject'?'rejected':action==='convert'?'converted':'';
 if(!to)throw new DiscoveryError('INVALID_REVIEW_ACTION');
 const expected=action==='convert'?'approved':'pending_review';
 if(item.status!==expected)throw new DiscoveryError('INVALID_STATUS_TRANSITION',409);
 const reason=action==='reject'?cleanText(body.rejection_reason||'',500):'';
 if(action==='reject'&&!reason)throw new DiscoveryError('REJECTION_REASON_REQUIRED');
 const adminId=admin.id,logId=crypto.randomUUID();
 if(action==='convert'){
  // The legacy registry has no dedicated campaign drafts table yet; store a draft
  // in am_core_exhibits with review_status='draft', excluded from all public reads.
  const campaignId='discovery-'+id;
  const projectName=cleanText(body.project_name||'',120),chain=cleanText(body.chain||'',80);
  const status=body.campaign_status==='rumored'?'rumored':'speculative';
  const payload={id:campaignId,name:projectName,title:projectName||item.title,chain,
   status,visibility:'private_draft',publication_ready:false,
   source_url:item.url,evidence:[{source_url:item.url,verified:false,review_required:true}],
   summary:item.summary,classification:item.classification,
   disclaimer:'Informasi belum terverifikasi secara independen. Periksa sumber resmi dan lakukan review manual sebelum publikasi.',
   required_before_publish:['project_name','chain','manual_evidence_review']};
  const results=await db.batch([
   sql(db,"INSERT OR IGNORE INTO am_core_exhibits(id,payload,source_url,review_status) SELECT ?,?,url,'draft' FROM discovery_items WHERE id=? AND status='approved'",
    campaignId,JSON.stringify(payload),id),
   sql(db,"UPDATE discovery_items SET status='converted',campaign_id=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status='approved'",campaignId,adminId,id)
  ]);
  if(results[1]?.meta?.changes!==1)throw new DiscoveryError('INVALID_STATUS_TRANSITION',409);
  await sql(db,'INSERT INTO discovery_review_log(id,item_id,admin_id,action,previous_status,new_status,reason) VALUES(?,?,?,?,?,?,?)',
   logId,id,adminId,'converted','approved','converted','Draft dibuat tanpa publikasi').run();
  return {id,status:'converted',campaign_id:campaignId,published:false};
 }
 const result=await sql(db,'UPDATE discovery_items SET status=?,rejection_reason=?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status=?',
  to,reason||null,adminId,id,expected).run();
 if(result.meta?.changes!==1)throw new DiscoveryError('INVALID_STATUS_TRANSITION',409);
 await sql(db,'INSERT INTO discovery_review_log(id,item_id,admin_id,action,previous_status,new_status,reason) VALUES(?,?,?,?,?,?,?)',
  logId,id,adminId,to,expected,to,reason).run();
 return {id,status:to,published:false};
}
