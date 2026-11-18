/** Fail closed when Cloudflare accepts an API request but a D1 statement fails. */
export function validatedD1Results(payload,expectedCount=1,{readOnly=false}={}){
 const results=payload?.result;
 if(payload?.success!==true||!Number.isSafeInteger(expectedCount)||expectedCount<1||
    !Array.isArray(results)||results.length!==expectedCount||
    results.some(row=>row?.success!==true||!Array.isArray(row.results)||
     (readOnly&&(row.meta?.changed_db!==false||row.meta?.rows_written!==0))))
  throw Error('RESTORE_D1_QUERY_FAILED');
 return results;
}
