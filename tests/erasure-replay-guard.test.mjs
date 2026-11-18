import test from 'node:test';
import assert from 'node:assert/strict';
import {assertStableErasureSnapshot} from '../scripts/erasure-replay-guard.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const row=(request_id,ledger_synced=1)=>({request_id,ledger_synced});

test('allow unchanged synchronized receipt inventory in any order',()=>{
 assert.equal(assertStableErasureSnapshot([row(B),row(A)],[row(A),row(B)]),2);
});
test('allow empty inventory for legacy source with no journal ledger',()=>{
 assert.equal(assertStableErasureSnapshot([],[]),0);
});
test('reject newly synchronized erasure while replay was in progress',()=>{
 assert.throws(()=>assertStableErasureSnapshot([row(A)],[row(A),row(C)]),/ERASURE_SOURCE_CHANGED_DURING_REPLAY/);
});
test('reject deleted or rewritten erasure identities',()=>{
 assert.throws(()=>assertStableErasureSnapshot([row(A),row(B)],[row(B)]),/ERASURE_SOURCE_CHANGED_DURING_REPLAY/);
 assert.throws(()=>assertStableErasureSnapshot([row(A)],[row(B)]),/ERASURE_SOURCE_CHANGED_DURING_REPLAY/);
});
test('reject pending or reverted ledger sync on either snapshot',()=>{
 assert.throws(()=>assertStableErasureSnapshot([row(A,0)],[row(A)]),/ERASURE_SOURCE_SNAPSHOT_INVALID/);
 assert.throws(()=>assertStableErasureSnapshot([row(A)],[row(A,0)]),/ERASURE_SOURCE_SNAPSHOT_INVALID/);
});
test('reject duplicate, malformed and non-array source snapshots',()=>{
 for(const input of [[row(A),row(A)],[row('invalid')],null,{},[null]]){
  assert.throws(()=>assertStableErasureSnapshot(input,[]),/ERASURE_SOURCE_SNAPSHOT_INVALID/);
 }
});
