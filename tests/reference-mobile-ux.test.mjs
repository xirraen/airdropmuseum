import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('dist/index.html','utf8');
const js=readFileSync('dist/core-five.js','utf8');
const css=readFileSync('dist/core-five.css','utf8');
test('search and network filter target the active Airdrop tab',()=>{
 assert.match(js,/id="campaign-search"/);
 assert.match(js,/id="chain-filter"/);
 assert.match(js,/addEventListener\('input'/);
 assert.match(js,/search=event\.target\.value/);
});
test('layout contains compact status cards, live campaigns and five-tab mobile navigation',()=>{
 assert.match(css,/\.stats\{/);
 assert.match(css,/\.campaign\{/);
 assert.match(css,/\.bottom-nav\{/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(html,/id="mobile-nav"/);
 assert.match(html,/core-five\.css/);
});
test('portfolio notes and local quests have usable controls',()=>{
 for(const fragment of ['id="note-dialog"','id="note-form"','id="safety-dialog"'])assert.match(html,new RegExp(fragment));
 assert.match(js,/data-note=/);
 assert.match(js,/data-save=/);
 assert.match(js,/data-quest=/);
 assert.match(js,/id="backup-file"/);
});
test('wallet signing is not exposed; read-only research disclaimers remain explicit',()=>{
 assert.match(html,/seed phrase/);
 assert.match(js,/tidak meminta transaksi blockchain/);
 assert.doesNotMatch(html,/walletconnect|admin\.html|decision-lab/);
 assert.doesNotMatch(js,/eth_sendTransaction|personal_sign/);
});
