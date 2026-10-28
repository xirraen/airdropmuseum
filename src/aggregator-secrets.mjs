import {wordlist} from '@scure/bip39/wordlists/english.js';
const words=new Set(wordlist);
export function rejectSensitive(value,depth=0){
 if(depth>30)throw Error('INVALID_INPUT_DEPTH');
 if(typeof value==='string'){
  let run=0;for(const w of value.toLowerCase().split(/[^a-z]+/)){run=words.has(w)?run+1:0;if(run>=12)throw Error('INVALID_SECRET_INPUT');}
  if(/-----BEGIN.*PRIVATE KEY-----|(?:private[ _-]?key|seed[ _-]?phrase|mnemonic)\s*[:=]/i.test(value)||/^(?:0x)?[a-f0-9]{64}$/i.test(value))throw Error('INVALID_SECRET_INPUT');
 }else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){
  if(/^(?:private_?key|seed_?phrase|mnemonic|signature|wallet_?session|session_?wallet)$/i.test(key))throw Error('INVALID_SECRET_FIELD');rejectSensitive(v,depth+1);
 }
 return value;
}
