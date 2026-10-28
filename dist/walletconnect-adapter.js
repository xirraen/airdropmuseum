import {UniversalProvider} from '@walletconnect/universal-provider';
import QRCode from 'qrcode';
import {readOnlyProvider,publicAddresses} from './wallet-provider.js';
const CHAINS=[1,8453,42161,137,11155111];
const METHODS=['eth_getBalance','eth_getTransactionCount','eth_call','eth_estimateGas','wallet_switchEthereumChain'];
/** @param {import('@walletconnect/universal-provider').default['session']} session @param {number} chain */
export function sessionAccounts(session,chain){
 const list=session?.namespaces?.eip155?.accounts;
 if(!Array.isArray(list)||list.length>128)throw Error('INVALID_WALLET_SESSION');
 const selected=[];
 for(const item of list){
  if(typeof item!=='string'||item.length>100)throw Error('INVALID_WALLET_SESSION');
  const m=/^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/.exec(item);
  if(!m)throw Error('INVALID_WALLET_SESSION');
  if(Number(m[1])===chain)selected.push(m[2]);
 }
 return publicAddresses(selected);
}
/** @param {unknown} uri */
export function validPairingUri(uri){
 if(typeof uri!=='string'||uri.length>4096||!/^wc:[0-9a-f]{64}@2\?/.test(uri))throw Error('INVALID_PAIRING_URI');
 const query=new URLSearchParams(uri.slice(uri.indexOf('?')+1));
 if(query.get('relay-protocol')!=='irn'||!/^[0-9a-f]{64}$/.test(query.get('symKey')||''))throw Error('INVALID_PAIRING_URI');
 return uri;
}
/** @param {string} uri @param {()=>void} cancel */
function pairingDialog(uri,cancel){
 validPairingUri(uri);
 const dialog=document.createElement('dialog'),heading=document.createElement('h2'),canvas=document.createElement('canvas'),open=document.createElement('a'),copy=document.createElement('button'),close=document.createElement('button'),status=document.createElement('p');
 heading.textContent='Hubungkan wallet read-only';open.textContent='Buka aplikasi wallet';open.href=uri;copy.textContent='Salin tautan koneksi';close.textContent='Batal';
 dialog.className='walletconnect-pairing';
 dialog.setAttribute('aria-label',heading.textContent);canvas.setAttribute('aria-label','QR WalletConnect');status.setAttribute('role','status');
 dialog.append(heading,canvas,open,copy,close,status);document.body.append(dialog);
 const stop=()=>{cancel();dialog.remove();};close.onclick=stop;dialog.addEventListener('cancel',e=>{e.preventDefault();stop();});
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(uri);status.textContent='Tautan disalin. Buka di wallet Anda.';}catch{status.textContent='Clipboard tidak tersedia. Gunakan QR atau tombol buka wallet.';}};
 dialog.showModal();QRCode.toCanvas(canvas,uri,{width:256,margin:2}).catch(()=>{status.textContent='QR tidak tersedia. Gunakan tombol buka wallet.';});
 return ()=>dialog.remove();
}
/** @param {{projectId:string,metadata:import('@walletconnect/universal-provider').UniversalProviderOpts['metadata']}} options */
export async function createWalletConnect(options,{factory=UniversalProvider,showPairing=pairingDialog}={}){
 if(!/^[a-fA-F0-9]{32}$/.test(options.projectId||''))throw Error('WALLETCONNECT_PROJECT_ID_REQUIRED');
 const universal=await factory.init({projectId:options.projectId,metadata:options.metadata,logger:'error'});
 let chain=1,close=()=>{};
 /** @type {(reason:Error)=>void} */ let rejectCancel=()=>{};
 /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
 const cancellation=new Promise((_,reject)=>{rejectCancel=reject;});
 const transport={
  /** @param {import('./wallet-provider.js').WalletRequest} args */
  async request(args){
   if(['eth_accounts','eth_requestAccounts'].includes(args.method))return sessionAccounts(universal.session,chain);
   if(args.method==='eth_chainId')return '0x'+chain.toString(16);
   if(args.method==='wallet_switchEthereumChain'){
    const parameter=args.params?.[0];
    const value=parameter&&typeof parameter==='object'&&'chainId' in parameter?parameter.chainId:undefined;
    if(typeof value!=='string'||!/^0x[0-9a-fA-F]{1,8}$/.test(value)||!CHAINS.includes(Number(value)))throw Error('CHAIN_UNSUPPORTED');
    if(!sessionAccounts(universal.session,Number(value)).length)throw Error('CHAIN_NOT_APPROVED');
    await universal.request(args,'eip155:'+chain);chain=Number(value);universal.setDefaultChain('eip155:'+chain);return null;
   }
   return universal.request(args,'eip155:'+chain);
  },
  on:(/** @type {string} */ event,/** @type {import('./wallet-provider.js').WalletListener} */ listener)=>universal.on(event,listener),removeListener:(/** @type {string} */ event,/** @type {import('./wallet-provider.js').WalletListener} */ listener)=>universal.removeListener(event,listener),
  disconnect:async()=>{close();await universal.disconnect();}
 };
 const display=(/** @type {string} */ uri)=>{close();close=showPairing(validPairingUri(uri),()=>{universal.abortPairingAttempt();rejectCancel(Error('WALLET_CONNECTION_CANCELLED'));});};
 universal.on('display_uri',display);
 try{
  if(!universal.session)await Promise.race([universal.connect({namespaces:{eip155:{chains:['eip155:1'],methods:METHODS,events:['accountsChanged','chainChanged']}},optionalNamespaces:{eip155:{chains:CHAINS.slice(1).map(c=>'eip155:'+c),methods:METHODS,events:['accountsChanged','chainChanged']}}}),cancellation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WALLET_CONNECTION_TIMEOUT')),120000);})]);
  if(!sessionAccounts(universal.session,chain).length)throw Error('INVALID_WALLET_SESSION');
 }catch(error){await universal.disconnect().catch(()=>{});throw error;}
 finally{clearTimeout(timer);close();universal.removeListener('display_uri',display);}
 universal.on('chainChanged',(/** @type {unknown} */ value)=>{const next=Number(typeof value==='string'&&value.startsWith('eip155:')?value.slice(7):value);if(CHAINS.includes(next))chain=next;});
 return readOnlyProvider(transport);
}
