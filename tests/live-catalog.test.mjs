import test from 'node:test';
import assert from 'node:assert/strict';
import {projects,projectFromCampaign} from '../dist/catalog.js';
import {api} from '../src/api.mjs';
import {normalize,backup} from '../dist/model.js';

const row = {
  id:'layer3-cube-research',
  name:'Layer3 — CUBE & Activations (riset)',
  chain:'["eip155:8453","eip155:42161"]',
  category:'nft',
  status:'speculative',
  official_urls:'["https://docs.layer3.xyz/"]',
  risk_flags:'[]',
  source_evidence:'[]',
  description:'Dokumentasi aktivitas, bukan konfirmasi airdrop token baru.',
  eligibility_rules:JSON.stringify([{id:'review',rule_type:'custom_manual_task',parameters:{instruction:'Periksa syarat Activation di situs resmi'}}]),
  updated_at:'2026-11-17T00:00:00.000Z'
};

test('bundled catalogue contains no fictional entries',()=>{
  assert.deepEqual(projects,[]);
});

test('live D1 campaign is mapped to a source-aware research project',()=>{
  const p=projectFromCampaign(row);
  assert.equal(p.id,'campaign-layer3-cube-research');
  assert.equal(p.sourceId,row.id);
  assert.equal(p.name,row.name);
  assert.equal(p.category,'NFT');
  assert.equal(p.chain,'Base, Arbitrum');
  assert.equal(p.website,'https://docs.layer3.xyz/');
  assert.equal(p.status,'speculative');
  assert.equal(p.custom,false);
  assert.equal(p.tasks[0],'Periksa syarat Activation di situs resmi');
});

test('untrusted campaign fields never create a javascript URL or HTML markup',()=>{
  const p=projectFromCampaign({...row,official_urls:'["javascript:alert(1)"]',eligibility_rules:'not-json'});
  assert.equal(p.website,'');
  assert.deepEqual(p.official_urls,[]);
  assert.equal(p.tasks.length,1);
  assert.equal(projectFromCampaign({...row,id:'../invalid'}),null);
});

test('GET /api/projects lists real D1 campaigns with no hardcoded fallback',async()=>{
  const env={DB:{prepare(sql){
    assert.match(sql,/FROM campaigns/);
    return {all:async()=>({results:[row]})};
  }}};
  const response=await api(new Request('https://example.test/api/projects'),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.mode,'live');
  assert.equal(body.projects.length,1);
  assert.equal(body.projects[0].sourceId,row.id);
  assert.equal(body.projects[0].status,'speculative');
});

test('GET /api/projects without D1 fails closed rather than serving samples',async()=>{
  const response=await api(new Request('https://example.test/api/projects'),{});
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.error,'DATABASE_UNAVAILABLE');
});

test('GET /api/health reports live catalogue only with a ready D1',async()=>{
  const env={DB:{prepare(sql){
    assert.match(sql,/SELECT version FROM am_core_schema/);
    return {first:async()=>({version:17})};
  }}};
  const response=await api(new Request('https://example.test/api/health'),env);
  const body=await response.json();
  assert.equal(body.catalogMode,'live');
  assert.equal(body.ok,true);
});

test('private user state retains real D1 campaign bookmark and manual checklist',()=>{
  const p=projectFromCampaign(row);
  const state=normalize({saved:[p.id],done:{[p.id+':0']:true}},[p]);
  assert.deepEqual(state.saved,[p.id]);
  assert.equal(state.done[p.id+':0'],true);
  const roundtrip=backup(JSON.stringify(state),[p]);
  assert.equal(roundtrip.saved[0],p.id);
  assert.equal(roundtrip.done[p.id+':0'],true);
});
