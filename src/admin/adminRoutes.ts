import {adminAuth} from './auth.ts';
import {fail,AdminError,json} from './types.ts';
import {audit,logs} from './auditService.ts';
import {campaignsRoute} from './campaignAdminService.ts';
import {discoveryRoute} from './discoveryAdminService.ts';
import {conflictsRoute} from './conflictAdminService.ts';
import {keysRoute} from './apiKeyAdminService.ts';
import {webhooksAdminRoute} from './webhookAdminService.ts';
import {flagsRoute} from './featureFlagService.ts';
import {settingsRoute,setMaintenance,maintenance} from './systemSettingsService.ts';
import {health} from './healthService.ts';
function permission(path,method){
 const read=method==='GET'||method==='HEAD';
 if(path==='/api/admin/session'||path==='/api/admin/overview')return 'dashboard.read';
 if(path==='/api/admin/audit')return 'audit.read';
 if(path==='/api/admin/health')return 'health.read';
 if(path==='/api/admin/maintenance-mode')return 'settings.write';
 if(path.startsWith('/api/admin/system-settings'))return read?'settings.read':'settings.write';
 if(path.startsWith('/api/admin/feature-flags'))return read?'flags.read':'flags.write';
 if(path.startsWith('/api/admin/api-keys'))return read?'keys.read':'keys.write';
 if(path.startsWith('/api/admin/webhooks'))return read?'webhooks.read':'webhooks.write';
 if(path.startsWith('/api/admin/conflicts'))return read?'conflict.read':'conflict.review';
 if(path.startsWith('/api/admin/discovery'))return path.endsWith('/bulk-preview')||path.endsWith('/bulk-action')?'discovery.bulk':read?'discovery.read':'discovery.review';
 if(path.startsWith('/api/admin/campaigns'))return path.endsWith('/bulk-preview')||path.endsWith('/bulk-action')?'campaign.bulk':read?'campaign.read':'campaign.limited';
 fail('NOT_FOUND',404);
}
export async function adminRoutes(request,env,ctx){
 try{
  if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
  if(!(await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=9').first()))fail('ADMIN_MIGRATION_REQUIRED',503);
  const path=new URL(request.url).pathname,m=request.method,perm=permission(path,m);
  if(!['GET','HEAD','POST','PUT','DELETE'].includes(m))fail('METHOD_NOT_ALLOWED',405);
  // Modifier permissions are restricted at the handler as well as here.
  let actor;
  try{actor=await adminAuth(request,env,perm);}catch(error){if(perm==='campaign.limited'&&error?.message==='PERMISSION_DENIED')actor=await adminAuth(request,env,'campaign.write');else throw error;}
  const ro=(m==='GET'||m==='HEAD');
  let result;
  if(path==='/api/admin/session'&&ro)result={role:actor.role,admin_scope:actor.admin_scope,csrf_token:actor.csrf};
  else if(path==='/api/admin/overview'&&ro){
   const counts=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) n FROM am_core_exhibits').first(),
    env.DB.prepare("SELECT COUNT(*) n FROM discovery_items WHERE status='pending_review'").first(),
    env.DB.prepare("SELECT COUNT(*) n FROM source_conflicts WHERE status='open'").first(),
    env.DB.prepare("SELECT COUNT(*) n FROM webhook_deliveries WHERE status IN ('queued','retrying')").first()
   ]);
   result={campaigns:counts[0].n,discovery_pending:counts[1].n,conflicts_open:counts[2].n,webhook_pending:counts[3].n,mode:await maintenance(env)};
  }
  else if(path==='/api/admin/audit'&&ro)result={entries:await logs(env.DB,new URL(request.url).searchParams)};
  else if(path==='/api/admin/health'&&ro)result=await health(env);
  else if(path==='/api/admin/maintenance-mode'&&m==='POST')result=await setMaintenance(request,env,actor);
  else if(path.startsWith('/api/admin/system-settings'))result=await settingsRoute(request,env,actor);
  else if(path.startsWith('/api/admin/campaigns'))result=await campaignsRoute(request,env,actor);
  else if(path.startsWith('/api/admin/discovery'))result=await discoveryRoute(request,env,actor);
  else if(path.startsWith('/api/admin/conflicts'))result=await conflictsRoute(request,env,actor);
  else if(path.startsWith('/api/admin/api-keys'))result=await keysRoute(request,env,actor);
  else if(path.startsWith('/api/admin/webhooks'))result=await webhooksAdminRoute(request,env,actor);
  else if(path.startsWith('/api/admin/feature-flags'))result=await flagsRoute(request,env,actor);
  else fail('NOT_FOUND',404);
  if(ro)await audit(env,request,actor,'read.'+path,'route',path);
  return json(result,path==='/api/admin/api-keys'&&m==='POST'?201:200);
 }catch(e){
  const status=e instanceof AdminError?e.status:500;
  return json({error:e instanceof AdminError?e.message:'ADMIN_SERVICE_UNAVAILABLE'},status,status===429?{'Retry-After':'60'}:{});
 }
}
