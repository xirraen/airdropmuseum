import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
export const REQUIRED_GATES=Object.freeze(['staging_e2e','telegram_device','walletconnect_device','encrypted_backup','isolated_restore','erasure_ledger','migration_review','binding_inventory','secret_inventory','superadmin_bootstrap','rollback_drill','load_test','production_approval']);
export function verifyReleaseEvidence(file,commit,now=Date.now()){
 if(!file)throw Error('RELEASE_EVIDENCE_REQUIRED');
 const manifest=JSON.parse(readFileSync(file,'utf8'));
 if(manifest.commit!==commit||!/^[a-f0-9]{40}$/.test(commit))throw Error('RELEASE_COMMIT_MISMATCH');
 const timestamp=Date.parse(manifest.verified_at);
 if(!Number.isFinite(timestamp)||timestamp>now||now-timestamp>24*3600000)throw Error('RELEASE_EVIDENCE_EXPIRED');
 for(const gate of REQUIRED_GATES){
  const entry=manifest.gates?.[gate];
  if(entry?.status!=='PASS'||typeof entry.reviewer!=='string'||!entry.reviewer.trim()||typeof entry.artifact!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw Error('RELEASE_GATE_REQUIRED: '+gate);
  const data=readFileSync(resolve(dirname(file),entry.artifact));
  if(createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('RELEASE_ARTIFACT_MISMATCH: '+gate);
 }
 return manifest;
}
