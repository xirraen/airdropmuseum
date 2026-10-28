import test from 'node:test';
import assert from 'node:assert/strict';
import {withSecurity} from '../src/security/gateway.ts';

test('HTML allows Telegram embedding while retaining CSP restrictions',async()=>{
 const response=await withSecurity(new Request('https://museum.example/'),{},null,
  async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}));
 const policy=response.headers.get('Content-Security-Policy');
 assert.match(policy,/frame-ancestors 'self' https:\/\/web\.telegram\.org https:\/\/\*\.telegram\.org;/);
 assert.match(policy,/object-src 'none'/);
 assert.equal(response.headers.get('X-Frame-Options'),null);
});

test('JSON remains unembeddable',async()=>{
 const response=await withSecurity(new Request('https://museum.example/'),{},null,
  async()=>Response.json({ok:true}));
 assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'none'; frame-ancestors 'none'");
 assert.equal(response.headers.get('X-Frame-Options'),'DENY');
});

test('oversized streamed body without Content-Length returns 413 promptly',async()=>{
 let invoked=false;
 const request=new Request('https://museum.example/api/me/state',{
  method:'POST',body:new ReadableStream({start(c){c.enqueue(new Uint8Array(1048577));c.close();}}),duplex:'half'
 });
 const response=await Promise.race([
  withSecurity(request,{},null,async()=>{invoked=true;return Response.json({});}),
  new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('body limit stalled')),1000);timer.unref();})
 ]);
 assert.equal(response.status,413);
 assert.equal(invoked,false);
 await request.body.cancel();
});
