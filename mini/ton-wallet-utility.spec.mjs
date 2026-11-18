import {test,expect} from '@playwright/test';
const walletAddress='0:'+('a'.repeat(64));
const walletSnapshot={
 network:'TON mainnet',address:walletAddress,ton:'15.25',accountStatus:'active',source:'TonAPI',
 jettonsAvailable:true,jettons:[{name:'Community Token',symbol:'COM',amount:'12.5'}],
 nftsAvailable:true,nfts:[{name:'Museum Badge',collection:'Museum Collection',address:'EQ123'}],
 eventsAvailable:true,events:[{type:'TonTransfer',amount:'1 TON',time:'2026-11-18T10:10:10.000Z',id:'abc'}],
 checkedAt:'2026-11-18T11:15:00.000Z'
};
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/tonconnect-ui.min.js',r=>r.fulfill({contentType:'text/javascript',body:"window.TON_CONNECT_UI={\n THEME:{LIGHT:'LIGHT'},\n toUserFriendlyAddress(raw){return 'UQ'+raw.slice(2,12)+'userwallet';},\n TonConnectUI:class{\n  constructor(){this.wallet=null;window.__testTonUi=this;}\n  onStatusChange(cb){this.cb=cb;return()=>{};}\n  async openModal(){\n   const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Connect your TON wallet');\n   const select=document.createElement('button');select.textContent='Tonkeeper';\n   select.addEventListener('click',()=>{\n    this.wallet={account:{address:'0:'+'a'.repeat(64),chain:'-239'},device:{appName:'Tonkeeper'}};\n    dialog.close();dialog.remove();this.cb(this.wallet);\n   });\n   dialog.append(select);document.body.append(dialog);dialog.showModal();\n  }\n  async disconnect(){this.wallet=null;this.cb(null);}\n }\n};"}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:[]}}));
 await page.route('**/api/source-activity',r=>r.fulfill({json:{events:[],checkedAt:new Date().toISOString()}}));
 await page.route('**/api/ton-wallet?**',r=>r.fulfill({json:walletSnapshot}));
});
async function connectWallet(page){
 await page.goto('/#profile');
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await page.getByRole('dialog',{name:'Connect your TON wallet'}).getByRole('button',{name:'Tonkeeper'}).click();
 await expect(page.locator('.ton-connection-state')).toHaveText('Terhubung');
}
test('wallet connection now provides TON balance, Jettons, NFT and transaction activity',async({page})=>{
 await connectWallet(page);
 await expect(page.locator('.ton-wallet-mini-balance')).toContainText('15.25 TON');
 await page.getByRole('button',{name:'Lihat aset & aktivitas'}).click();
 await expect(page).toHaveURL(/#workspace$/);
 await expect(page.locator('.ton-assets-balance')).toContainText('15.25 TON');
 await expect(page.locator('.ton-assets-balance')).toContainText('TonAPI');
 await expect(page.locator('.ton-assets-section').first()).toContainText('COM');
 await expect(page.locator('.ton-assets-section').first()).toContainText('12.5');
 await expect(page.locator('.ton-assets-section').nth(1)).toContainText('Museum Badge');
 await expect(page.locator('.ton-activity-row')).toContainText('TonTransfer');
 await expect(page.locator('.ton-activity-row')).toContainText('1 TON');
 await expect(page.locator('.ton-explorer-link')).toHaveAttribute('href',/tonviewer\.com/);
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
test('no connection means no wallet scan; disconnect removes prior account data from screen',async({page})=>{
 let requests=0;
 await page.route('**/api/ton-wallet?**',r=>{requests++;r.fulfill({json:walletSnapshot})});
 await page.goto('/#workspace');
 await expect(page.locator('.ton-assets-panel')).toContainText('Hubungkan TON Wallet');
 expect(requests).toBe(0);
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await page.getByRole('button',{name:'Hubungkan Wallet',exact:true}).click();
 await page.getByRole('dialog',{name:'Connect your TON wallet'}).getByRole('button',{name:'Tonkeeper'}).click();
 await expect(page.locator('.ton-wallet-mini-balance')).toContainText('15.25 TON');
 await page.getByRole('button',{name:'Putuskan koneksi'}).click();
 await expect(page.locator('.ton-connection-state')).toHaveText('Belum terhubung');
 await page.getByRole('navigation').getByRole('button',{name:'Portofolio'}).click();
 await expect(page.locator('.ton-assets-balance')).toHaveCount(0);
 await expect(page.locator('.ton-assets-panel')).toContainText('Hubungkan TON Wallet');
 expect(requests).toBeGreaterThan(0);
});
test('provider outage shows explicit unavailability, not invented zero balance',async({page})=>{
 await page.unroute('**/api/ton-wallet?**');
 await page.route('**/api/ton-wallet?**',r=>r.fulfill({status:503,json:{error:'TON_DATA_UNAVAILABLE'}}));
 await connectWallet(page);
 await expect(page.locator('.ton-wallet-mini-info')).toContainText('tidak tersedia');
 await page.getByRole('button',{name:'Lihat aset & aktivitas'}).click();
 await expect(page.locator('.ton-assets-error')).toContainText('tidak tersedia');
 await expect(page.locator('.ton-assets-balance')).toHaveCount(0);
 await page.unroute('**/api/ton-wallet?**');
 await page.route('**/api/ton-wallet?**',r=>r.fulfill({json:walletSnapshot}));
 await page.getByRole('button',{name:'Perbarui data'}).click();
 await expect(page.locator('.ton-assets-balance')).toContainText('15.25 TON');
});
test('partial provider failures distinguish unavailable Jettons, NFTs and activities',async({page})=>{
 await page.unroute('**/api/ton-wallet?**');
 await page.route('**/api/ton-wallet?**',r=>r.fulfill({json:{
  ...walletSnapshot,jettons:[],events:[],nfts:[],jettonsAvailable:false,nftsAvailable:false,eventsAvailable:false
 }}));
 await connectWallet(page);
 await page.getByRole('button',{name:'Lihat aset & aktivitas'}).click();
 await expect(page.locator('.ton-assets-balance')).toContainText('15.25 TON');
 await expect(page.locator('.ton-assets-panel')).toContainText('Jetton belum tersedia');
 await expect(page.locator('.ton-assets-panel')).toContainText('NFT belum tersedia');
 await expect(page.locator('.ton-assets-panel')).toContainText('transaksi belum tersedia');
});


test('shared Worker 429 is bypassed by device-origin TON mainnet account request',async({page})=>{
 await page.unroute('**/api/ton-wallet?**');
 await page.route('**/api/ton-wallet?**',r=>r.fulfill({status:503,json:{error:'TON_DATA_UNAVAILABLE',upstream:{tonapi:'UPSTREAM_HTTP_429',toncenter:'UPSTREAM_HTTP_429'}}}));
 await page.route('https://tonapi.io/v2/accounts/**',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',
  json:{address:walletAddress,balance:10731721361275,status:'active'}}));
 await connectWallet(page);
 await expect(page.locator('.ton-wallet-mini-balance')).toContainText('10731.721361');
 await page.getByRole('button',{name:'Lihat aset & aktivitas'}).click();
 await expect(page.locator('.ton-assets-balance')).toContainText('10731.721361');
 await expect(page.locator('.ton-assets-balance')).toContainText('TonAPI (langsung)');
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
test('device-origin TON Center fallback shows genuine balance if TonAPI browser request fails',async({page})=>{
 await page.unroute('**/api/ton-wallet?**');
 await page.route('**/api/ton-wallet?**',r=>r.fulfill({status:503,json:{error:'TON_DATA_UNAVAILABLE'}}));
 await page.route('https://tonapi.io/v2/accounts/**',r=>r.fulfill({status:429,json:{error:'RATE_LIMITED'}}));
 await page.route('https://toncenter.com/api/v2/getAddressInformation?**',r=>r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',
  json:{ok:true,result:{balance:'12500000000',state:'active'}}}));
 await connectWallet(page);
 await expect(page.locator('.ton-wallet-mini-balance')).toContainText('12.5 TON');
 await page.getByRole('button',{name:'Lihat aset & aktivitas'}).click();
 await expect(page.locator('.ton-assets-balance')).toContainText('TON Center (langsung)');
 await expect(page.locator('.ton-assets-panel')).toContainText('Jetton belum tersedia');
});
