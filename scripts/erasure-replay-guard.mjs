/** Ensure production erasure receipts are unchanged across a restore replay.
 * Only a complete, synced, stable source ledger may authorize recovery evidence.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function assertStableErasureSnapshot(before,after){
 const canonical=rows=>{
  if(!Array.isArray(rows))throw Error('ERASURE_SOURCE_SNAPSHOT_INVALID');
  const ids=new Set();
  const serialized=[];
  for(const row of rows){
   if(!row||typeof row.request_id!=='string'||!UUID.test(row.request_id)||
      row.ledger_synced!==1||ids.has(row.request_id.toLowerCase()))
    throw Error('ERASURE_SOURCE_SNAPSHOT_INVALID');
   const id=row.request_id.toLowerCase();
   ids.add(id);
   serialized.push(id);
  }
  return serialized.sort();
 };
 const a=canonical(before),b=canonical(after);
 if(a.length!==b.length||a.some((id,i)=>id!==b[i]))
  throw Error('ERASURE_SOURCE_CHANGED_DURING_REPLAY');
 return a.length;
}
