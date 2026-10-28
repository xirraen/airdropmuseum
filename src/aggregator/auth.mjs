import {adminAuth} from '../admin/auth.ts';
import {audit} from '../admin/auditService.ts';
import {platformUser} from '../platform-api.mjs';
export async function aggregatorUser(request,env){
 const user=await platformUser(request,env,false);
 if(!user)throw Object.assign(Error('LOGIN_REQUIRED'),{status:401});
 if(!/^tg:[0-9]+$/.test(user.id))throw Object.assign(Error('TELEGRAM_IDENTITY_REQUIRED'),{status:403});
 if(!['GET','HEAD'].includes(request.method)&&request.headers.get('Origin')!==new URL(request.url).origin)
  throw Object.assign(Error('ORIGIN_NOT_ALLOWED'),{status:403});
 return user.id;
}
export async function aggregatorAdmin(request,env,permission,action,target='aggregator'){
 const actor=await adminAuth(request,env,permission);
 // Persist the authorization/intent before a mutation or privileged backup read.
 // This record does not claim the operation completed.
 await audit(env,request,actor,action+'.requested','aggregator',target);
 return actor;
}
