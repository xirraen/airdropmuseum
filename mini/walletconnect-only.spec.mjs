import {test,expect} from '@playwright/test';
const address='0x'+'a'.repeat(40);
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:[]}}));
});
test('WalletConnect is presented only within current profile without old wallet screens',async({page,request})=>{
 await page.goto('/#profile');
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
 await expect(page.getByRole('heading',{name:'WalletConnect'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Hubungkan WalletConnect'})).toBeVisible();
 await expect(page.getByText('Tidak terhubung')).toBeVisible();
 for(const path of ['/walletconnect-bundle.js','/portfolio.html','/api/wallet','/wallet.html','/admin.html'])
  expect((await request.get(path)).status(),path).toBe(410);
 const response=await request.get('/mini-wallet.js');
 expect(response.status()).toBe(200);
 expect((await response.text()).length).toBeGreaterThan(100000);
});
test('wallet pairing is approved through WalletConnect and displays only public account/network',async({page})=>{
 await page.route('**/api/walletconnect/config',r=>r.fulfill({json:{enabled:true,projectId:'a'.repeat(32)}}));
 await page.route('**/mini-wallet.js',r=>r.fulfill({contentType:'text/javascript',body:`
export async function createWalletConnect(){
 window.__walletCalls=[];
 return {
  async request({method}){window.__walletCalls.push(method);if(method==='eth_accounts')return ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];if(method==='eth_chainId')return '0x2105';throw Error('METHOD_DENIED')},
  on(){},
  async disconnect(){window.__walletDisconnected=true}
 }
}`}));
 await page.goto('/#profile');
 await page.getByRole('button',{name:'Hubungkan WalletConnect'}).click();
 await expect(page.getByText('Terhubung',{exact:true})).toBeVisible();
 await expect(page.locator('.walletconnect-address')).toHaveText(address);
 await expect(page.locator('.walletconnect-network')).toContainText('Base');
 expect(await page.evaluate(()=>window.__walletCalls)).toEqual(['eth_accounts','eth_chainId']);
 await expect(page.getByRole('button',{name:'Putuskan WalletConnect'})).toBeVisible();
 await page.getByRole('button',{name:'Putuskan WalletConnect'}).click();
 await expect(page.getByText('Tidak terhubung')).toBeVisible();
 expect(await page.evaluate(()=>window.__walletDisconnected)).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('airdrop-museum-v1')||'')).not.toContain(address);
});
test('invalid server project ID fails closed, without importing wallet code',async({page})=>{
 await page.route('**/api/walletconnect/config',r=>r.fulfill({json:{enabled:true,projectId:'INVALID'}}));
 let walletBundleLoaded=false;
 await page.route('**/mini-wallet.js',r=>{walletBundleLoaded=true;return r.abort()});
 await page.goto('/#profile');
 await page.getByRole('button',{name:'Hubungkan WalletConnect'}).click();
 await expect(page.getByRole('alert')).toHaveText('WalletConnect belum dikonfigurasi pada server.');
 expect(walletBundleLoaded).toBe(false);
 await expect(page.getByText('Tidak terhubung')).toBeVisible();
});
test('WalletConnect config exposes no wallet secrets and is read-only',async({request})=>{
 const r=await request.get('/api/walletconnect/config');
 expect([200,503]).toContain(r.status());
 const payload=await r.json();
 expect(payload).not.toHaveProperty('privateKey');
 expect(payload).not.toHaveProperty('seed');
 const bad=await request.post('/api/walletconnect/config');
 expect(bad.status()).toBe(405);
});
