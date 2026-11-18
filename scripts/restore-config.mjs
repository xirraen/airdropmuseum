/**
 * Construct an isolated D1-only Wrangler config from Cloudflare-verified
 * database metadata. Never use the production database name as a fallback.
 */
const ACCOUNT=/^[a-f0-9]{32}$/;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function isolatedRestoreConfig({accountId,databaseId,metadata,migrationsDir}={}){
 if(!ACCOUNT.test(accountId||'')||!UUID.test(databaseId||'')||
    metadata?.status!=='READ_ONLY_TARGET_ISOLATION_CHECK_PASSED'||
    metadata.account_id!==accountId||
    metadata.database_id?.toLowerCase()!==databaseId.toLowerCase()||
    !/^airdrop-museum-restore-drill(?:-[a-z0-9-]{1,32})?$/.test(metadata.database_name||'')||
    typeof migrationsDir!=='string'||!migrationsDir.startsWith('/'))
  throw Error('RESTORE_CONFIG_TARGET_UNVERIFIED');
 return {
  name:'airdrop-museum-restore-drill',
  account_id:accountId,
  compatibility_date:'2026-10-27',
  d1_databases:[{
   binding:'DB',
   database_name:metadata.database_name,
   database_id:databaseId,
   migrations_dir:migrationsDir
  }]
 };
}
