import {test,expect} from '@playwright/test';
const manifest='/tonconnect-manifest.json';
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:[{id:'p1',name:'Real Campaign Fixture',status:'CONFIRMED',tasks:['Review official source']}]}}));
});
function mockTonSdk(page){
 return page.route('**/tonconnect-ui.min.js',r=>r.fulfill({
  status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:"window.TON_CONNECT_UI={\n THEME:{LIGHT:'LIGHT'},\n toUserFriendlyAddress(addr){return 'UQ'+addr.slice(2,12)+'sampleaddress';},\n TonConnectUI:class{\n  constructor(options){this.options=options;this.wallet=null;window.__tonUi=this;window.__tonOpenCount=0;}\n  onStatusChange(cb,err){this.cb=cb;this.err=err;return()=>{}}\n  openModal(){\n   window.__tonOpenCount++;\n   document.querySelector('[data-ton-test-modal]')?.remove();\n   const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.dataset.tonTestModal='true';\n   const title=document.createElement('h3');title.textContent='Connect your wallet';\n   const choose=document.createElement('button');choose.textContent='Tonkeeper';\n   choose.onclick=()=>{this.wallet={account:{address:'0:'+'1'.repeat(64),chain:'-239'},device:{appName:'Tonkeeper'}};this.cb(this.wallet);dialog.remove()};\n   const close=document.createElement('button');close.textContent='Close';\n   close.onclick=()=>dialog.remove();\n   dialog.append(title,choose,close);document.body.append(dialog);\n   return Promise.resolve();\n  }\n  disconnect(){this.wallet=null;this.cb(null);return Promise.resolve();}\n }\n};"
 }));
}
test('connect opens TON wallet picker immediately, not a never-ending spinner',async({page})=>{
 await mockTonSdk(page);
 await page.goto('/#profile');
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
 await expect(page.getByRole('heading',{name:'Hubungkan Wallet'})).toBeVisible();
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog')).toContainText('Connect your wallet');
 await expect(page.getByRole('button',{name:'Hubungkan Wallet',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>window.__tonUi.options.manifestUrl)).toContain(manifest);
 expect(await page.evaluate(()=>window.__tonOpenCount)).toBe(1);
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 await expect(page.getByRole('button',{name:'Hubungkan Wallet',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>window.__tonOpenCount)).toBe(2);
});
test('connection updates state from TON approval, mainnet and disconnect are functional',async({page})=>{
 await mockTonSdk(page);
 await page.goto('/#profile');
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Tonkeeper'}).click();
 await expect(page.locator('.ton-connection-state')).toHaveText('Terhubung');
 await expect(page.locator('.ton-wallet-label')).toContainText('Tonkeeper');
 await expect(page.locator('.ton-wallet-label')).toContainText('TON Mainnet');
 await expect(page.locator('.ton-address')).toContainText('UQ');
 await page.getByRole('button',{name:'Putuskan koneksi'}).click();
 await expect(page.locator('.ton-connection-state')).toHaveText('Belum terhubung');
 await expect(page.getByRole('button',{name:'Hubungkan Wallet',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>localStorage.getItem('airdrop-museum-v1')||'')).not.toContain('Tonkeeper');
});
test('testnet wallet is declined rather than shown as a mainnet session',async({page})=>{
 await mockTonSdk(page);
 await page.goto('/#profile');
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.evaluate(()=>{
  const wallet={account:{address:'0:'+'3'.repeat(64),chain:'-3'},device:{appName:'Testnet Wallet'}};
  window.__tonUi.wallet=wallet;window.__tonUi.cb(wallet);
 });
 await expect(page.locator('.ton-connection-state')).toHaveText('Belum terhubung');
 await expect(page.getByRole('alert')).toContainText('mainnet');
});
test('CDN failure recovers with error and retry; no blocked profile navigation',async({page})=>{
 await page.route('**/tonconnect-ui.min.js',r=>r.abort());
 await page.goto('/#profile');
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Pemilih wallet');
 await expect(page.getByRole('button',{name:'Hubungkan Wallet',exact:true})).toBeEnabled();
 await page.getByRole('navigation').getByRole('button',{name:'Quest'}).click();
 await expect(page).toHaveURL(/#missions$/);
});
test('public manifest, PNG icon, read-only routes and exactly five tabs',async({page,request})=>{
 const m=await request.get(manifest);expect(m.status()).toBe(200);
 const data=await m.json();
 expect(data.name).toBe('Airdrop Museum');
 expect(data.url).toBe('https://airdrop-museum.xirraen.workers.dev');
 expect(data.iconUrl).toContain('/tonconnect-icon.png');
 expect(m.headers()['access-control-allow-origin']).toBe('*');
 const icon=await request.get('/tonconnect-icon.png');
 expect(icon.status()).toBe(200);
 expect(icon.headers()['content-type']).toContain('image/png');
 const bytes=await icon.body();
 expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
 expect(bytes.readUInt32BE(16)).toBe(180);
 for(const route of ['/api/walletconnect/config','/mini-wallet.js','/admin.html','/decision-lab.html','/api/wallet']){
  expect((await request.get(route)).status(),route).toBe(410);
 }
 expect((await request.post(manifest)).status()).toBe(405);
 await page.goto('/#home');
 await expect(page.locator('.legacy-hero')).toBeVisible();
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
