import {cleanText,normalizeUrl,safeDate,DiscoveryError} from './types.ts';
const MAX_ITEMS=40;
function tag(text,name){
 const escaped=name.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
 const regex=new RegExp('<(?:[\\w.-]+:)?'+escaped+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+escaped+'\\s*>','i');
 return regex.exec(text)?.[1]||'';
}
function attr(text,name){
 const m=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i').exec(text);
 return m?(m[1]??m[2]):'';
}
function atomLink(text){
 const tags=text.match(/<link\b[^>]*\/?>/gi)||[];
 for(const link of tags)if(!attr(link,'rel')||attr(link,'rel')==='alternate')return attr(link,'href');
 return '';
}
function canonical(value,base){
 try{return normalizeUrl(new URL(cleanText(value,2048),base).href);}catch{return '';}
}
export function parseFeed(text,type,feedUrl){
 if(typeof text!=='string'||text.length>524288)throw new DiscoveryError('FEED_TOO_LARGE',413);
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new DiscoveryError('UNSAFE_XML');
 if(type==='json_feed'){
  let data;try{data=JSON.parse(text);}catch{throw new DiscoveryError('INVALID_JSON_FEED');}
  if(!data||typeof data.version!=='string'||!data.version.startsWith('https://jsonfeed.org/version/1')||!Array.isArray(data.items))throw new DiscoveryError('INVALID_JSON_FEED');
  return data.items.slice(0,MAX_ITEMS).map(row=>({
   external_id:cleanText(String(row?.id??''),300)||null,url:canonical(row?.url||row?.external_url||'',feedUrl),
   title:cleanText(row?.title||'',240),summary:cleanText(row?.summary||'',500),
   published_at:safeDate(row?.date_published||row?.date_modified)
  })).filter(row=>row.url&&row.title);
 }
 if(!['rss','atom'].includes(type))throw new DiscoveryError('UNSUPPORTED_FEED');
 const isRss=type==='rss';
 if(isRss?!/<rss\b/i.test(text):!/<feed\b/i.test(text))throw new DiscoveryError('INVALID_XML_FEED');
 const matches=[...text.matchAll(isRss?/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi:/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi)].slice(0,MAX_ITEMS);
 return matches.map(m=>{
  const block=m[1],link=isRss?tag(block,'link'):atomLink(block);
  return {external_id:cleanText(tag(block,isRss?'guid':'id'),300)||null,
   url:canonical(link,feedUrl),title:cleanText(tag(block,'title'),240),
   summary:cleanText(tag(block,isRss?'description':'summary')||tag(block,'content'),500),
   published_at:safeDate(tag(block,isRss?'pubDate':'published')||tag(block,'updated'))};
 }).filter(row=>row.url&&row.title);
}
