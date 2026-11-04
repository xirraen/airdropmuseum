import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
const source='9880cf2cc57c2096f8c3ae253d9852e6',target='658ab460492b61f87b42ba96a813f176',db='00000000-0000-4000-8000-000000000099';
test('erasure replay accepts schema 17 and keeps source ledger reads separate from isolated target account',async()=>{
 const requests=[];let schema=17;
 const server=http.createServer(async(req,res)=>{
  const parts=[];for await(const chunk of req)parts.push(chunk);const body=parts.length?JSON.parse(Buffer.concat(parts)):{};requests.push({path:req.url,method:req.method,body});
  let result=[];
  if(req.url.includes('/query'))result=[{success:true,results:body.sql?.includes('MAX(version)')?[{version:req.url.includes('/'+db+'/')?schema:5}]:[]}];
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true,result,result_info:{cursor:''}}));
 });
 await new Promise(resolve=>server.listen(8792,'127.0.0.1',resolve));
 const run=()=>new Promise(resolve=>{let output='';const p=spawn(process.execPath,['--experimental-strip-types','scripts/reapply-journal-erasure.mjs'],{env:{...process.env,RESTORE_STAGING_ACCOUNT_ID:target,RESTORE_STAGING_D1_ID:db,CLOUDFLARE_API_TOKEN:'local-connector-transport-marker',CLOUDFLARE_API_BASE_URL:'http://127.0.0.1:8792'}});p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('exit',code=>resolve({code,output}));});
 try{
  let r=await run();assert.equal(r.code,0,r.output);assert.match(r.output,/PASS erasure ledger replay/);
  assert.ok(requests.some(r=>r.path.includes('/accounts/'+target+'/d1/database/'+db)));
  assert.ok(requests.some(r=>r.path.includes('/accounts/'+source+'/storage/kv/')));
  assert.ok(!requests.some(r=>r.path.includes('/accounts/'+source+'/d1/database/'+db)));
  schema=16;r=await run();assert.notEqual(r.code,0);assert.match(r.output,/PRIVACY_RESTORE_MIGRATION_REQUIRED/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
