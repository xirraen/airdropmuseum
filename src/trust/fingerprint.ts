import {FIELDS,DATE_FIELDS,metadata} from './types.ts';
import {normalizeTrustUrl} from './domainPolicy.ts';
export async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function canonicalValue(field,value){
 if(value===null||value===undefined)return null;
 if(field==='official_urls'){const urls=Array.isArray(value)?value:[];return [...new Set(urls.map(x=>{try{return normalizeTrustUrl(x);}catch{return null;}}).filter(Boolean))].sort();}
 if(DATE_FIELDS.has(field)){const time=Date.parse(String(value));return Number.isFinite(time)?new Date(time).toISOString():String(value).trim();}
 if(field==='token_contract'||field==='claim_contract')return String(value).trim().toLowerCase();
 if(field==='eligibility_rules'){try{const json=typeof value==='string'?JSON.parse(value):value;return stableJSON(json);}catch{}}
 return String(value).trim().replace(/\s+/g,' ').toLowerCase();
}
export function stableJSON(value){if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function sourceFingerprint(raw){const data=metadata(raw);return sha256(stableJSON(Object.fromEntries(FIELDS.filter(k=>data[k]!==undefined).map(k=>[k,canonicalValue(k,data[k])]))));}
export async function conflictFingerprint(campaign,field,a,b){return sha256(stableJSON([campaign,field,[a.source_id,canonicalValue(field,a.value)],[b.source_id,canonicalValue(field,b.value)]].sort((x,y)=>String(x).localeCompare(String(y)))));}
