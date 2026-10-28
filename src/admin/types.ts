export const ROLES=['super_admin','admin','moderator','readonly'];
export const PERMISSIONS={
 super_admin:['*'],
 admin:['campaign.read','campaign.write','campaign.bulk','discovery.read','discovery.review','discovery.bulk','conflict.read','conflict.review','keys.read','keys.write','webhooks.read','webhooks.write','flags.read','flags.write','settings.read','audit.read','health.read'],
 moderator:['campaign.read','campaign.limited','discovery.read','discovery.review','conflict.read','conflict.review','audit.read','health.read'],
 readonly:['dashboard.read','campaign.read','discovery.read','conflict.read','keys.read','webhooks.read','flags.read','settings.read','audit.read','health.read']
};
export class AdminError extends Error{constructor(code,status=400){super(code);this.status=status;}}
export const fail=(code,status=400)=>{throw new AdminError(code,status);};
export const sql=(db,q,...a)=>db.prepare(q).bind(...a);
export const text=(v,max=200)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f<>]/g,' ').trim().slice(0,max):'';
export const uuid=(v)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(v);
export const json=(v,status=200,extra={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...extra}});
export async function hash(v){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(data)).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function safeJson(v,fallback={}){try{const x=JSON.parse(v);return x===null?fallback:x;}catch{return fallback;}}
export async function body(request,max=16384){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
 let total=0,out='';const decoder=new TextDecoder(),reader=request.body?.getReader();if(!reader)fail('JSON_REQUIRED',415);
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();fail('BODY_TOO_LARGE',413);}out+=decoder.decode(value,{stream:true});}
 try{const o=JSON.parse(out+decoder.decode());if(!o||Array.isArray(o)||typeof o!=='object')fail('INVALID_BODY');return o;}catch(e){if(e instanceof AdminError)throw e;fail('INVALID_JSON');}
}
export function listIds(v){if(!Array.isArray(v)||!v.length||v.length>50||v.some(x=>!uuid(x)))fail('INVALID_IDS');return [...new Set(v)];}
export function bool(v){if(typeof v!=='boolean')fail('INVALID_BOOLEAN');return v?1:0;}
export function select(input,fields){const out={};for(const key of fields)if(input&&input[key]!==undefined)out[key]=input[key];return out;}
