import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
const magic=Buffer.from('AMDBv1\0'),maximum=256*1024*1024;
const sha=data=>createHash('sha256').update(data).digest('hex');
function bounded(path,extra=0){if(statSync(path).size>maximum+extra)throw Error('BACKUP_TOO_LARGE_FOR_ENCRYPTION');return readFileSync(path);}
export function encryptBackup(input,output,keyFile){
 const plain=bounded(input),key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
 const sealed=Buffer.concat([magic,iv,cipher.getAuthTag(),ciphertext]);
 writeFileSync(keyFile,key,{mode:0o600,flag:'wx'});
 writeFileSync(output,sealed,{mode:0o600,flag:'wx'});
 return {algorithm:'AES-256-GCM-v1',plaintext_sha256:sha(plain),ciphertext_sha256:sha(sealed)};
}
export function decryptBackup(input,output,keyFile){
 const sealed=bounded(input,magic.length+28),key=readFileSync(keyFile);
 if(key.length!==32||!sealed.subarray(0,magic.length).equals(magic)||sealed.length<magic.length+28)throw Error('INVALID_ENCRYPTED_BACKUP');
 const offset=magic.length,decipher=createDecipheriv('aes-256-gcm',key,sealed.subarray(offset,offset+12));
 decipher.setAuthTag(sealed.subarray(offset+12,offset+28));
 // Authenticate the entire ciphertext before creating any plaintext output.
 const plain=Buffer.concat([decipher.update(sealed.subarray(offset+28)),decipher.final()]);
 writeFileSync(output,plain,{mode:0o600,flag:'wx'});
 return {sha256:sha(plain),bytes:plain.length};
}
