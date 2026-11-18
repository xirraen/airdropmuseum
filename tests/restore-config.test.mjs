import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isolatedRestoreConfig} from '../scripts/restore-config.mjs';

const accountId='9880cf2cc57c2096f8c3ae253d9852e6';
const databaseId='8dd6f86a-7d64-4d3e-aaee-df7207fcc44b';
const metadata={
 status:'READ_ONLY_TARGET_ISOLATION_CHECK_PASSED',
 account_id:accountId,database_id:databaseId,
 database_name:'airdrop-museum-restore-drill-20261118'
};
test('verified isolated D1 restore config uses exact Cloudflare database name and ID',()=>{
 const c=isolatedRestoreConfig({accountId,databaseId,metadata,migrationsDir:'/private/reviewed/migrations'});
 assert.equal(c.name,'airdrop-museum-restore-drill');
 assert.equal(c.d1_databases[0].database_name,'airdrop-museum-restore-drill-20261118');
 assert.equal(c.d1_databases[0].database_id,databaseId);
 assert.equal(c.d1_databases[0].binding,'DB');
 assert.equal(c.account_id,accountId);
 assert.equal(c.d1_databases[0].migrations_dir,'/private/reviewed/migrations');
});
test('restore config rejects unverified target, different accounts or database IDs',()=>{
 const factory=overrides=>isolatedRestoreConfig({accountId,databaseId,metadata,migrationsDir:'/reviewed/migrations',...overrides});
 for(const x of [
  {metadata:{...metadata,status:'BLOCKED'}},
  {metadata:{...metadata,database_id:'4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'}},
  {metadata:{...metadata,database_name:'airdrop-museum'}},
  {accountId:'00000000000000000000000000000000'},
  {migrationsDir:'../migrations'}
 ]) assert.throws(()=>factory(x),/RESTORE_CONFIG_TARGET_UNVERIFIED/);
});
test('restore runner must use verified dynamic D1 name, never static mismatched name',()=>{
 const source=readFileSync('scripts/restore-private-backup.mjs','utf8');
 assert.match(source,/isolatedRestoreConfig\(\{accountId:restoreAccount,databaseId:id,metadata:initialTarget/);
 assert.doesNotMatch(source,/database_name:'airdrop-museum-restore-drill'/);
});
