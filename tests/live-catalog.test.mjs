import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {api} from '../src/api.mjs';
import {projects as bundledProjects} from '../dist/catalog.js';

const request=path=>new Request('https://airdrop-museum.example'+path);

test('no fictional projects are shipped in the bundled catalog',()=>{
 assert.deepEqual(bundledProjects,[]);
 const homepage=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(homepage,/import\s*\{projects\s+as\s+demos\}/);
 assert.match(homepage,/fetch\('\/api\/v1\/airdrops'/);
});

test('projects API fails closed when live D1 is missing',async()=>{
 const response=await api(request('/api/projects'),{});
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,'DATABASE_UNAVAILABLE');
});

test('projects API returns only reviewed, public D1 source records',async()=>{
 const record={id:'real-campaign',payload:JSON.stringify({
  name:'Reviewed campaign',visibility:'public',tasks:['Review the official terms'],
  official_urls:['https://example.org/official'],
 }),source_url:'https://example.org/official',review_status:'approved',updated_at:'2026-11-17T00:00:00Z'};
 let sqlText='';
 const db={prepare(sql){sqlText=sql;return {async all(){return {results:[record]}}}}};
 const response=await api(request('/api/projects'),{DB:db});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.mode,'live');
 assert.equal(data.projects.length,1);
 assert.equal(data.projects[0].name,'Reviewed campaign');
 assert.equal(data.projects[0].source,'https://example.org/official');
 assert.match(sqlText,/review_status NOT IN/);
 assert.match(sqlText,/visibility/);
 assert.match(sqlText,/source_url LIKE/);
 assert.doesNotMatch(JSON.stringify(data),/Prism Network|Orbit Protocol|Nova Worlds/);
});

test('live project inventory returns an empty collection rather than demo entries',async()=>{
 const db={prepare(){return {async all(){return {results:[]}}}}};
 const response=await api(request('/api/projects'),{DB:db});
 const data=await response.json();
 assert.equal(response.status,200);
 assert.deepEqual(data,{mode:'live',projects:[]});
});
