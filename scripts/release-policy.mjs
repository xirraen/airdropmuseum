import {execFileSync} from 'node:child_process';

const SHA=/^[0-9a-f]{40}$/;
const STYLES=new Set([
 'dist/style.css','dist/museum-ui.css','dist/mini-ui.css',
 'dist/platform.css','dist/aggregator.css','dist/aggregator-modern.css',
 'dist/portfolio-intelligence.css','dist/discovery.css','dist/trust.css',
 'dist/admin.css','dist/decision-lab.css'
]);

export function parseNameStatus(raw){
 const fields=raw.split('\0').filter(Boolean),changes=[];
 if(fields.length%2)throw Error('RELEASE_DIFF_INVALID');
 for(let i=0;i<fields.length;i+=2){
  const status=fields[i],path=fields[i+1];
  if(!/^[ACDMRTUXB?][0-9]*$/.test(status)||!path||path.startsWith('/')||path.includes('..'))
   throw Error('RELEASE_DIFF_INVALID');
  changes.push({status,path});
 }
 return changes;
}

export function classifyReleaseChanges(changes){
 const styles=[],support=[],blocked=[];
 for(const {status,path} of changes){
  if(STYLES.has(path)&&status==='M')styles.push(path);
  else if((path.startsWith('docs/')||path.startsWith('tests/'))&&['A','M'].includes(status))support.push(path);
  else blocked.push({status,path});
 }
 const tier=styles.length>0&&blocked.length===0?'presentation':'full';
 return {tier,changed_files:changes.length,presentation_assets:styles,nonruntime_files:support,
  blockers:blocked,reason:tier==='presentation'?'VERIFIED_STYLE_ONLY_DIFF':
   styles.length===0&&blocked.length===0?'NO_PRESENTATION_ASSETS':'EXECUTABLE_OR_CONFIG_CHANGE'};
}

export function localReleaseDiff(base,head){
 if(!SHA.test(base)||!SHA.test(head))throw Error('RELEASE_COMMIT_INVALID');
 if(base===head)throw Error('RELEASE_NO_CHANGES');
 try{execFileSync('git',['merge-base','--is-ancestor',base,head],{stdio:'ignore'});}
 catch{throw Error('PRODUCTION_BASE_NOT_ANCESTOR');}
 let raw;
 try{raw=execFileSync('git',['diff','--no-renames','--name-status','-z',base,head],{encoding:'utf8',maxBuffer:8*1024*1024});}
 catch{throw Error('RELEASE_DIFF_UNAVAILABLE');}
 return classifyReleaseChanges(parseNameStatus(raw));
}

export async function getLiveReleaseBaseline(token,{fetcher=fetch}={}){
 if(!token)throw Error('CLOUDFLARE_TOKEN_REQUIRED');
 const origin='https://api.cloudflare.com/client/v4/accounts/9880cf2cc57c2096f8c3ae253d9852e6/workers/scripts/airdrop-museum';
 const get=async path=>{
  const res=await fetcher(origin+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('CLOUDFLARE_RELEASE_READ_FAILED');
  const json=await res.json();
  if(!json.success)throw Error('CLOUDFLARE_RELEASE_READ_FAILED');
  return json.result;
 };
 const deployments=await get('/deployments');
 const current=deployments?.deployments?.[0];
 if(!current?.id||current.versions?.length!==1||Number(current.versions[0].percentage)!==100)
  throw Error('NONEXCLUSIVE_PRODUCTION_TRAFFIC');
 const versionId=current.versions[0].version_id;
 if(!versionId)throw Error('PRODUCTION_VERSION_UNKNOWN');
 const version=await get('/versions/'+encodeURIComponent(versionId));
 const message=version?.annotations?.['workers/message']||'';
 const matched=/Verified main ([0-9a-f]{40}); artifact ([0-9a-f]{64})/.exec(message);
 if(!matched)throw Error('PRODUCTION_BASELINE_UNATTESTED');
 return {commit:matched[1],artifact_sha256:matched[2],deployment_id:current.id,version_id:versionId,
  deployed_at:current.created_on};
}
