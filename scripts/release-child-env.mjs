/**
 * Keep operator Cloudflare credentials and private backup paths out of
 * dependency install hooks, the test runner, browsers and local build scripts.
 * This is defense-in-depth, not an OS sandbox; operator credentials must
 * remain outside the repository and untrusted filesystem locations.
 */
const PRIVATE_EXACT=new Set([
 'CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','CF_API_TOKEN','CF_API_KEY',
 'CLOUDFLARE_EMAIL','WRANGLER_API_TOKEN','GH_TOKEN','GITHUB_TOKEN',
 'NODE_AUTH_TOKEN','NPM_TOKEN','SSH_AUTH_SOCK','RELEASE_EVIDENCE_FILE',
 'PRIVATE_BACKUP_ROOT','PRIVATE_BACKUP_KEY_ROOT','PRIVATE_BACKUP_DIRECTORY',
 'AIRDROP_PRODUCTION_RELEASE','AIRDROP_PRESENTATION_RELEASE','RESTORE_DRILL_VERIFIED',
 'TELEGRAM_BOT_TOKEN','TELEGRAM_API_HASH','API_HASH_PEPPER',
 'BACKUP_SIGNING_KEY','WEBHOOK_MASTER_SECRET','WALLETCONNECT_PROJECT_ID'
]);

/**
 * An offline build/test/install child should never receive operator credentials.
 * Only explicit, reviewed remote Cloudflare commands use cloudAccess:true.
 */
export function releaseChildEnv(source,{cloudAccess=false}={}){
 const env={...source};
 if(!cloudAccess)for(const key of Object.keys(env)){
  if(PRIVATE_EXACT.has(key)||
   /^(?:CLOUDFLARE_|CF_|WRANGLER_|GITHUB_|GH_|AWS_|R2_|PRIVATE_|NPM_CONFIG_.*(?:TOKEN|PASSWORD|AUTH)|npm_config_.*(?:token|password|auth))/i.test(key)||
   /(?:^|_)(?:SECRET|TOKEN|API_KEY|PRIVATE_KEY|PASSWORD|PEPPER|MNEMONIC|SEED)(?:_|$)/i.test(key))
   delete env[key];
 }
 env.CI='true';
 env.WRANGLER_SEND_METRICS='false';
 return env;
}
