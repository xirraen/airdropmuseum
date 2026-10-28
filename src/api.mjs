import {platformApi,platformUser} from './platform-api.mjs';
import {discoveryRoutes} from './discovery/discoveryRoutes.ts';
import {rewardsApi} from './rewards-api.mjs';
import {verifyTelegram} from './auth.mjs';
import {backup} from '../dist/model.js';
import {projects} from '../dist/catalog.js';
export const VERSION='1.2.0';
const LIMIT=1000000;
export async function limitedText(request){if(Number(request.headers.get('Content-Length'))>LIMIT)throw Error('BODY_TOO_LARGE');if(!request.body)return '';const reader=request.body.getReader();const chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw Error('BODY_TOO_LARGE')}chunks.push(value)}const out=new Uint8Array(size);let offset=0;for(const v of chunks){out.set(v,offset);offset+=v.byteLength}return new TextDecoder().decode(out)}
export async function api(request,env={},headers={}){
 const url=new URL(request.url),path=url.pathname,head=request.method==='HEAD';
 const json=(body,status=200,extra={})=>new Response(head?null:JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
 const method=allow=>allow.includes(request.method)?null:json({error:'METHOD_NOT_ALLOWED'},405,{Allow:allow.join(', ')});
 try{
 if(path.startsWith('/api/discovery/'))return discoveryRoutes(request,env,headers);
 if(path.startsWith('/api/platform/'))return platformApi(request,env,headers);
 if(path==='/api/v1/airdrops'){if(!['GET','HEAD'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);const rows=await env.DB.prepare('SELECT id,payload,source_url,review_status,updated_at FROM am_core_exhibits WHERE review_status NOT IN (\'draft\',\'pending_review\') ORDER BY updated_at DESC LIMIT 100').all();return json({version:1,airdrops:rows.results.map(r=>({id:r.id,...JSON.parse(r.payload),source:r.source_url,reviewStatus:r.review_status,updatedAt:r.updated_at})),notice:'Source records, not endorsements.'});}
 if(path==='/api/health'||path==='/api/capabilities'){
 const bad=method(['GET','HEAD']);if(bad)return bad;
 let database='unconfigured',rewardSchema=false,platformReady=false;if(env.DB){try{const schema=await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=1').first();database=schema?'ready':'migration_required';platformReady=!!(await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=4').first());rewardSchema=!!(await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=2').first())}catch{database='unavailable'}}
 return json({ok:database==='ready'||database==='unconfigured',version:VERSION,database,catalogMode:'demo',authentication:platformReady||!!env.TELEGRAM_BOT_TOKEN,telegramAuthentication:!!env.TELEGRAM_BOT_TOKEN,walletAuthentication:platformReady,sync:database==='ready'&&(platformReady||!!env.TELEGRAM_BOT_TOKEN),community:platformReady,publicReviews:false,rewards:rewardSchema&&(platformReady||!!env.TELEGRAM_BOT_TOKEN)},database==='unavailable'||database==='migration_required'?503:200);
 }
 if(path==='/api/projects'){const bad=method(['GET','HEAD']);if(bad)return bad;return json({mode:'demo',projects},200,{'Cache-Control':'public, max-age=60'})}
 if(path==='/api/exhibits'){const bad=method(['GET','HEAD']);if(bad)return bad;if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);const result=await env.DB.prepare('SELECT id,payload,source_url,review_status,updated_at FROM am_core_exhibits WHERE review_status NOT IN (\'draft\',\'pending_review\') ORDER BY updated_at DESC LIMIT 100').all();return json({mode:'shared_catalog',exhibits:result.results.map(r=>({id:r.id,data:JSON.parse(r.payload),source:r.source_url,reviewStatus:r.review_status,updatedAt:r.updated_at})),verification:'Per-exhibit evidence required; listing is not an endorsement.'})}
 if(!['/api/me/state','/api/me/rewards','/api/me/referral','/api/me/qualify'].includes(path))return json({error:'NOT_FOUND'},404);
 const bad=method(path==='/api/me/state'?['GET','PUT']:path==='/api/me/rewards'?['GET']:['POST']);if(bad)return bad;
 let cookieUser=null;if(request.headers.get('Cookie')?.includes('am_session=')){cookieUser=await platformUser(request,env,false);if(cookieUser&&request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'ORIGIN_NOT_ALLOWED'},403);}
 if(!cookieUser&&!env.TELEGRAM_BOT_TOKEN)return json({error:'AUTH_NOT_CONFIGURED',message:'Telegram bot secret is required.'},503);
 if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
 const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'ORIGIN_NOT_ALLOWED'},403);
 const user=cookieUser||await verifyTelegram(request.headers.get('X-Telegram-Init-Data'),env.TELEGRAM_BOT_TOKEN);
 if(path!=='/api/me/state')return await rewardsApi(request,env.DB,user,json,limitedText);
 if(request.method==='GET'){const row=await env.DB.prepare('SELECT payload,revision,updated_at FROM am_core_user_state WHERE user_id=?').bind(user.id).first();return json({state:row?JSON.parse(row.payload):null,revision:row?.revision||0,updatedAt:row?.updated_at||null})}
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'JSON_REQUIRED'},415);
 const match=request.headers.get('If-Match');if(!/^"?\d+"?$/.test(match||''))return json({error:'REVISION_REQUIRED'},428);
 const revision=Number(match.replaceAll('"',''));if(!Number.isSafeInteger(revision)||revision<0)return json({error:'INVALID_REVISION'},400);
 let state;try{state=backup(await limitedText(request),projects)}catch(err){if(err.message==='BODY_TOO_LARGE')throw err;return json({error:'INVALID_STATE'},400)}
 const payload=JSON.stringify(state);let result;
 if(revision===0)result=await env.DB.prepare('INSERT INTO am_core_user_state(user_id,payload,revision) VALUES(?,?,1) ON CONFLICT(user_id) DO NOTHING').bind(user.id,payload).run();
 else result=await env.DB.prepare('UPDATE am_core_user_state SET payload=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=?').bind(payload,user.id,revision).run();
 if(result.meta?.changes!==1)return json({error:'REVISION_CONFLICT',message:'Fetch remote state before retrying.'},409);
 return json({saved:true,revision:revision+1});
 }catch(err){if(err.message==='UNAUTHORIZED')return json({error:'UNAUTHORIZED'},401);if(err.message==='BODY_TOO_LARGE')return json({error:'BODY_TOO_LARGE'},413);return json({error:'SERVICE_UNAVAILABLE'},503)}
}
