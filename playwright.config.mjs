import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',timeout:30000,fullyParallel:true,
 use:{baseURL:process.env.E2E_BASE_URL||'http://127.0.0.1:4173',trace:'retain-on-failure'},
 projects:[{name:'mobile-chromium',use:{...devices['Pixel 7']}},{name:'desktop-chromium',use:{viewport:{width:1440,height:1000}}}],
 webServer:process.env.E2E_BASE_URL?undefined:{command:'npm run dev',url:'http://127.0.0.1:4173/api/health',reuseExistingServer:false},
});
