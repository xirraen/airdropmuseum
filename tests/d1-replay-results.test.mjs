import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedD1Results} from '../scripts/d1-replay-results.mjs';
const ok=(results=[],meta={changed_db:false,rows_written:0})=>({success:true,results,meta});

test('accept exact successful D1 read-only response',()=>{
 const payload={success:true,result:[ok([{version:17}])]};
 assert.deepEqual(validatedD1Results(payload,1,{readOnly:true}),payload.result);
});
test('reject failed D1 statement inside a successful API envelope',()=>{
 assert.throws(()=>validatedD1Results({success:true,result:[{...ok(),success:false}]},1,{readOnly:true}),/RESTORE_D1_QUERY_FAILED/);
});
test('reject missing or truncated batch results',()=>{
 for(const value of [null,{success:true,result:[]},{success:true,result:[ok()]}])
  assert.throws(()=>validatedD1Results(value,2),/RESTORE_D1_QUERY_FAILED/);
});
test('reject read-only operations that report writes',()=>{
 for(const meta of [{changed_db:true,rows_written:0},{changed_db:false,rows_written:1}])
  assert.throws(()=>validatedD1Results({success:true,result:[ok([],meta)]},1,{readOnly:true}),/RESTORE_D1_QUERY_FAILED/);
});
test('require every batch statement to succeed',()=>{
 const passed={success:true,result:[ok(),ok()]};
 assert.deepEqual(validatedD1Results(passed,2),passed.result);
 assert.throws(()=>validatedD1Results({success:true,result:[ok(),{...ok(),success:false}]},2),/RESTORE_D1_QUERY_FAILED/);
});
test('reject malformed response rows',()=>{
 for(const row of [null,{success:true},{success:'true',results:[]},{success:true,results:null}])
  assert.throws(()=>validatedD1Results({success:true,result:[row]}),/RESTORE_D1_QUERY_FAILED/);
});
