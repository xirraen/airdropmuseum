import {iso} from '../dist/aggregator-core.js';
import {allowed,readJSON} from './aggregator-providers.mjs';
import {listCampaigns,statement as s} from './aggregator-store.mjs';
import {digest,enqueueAlert} from './aggregator-jobs.mjs';
export function sourceText(body){return String(body).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
// Observe only allowed sources, retaining content fingerprints and short metadata, never full articles.
export async function monitorSources(env,fetcher=fetch){
 if(env.AGGREGATOR_MONITOR_SOURCES!=='1')return {checked:0,changed:0,unavailable:0};
 const sources=(await listCampaigns(env.DB)).filter(c=>c.status!=='archived').flatMap(c=>c.official_urls.slice(0,3).map(url=>({c,url})));
 const cursor=Number((await s(env.DB,'SELECT value FROM aggregator_cursor WHERE name=?','source-monitor-offset').first())?.value||0),batch=sources.slice(cursor,cursor+10);let checked=0,changed=0,unavailable=0;
 for(const {c,url} of batch){try{
  const endpoint=allowed(url,env),body=await readJSON(endpoint,{fetcher,asText:true,headers:{Accept:'text/markdown, text/html;q=0.9, application/json;q=0.8'}}),text=sourceText(body);
  if(text.length<80||/^(?:page not found|access denied|just a moment|verify you are human)/i.test(text))throw Error('SOURCE_UNAVAILABLE');
  const fingerprint=await digest(text),key='official-source:'+c.id+':'+await digest(url),old=await s(env.DB,'SELECT value FROM aggregator_cursor WHERE name=?',key).first(),at=iso();
  const previous=old?JSON.parse(old.value):null;
  if(previous?.hash!==fingerprint){
   const event=previous?'source_changed':'source_baseline';
   const note=previous?'Isi teks sumber resmi berubah. Status dan aturan belum ditinjau ulang; periksa manual.':'Baseline fingerprint sumber resmi disimpan; ini pemeriksaan ketersediaan, bukan bukti eligibility wallet.';
   await env.DB.batch([...(previous?[s(env.DB,'UPDATE campaigns SET risk_flags=?,updated_at=? WHERE id=?',JSON.stringify([...new Set([...c.risk_flags,'source_changed_review_required'])]),at,c.id)]:[]),s(env.DB,'INSERT INTO campaign_sources(id,campaign_id,source_url,source_type,captured_at,note,verified_by,event_type,content_hash) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),c.id,url,'official_docs',at,note,'system',event,fingerprint),s(env.DB,'INSERT INTO aggregator_cursor(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',key,JSON.stringify({hash:fingerprint,checked_at:at}))]);
   if(previous){await enqueueAlert(env,c,'source_changed',fingerprint);changed++;}
  }
  checked++;
 }catch{
  unavailable++;const key='source-unavailable:'+c.id+':'+await digest(url)+':'+iso().slice(0,10),seen=await s(env.DB,'SELECT value FROM aggregator_cursor WHERE name=?',key).first();if(!seen){await env.DB.batch([s(env.DB,'INSERT INTO campaign_sources(id,campaign_id,source_url,source_type,captured_at,note,verified_by,event_type) VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),c.id,url,'official_docs',iso(),'Sumber tidak dapat dibaca pada pemeriksaan ini. Status lama tidak dianggap telah diverifikasi ulang.','system','source_unavailable'),s(env.DB,'INSERT OR IGNORE INTO aggregator_cursor(name,value) VALUES(?,?)',key,'1')]);}
 }}
 await s(env.DB,'INSERT INTO aggregator_cursor(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value','source-monitor-offset',String(cursor+10>=sources.length?0:cursor+10)).run();
 return {checked,changed,unavailable};
}
