/**
 * Read-only forensic comparison: live Cloudflare Worker package vs an exact Git
 * candidate. Matching downloaded script content is NOT immutable-version
 * attestation, a release approval, or a substitute for full release gates.
 *
 * Usage: node scripts/release-forensics.mjs <40-char-commit> [--built-root <path>]
 */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const SHA=/^[0-9a-f]{40}$/;
const API='https://api.cloudflare.com/client/v4/accounts/9880cf2cc57c2096f8c3ae253d9852e6/workers/scripts/airdrop-museum';
const GENERATED=new Set(['src/worker.mjs','dist/aggregator-ui-bundle.js']);
const MAX_SCRIPT=16*1024*1024;
const MAX_ASSET=12*1024*1024;

export function gitBlobSha(content){
 const bytes=Buffer.isBuffer(content)?content:Buffer.from(content,'utf8');
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}

export function parseWorkerSourceMap(multipart){
 if(typeof multipart!=='string'||multipart.length>MAX_SCRIPT||!multipart.startsWith('--'))
  throw Error('WORKER_CONTENT_INVALID');
 const firstEnd=multipart.indexOf('\r\n');
 if(firstEnd<4||firstEnd>256)throw Error('WORKER_CONTENT_INVALID');
 const boundary=multipart.slice(0,firstEnd);
 const parts=multipart.split(boundary).filter(x=>x.includes('Content-Disposition:'));
 const source=parts.find(p=>/name="worker\.js\.map"/.test(p.slice(0,300)));
 if(!source)throw Error('WORKER_SOURCE_MAP_MISSING');
 const separator=source.indexOf('\r\n\r\n');
 if(separator<0)throw Error('WORKER_SOURCE_MAP_INVALID');
 let map;
 try{map=JSON.parse(source.slice(separator+4).trim());}
 catch{throw Error('WORKER_SOURCE_MAP_INVALID');}
 if(map?.version!==3||!Array.isArray(map.sources)||!Array.isArray(map.sourcesContent)||
    map.sources.length!==map.sourcesContent.length||map.sources.length>4000)
  throw Error('WORKER_SOURCE_MAP_INVALID');
 return map;
}

export function sourceAssets(workerText){
 if(typeof workerText!=='string')throw Error('GENERATED_WORKER_SOURCE_MISSING');
 const marker='export const assets=',start=workerText.indexOf(marker);
 const end=workerText.indexOf(';\nexport default',start+marker.length);
 if(start<0||end<=start||end-start>MAX_SCRIPT)throw Error('GENERATED_ASSETS_UNAVAILABLE');
 let value;
 try{value=JSON.parse(workerText.slice(start+marker.length,end));}
 catch{throw Error('GENERATED_ASSETS_INVALID');}
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>500)
  throw Error('GENERATED_ASSETS_INVALID');
 return value;
}

function assetBytes(value){
 if(typeof value?.body!=='string'||value.body.length>MAX_ASSET*2||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.body))
  throw Error('EMBEDDED_ASSET_INVALID');
 const compressed=Buffer.from(value.body,'base64');
 if(value.encoding==='gzip')return gunzipSync(compressed,{maxOutputLength:MAX_ASSET});
 if(value.encoding===null||value.encoding===undefined||value.encoding==='identity')return compressed;
 throw Error('EMBEDDED_ASSET_ENCODING_UNSUPPORTED');
}

export function compareSourceMap(map,tracked,{builtFile}={}){
 const paths=[],assets=[],untracked=[],unavailable=[];
 const seen=new Set();
 for(let i=0;i<map.sources.length;i++){
  const path=map.sources[i],content=map.sourcesContent[i];
  if(typeof path!=='string'||path.length>512||seen.has(path))throw Error('SOURCE_MAP_PATH_INVALID');
  seen.add(path);
  if(!Object.hasOwn(tracked,path)){untracked.push(path);continue;}
  if(typeof content!=='string'){unavailable.push(path);continue;}
  const actual=gitBlobSha(content);
  const expected=GENERATED.has(path)&&builtFile?gitBlobSha(builtFile(path)):tracked[path];
  paths.push({path,match:actual===expected});
 }
 const workerIndex=map.sources.indexOf('src/worker.mjs');
 if(workerIndex<0||typeof map.sourcesContent[workerIndex]!=='string')
  throw Error('GENERATED_WORKER_SOURCE_MISSING');
 for(const [uri,value] of Object.entries(sourceAssets(map.sourcesContent[workerIndex]))){
  if(!/^\/[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(uri)||uri.includes('..'))
   throw Error('EMBEDDED_ASSET_PATH_INVALID');
  const path='dist'+uri,bytes=assetBytes(value);
  const expected=GENERATED.has(path)&&builtFile?gitBlobSha(builtFile(path)):tracked[path];
  assets.push({path,match:expected!==undefined&&gitBlobSha(bytes)===expected,
   tracked:expected!==undefined});
 }
 const mismatched=paths.filter(x=>!x.match).map(x=>x.path);
 const mismatchedAssets=assets.filter(x=>x.tracked&&!x.match).map(x=>x.path);
 const missingAssets=assets.filter(x=>!x.tracked).map(x=>x.path);
 return {
  source_map_inputs:map.sources.length,
  tracked_sources_compared:paths.length,
  tracked_sources_matched:paths.length-mismatched.length,
  tracked_source_mismatches:mismatched,
  unavailable_tracked_sources:unavailable,
  external_or_virtual_inputs:untracked.length,
  embedded_assets_compared:assets.length-missingAssets.length,
  embedded_assets_matched:assets.length-missingAssets.length-mismatchedAssets.length,
  embedded_asset_mismatches:mismatchedAssets,
  embedded_assets_missing_from_git:missingAssets
 };
}

function git(args,cwd){
 return execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:24*1024*1024}).trim();
}
export function trackedBlobs(commit,root){
 if(!SHA.test(commit))throw Error('FORENSIC_COMMIT_INVALID');
 const raw=execFileSync('git',['ls-tree','-r','-z',commit],{cwd:root,maxBuffer:24*1024*1024});
 const paths=Object.create(null);
 for(const line of raw.toString('utf8').split('\0').filter(Boolean)){
  const match=/^[0-7]{6} blob ([a-f0-9]{40})\t(.+)$/.exec(line);
  if(match)paths[match[2]]=match[1];
 }
 if(!Object.keys(paths).length)throw Error('FORENSIC_GIT_TREE_EMPTY');
 return paths;
}

function checkBuiltRoot(commit,builtRoot){
 if(!builtRoot)return null;
 const root=realpathSync(resolve(builtRoot));
 if(git(['rev-parse','HEAD'],root)!==commit)throw Error('FORENSIC_BUILD_COMMIT_MISMATCH');
 return path=>{
  if(!GENERATED.has(path))throw Error('FORENSIC_GENERATED_PATH_UNEXPECTED');
  return readFileSync(join(root,path));
 };
}

async function getJson(token,path,fetcher){
 const res=await fetcher(API+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error('CLOUDFLARE_FORENSIC_API_FAILED');
 const result=await res.json();
 if(!result.success)throw Error('CLOUDFLARE_FORENSIC_API_FAILED');
 return result.result;
}
async function currentIdentity(token,fetcher){
 const list=await getJson(token,'/deployments',fetcher);
 const d=list?.deployments?.[0];
 if(!d?.id||d.versions?.length!==1||Number(d.versions[0].percentage)!==100||
    !d.versions[0].version_id)throw Error('FORENSIC_NONEXCLUSIVE_DEPLOYMENT');
 return {deployment_id:d.id,version_id:d.versions[0].version_id,deployed_at:d.created_on};
}

/** No remote writes. Explicitly refuses to promote content matching into attestation. */
export async function runForensics({
 token=process.env.CLOUDFLARE_API_TOKEN,commit,root=process.cwd(),
 builtRoot=null,fetcher=fetch
}={}){
 if(!token)throw Error('CLOUDFLARE_TOKEN_REQUIRED');
 if(!SHA.test(commit||''))throw Error('FORENSIC_COMMIT_INVALID');
 const repo=realpathSync(root);
 const tracked=trackedBlobs(commit,repo),builtFile=checkBuiltRoot(commit,builtRoot);
 const before=await currentIdentity(token,fetcher);
 const version=await getJson(token,'/versions/'+encodeURIComponent(before.version_id),fetcher);
 const content=await fetcher(API+'/content/v2',{
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)
 });
 if(!content.ok)throw Error('WORKER_CONTENT_READ_FAILED');
 const length=Number(content.headers?.get?.('content-length')||0);
 if(length>MAX_SCRIPT)throw Error('WORKER_CONTENT_TOO_LARGE');
 const map=parseWorkerSourceMap(await content.text());
 const comparison=compareSourceMap(map,tracked,{builtFile});
 const after=await currentIdentity(token,fetcher);
 if(before.deployment_id!==after.deployment_id||before.version_id!==after.version_id)
  throw Error('PRODUCTION_DEPLOYMENT_CHANGED_DURING_FORENSICS');
 const mismatches=comparison.tracked_source_mismatches.length+
  comparison.embedded_asset_mismatches.length+
  comparison.embedded_assets_missing_from_git.length+
  comparison.unavailable_tracked_sources.length;
 return {
  status:mismatches?'PARTIAL_OR_MISMATCHED':'CONTENT_MATCH_ONLY_NOT_ATTESTED',
  candidate_commit:commit,
  built_root_provided:!!builtRoot,
  production:{...before,version_annotation_present:!!version?.annotations?.['workers/message']},
  ...comparison,
  release_authorized:false,
  note:'This compares unversioned script content while the 100% deployment ID stays stable. It does not attest immutable Worker version, Git origin, restore evidence or security audit.'
 };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let candidate=process.argv[2],builtRoot=null;
 const args=process.argv.slice(3);
 if(args.length===2&&args[0]==='--built-root')builtRoot=args[1];
 else if(args.length)throw Error('USAGE: release-forensics.mjs <commit> [--built-root <path>]');
 try{
  const result=await runForensics({commit:candidate,builtRoot});
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='CONTENT_MATCH_ONLY_NOT_ATTESTED')process.exitCode=2;
 }catch(error){
  console.error(JSON.stringify({status:'BLOCKED',error:error.message}));
  process.exitCode=2;
 }
}
