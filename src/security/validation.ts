export function validId(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);}
export function unixTimestamp(value){return Number.isSafeInteger(value)&&value>=0&&value<=4102444800;}
export function boundedString(value,max=200){return typeof value==='string'&&value.length<=max&& !/[\u0000-\u001f\u007f]/.test(value);}
export function safeHttpsUrl(input,{allowedHosts=null}={}){
 if(typeof input!=='string'||input.length>2048||/[\u0000-\u0020\\]/.test(input))throw Error('INVALID_URL');
 let url;try{url=new URL(input);}catch{throw Error('INVALID_URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw Error('INVALID_URL');
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host==='metadata.google.internal'||host==='metadata'||host==='0'||host.includes('%')||!host.includes('.'))throw Error('SSRF_BLOCKED');
 if(host.startsWith('[')||/^[\d.]+$/.test(host)){
  // Reject literal IPv4/IPv6, obfuscated numeric IPs and IPv6 mapped addresses.
  throw Error('SSRF_BLOCKED');
 }
 if(allowedHosts&&!allowedHosts.includes(host))throw Error('HOST_NOT_ALLOWED');
 url.hostname=host;
 return url.toString();
}
export function walletAddress(chain,address){
 if(typeof chain!=='string'||!boundedString(chain,32)||typeof address!=='string')return false;
 if(/^(eip155:)?\d+$/.test(chain)||['ethereum','base','arbitrum','optimism','polygon'].includes(chain.toLowerCase()))
  return /^0x[a-fA-F0-9]{40}$/.test(address);
 return false; // unsupported chains require a dedicated validator
}
