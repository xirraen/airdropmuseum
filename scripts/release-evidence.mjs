import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
export const REQUIRED_GATES=Object.freeze(['staging_e2e','telegram_device','walletconnect_device','encrypted_backup','isolated_restore','erasure_ledger','migration_review','binding_inventory','secret_inventory','superadmin_bootstrap','rollback_drill','load_test','production_approval']);
export const PRESENTATION_GATES=Object.freeze([
 'production_baseline','style_only_diff','staging_e2e','binding_inventory','rollback_drill','production_approval'
]);
export function requiredReleaseGates(tier='full'){
 if(tier==='presentation')return PRESENTATION_GATES;
 if(tier==='full')return REQUIRED_GATES;
 throw Error('INVALID_RELEASE_TIER');
}
export function verifyReleaseEvidence(file,commit,now=Date.now(),tier='full'){
 if(!file)throw Error('RELEASE_EVIDENCE_REQUIRED');
 const manifest=JSON.parse(readFileSync(file,'utf8'));
 if(manifest.commit!==commit||!/^[a-f0-9]{40}$/.test(commit))throw Error('RELEASE_COMMIT_MISMATCH');
 if(tier==='presentation'){
  if(manifest.tier!=='presentation'||!/^[a-f0-9]{40}$/.test(manifest.production_base_commit||'')||
     !/^[a-f0-9-]{36}$/.test(manifest.production_deployment_id||'')||
     !/^[a-f0-9]{64}$/.test(manifest.production_base_artifact_sha256||''))
   throw Error('PRESENTATION_BASELINE_REQUIRED');
 }else if(tier!=='full'||(manifest.tier&&manifest.tier!=='full'))throw Error('RELEASE_TIER_MISMATCH');
 const timestamp=Date.parse(manifest.verified_at);
 if(!Number.isFinite(timestamp)||timestamp>now||now-timestamp>24*3600000)throw Error('RELEASE_EVIDENCE_EXPIRED');
 for(const gate of requiredReleaseGates(tier)){
  const entry=manifest.gates?.[gate];
  if(entry?.status!=='PASS'||typeof entry.reviewer!=='string'||!entry.reviewer.trim()||typeof entry.artifact!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw Error('RELEASE_GATE_REQUIRED: '+gate);
  const data=readFileSync(resolve(dirname(file),entry.artifact));
  if(createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('RELEASE_ARTIFACT_MISMATCH: '+gate);
 }
 return manifest;
}
