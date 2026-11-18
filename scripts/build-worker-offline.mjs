// Wrangler itself needs Cloudflare auth; its custom build must not inherit it.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {releaseChildEnv} from './release-child-env.mjs';
execFileSync(process.execPath,[fileURLToPath(new URL('./build-worker.mjs',import.meta.url))],{
 stdio:'inherit',timeout:60000,env:releaseChildEnv(process.env)
});
