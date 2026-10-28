/** @typedef {{method:string,params?:unknown[]}} WalletRequest */
/** @typedef {(...args:unknown[])=>void} WalletListener */
/** @typedef {{request:(args:WalletRequest)=>Promise<unknown>,on?:(event:string,listener:WalletListener)=>void,removeListener?:(event:string,listener:WalletListener)=>void,disconnect?:()=>Promise<void>}} WalletTransport */
const READ_METHODS=new Set(['eth_accounts','eth_requestAccounts','eth_chainId','eth_getBalance','eth_getTransactionCount','eth_call','eth_estimateGas','wallet_switchEthereumChain']);
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
/** @param {unknown} value */
export function publicAddresses(value){
 if(!Array.isArray(value)||value.length>32||value.some(v=>typeof v!=='string'||!ADDRESS.test(v)))throw Error('INVALID_WALLET_ACCOUNTS');
 return [...new Set(value.map(v=>v.toLowerCase()))];
}
/** @param {WalletTransport} provider */
export function readOnlyProvider(provider){
 if(!provider||typeof provider.request!=='function')throw Error('WALLET_PROVIDER_UNAVAILABLE');
 return {
  /** @param {WalletRequest} args */
  async request(args){
   if(!args||!READ_METHODS.has(args.method))throw Error('READ_ONLY_WALLET_METHOD_REQUIRED');
   if(JSON.stringify(args).length>32768)throw Error('WALLET_PAYLOAD_TOO_LARGE');
   const response=await provider.request(args);
   if(args.method==='eth_accounts'||args.method==='eth_requestAccounts'){const accounts=publicAddresses(response);if(args.method==='eth_requestAccounts'&&!accounts.length)throw Error('WALLET_ACCOUNT_REQUIRED');return accounts;}
   if(args.method==='eth_chainId'&&(typeof response!=='string'||!/^0x[0-9a-fA-F]{1,16}$/.test(response)))throw Error('INVALID_WALLET_CHAIN');
   return response;
  },
  on:(/** @type {string} */ event,/** @type {WalletListener} */ listener)=>provider.on?.(event,listener),removeListener:(/** @type {string} */ event,/** @type {WalletListener} */ listener)=>provider.removeListener?.(event,listener),
  disconnect:()=>provider.disconnect?.()
 };
}
