import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFromCampaign} from '../dist/catalog.js';
test('campaign mapping faithfully carries review timestamp and source-change flag from D1',()=>{
 const p=projectFromCampaign({
  id:'tracked-mainnet',name:'Tracked Research',chain:['eip155:8453'],category:'nft',status:'speculative',
  official_urls:['https://docs.example.org/read','javascript:alert(1)'],
  eligibility_rules:[{parameters:{instruction:'Review documentation'}}],
  risk_flags:['source_changed_review_required','custom_observer_flag'],
  updated_at:'2026-11-18T10:00:00Z',last_verified_at:'2026-07-01T00:00:00Z',
  claim_deadline_at:'2026-12-31T00:00:00Z',snapshot_at:'2026-06-11T00:00:00Z'
 });
 assert.equal(p.id,'campaign-tracked-mainnet');
 assert.equal(p.chain,'Base');
 assert.deepEqual(p.official_urls,['https://docs.example.org/read']);
 assert.equal(p.lastVerifiedAt,'2026-07-01T00:00:00Z');
 assert.equal(p.claimDeadlineAt,'2026-12-31T00:00:00Z');
 assert.equal(p.snapshotAt,'2026-06-11T00:00:00Z');
 assert.deepEqual(p.riskFlags,['source_changed_review_required','custom_observer_flag']);
});
test('missing or invalid timestamps never become fabricated verification dates',()=>{
 const p=projectFromCampaign({
  id:'missing-review',name:'Unknown Review',chain:['offchain'],status:'rumored',category:'points',
  official_urls:['https://example.org'],eligibility_rules:[],risk_flags:['A',null,333],
  updated_at:'invalid',last_verified_at:null,claim_deadline_at:'not-a-date',snapshot_at:''
 });
 assert.equal(p.lastVerifiedAt,'');
 assert.equal(p.claimDeadlineAt,'');
 assert.equal(p.snapshotAt,'');
 assert.equal(p.updatedAt,'');
 assert.deepEqual(p.riskFlags,['A']);
});
