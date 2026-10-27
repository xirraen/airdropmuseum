const encoder=new TextEncoder();
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(data)))}
export async function verifyTelegram(initData,token,now=Math.floor(Date.now()/1000)){
 if(!token)throw Error('AUTH_NOT_CONFIGURED');
 if(typeof initData!=='string'||!initData||initData.length>16384)throw Error('UNAUTHORIZED');
 const p=new URLSearchParams(initData),keys=[...p.keys()];if(new Set(keys).size!==keys.length)throw Error('UNAUTHORIZED');
 const hash=p.get('hash');if(!/^[a-f0-9]{64}$/.test(hash||''))throw Error('UNAUTHORIZED');
 const time=Number(p.get('auth_date'));if(!Number.isSafeInteger(time)||time<now-3600||time>now+30)throw Error('UNAUTHORIZED');
 p.delete('hash');const text=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=await hmac(encoder.encode('WebAppData'),token);const signature=await hmac(secret,text);
 let mismatch=0;for(let i=0;i<32;i++)mismatch|=signature[i]^parseInt(hash.slice(i*2,i*2+2),16);if(mismatch)throw Error('UNAUTHORIZED');
 let user;try{user=JSON.parse(p.get('user'))}catch{throw Error('UNAUTHORIZED')}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0)throw Error('UNAUTHORIZED');
 return {id:String(user.id)};
}
