import {normalizeUrl,cleanText,safeDate} from './types.ts';
import {classify} from './classifier.ts';
export async function fingerprint(item){
 const input=cleanText(item.title,240).toLowerCase()+'|'+item.url+'|'+(item.published_at||'');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function storeDiscoveredItem(db,message){
 const item=message?.item,sourceId=message?.source_id;
 if(!item||typeof sourceId!=='string'||sourceId.length>80)throw Error('INVALID_DISCOVERY_MESSAGE');
 const source=await db.prepare('SELECT id,enabled FROM discovery_sources WHERE id=?').bind(sourceId).first();
 if(!source||!source.enabled)return {status:'ignored'};
 const url=normalizeUrl(item.url),title=cleanText(item.title,240),summary=cleanText(item.summary||'',500);
 if(!title)return {status:'ignored'};
 const external_id=cleanText(item.external_id||'',300)||null,published_at=safeDate(item.published_at),
 content_fingerprint=await fingerprint({title,url,published_at}),classification=classify({title,summary});
 const result=await db.prepare(
  'INSERT INTO discovery_items(id,source_id,external_id,url,title,summary,published_at,content_fingerprint,classification,classification_confidence,status) VALUES(?,?,?,?,?,?,?,?,?,?,'+"'pending_review'"+') ON CONFLICT DO NOTHING'
 ).bind(crypto.randomUUID(),sourceId,external_id,url,title,summary,published_at,content_fingerprint,classification.classification,classification.classification_confidence).run();
 if(result.meta?.changes===1){
  await db.prepare('UPDATE discovery_sources SET last_item_at=CURRENT_TIMESTAMP,new_item_count=new_item_count+1 WHERE id=?').bind(sourceId).run();
  return {status:'created'};
 }
 const existing=await db.prepare('SELECT id FROM discovery_items WHERE (source_id=? AND external_id=? AND external_id IS NOT NULL) OR url=? OR content_fingerprint=? LIMIT 1').bind(sourceId,external_id,url,content_fingerprint).first();
 if(existing){await db.prepare('UPDATE discovery_items SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?').bind(existing.id).run();return {status:'existing',id:existing.id};}
 return {status:'ignored'};
}
