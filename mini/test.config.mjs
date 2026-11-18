import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:['five-tabs.spec.mjs','quest-discovery.spec.mjs','white-theme.spec.mjs','pre-removal-visual.spec.mjs'],
 use:{baseURL:'http://127.0.0.1:4182'},
 projects:[{name:'mobile',use:devices['Pixel 7']},{name:'desktop',use:{viewport:{width:1440,height:900}}}],
 webServer:{command:'node mini/serve-fixture.mjs',cwd:process.cwd(),url:'http://127.0.0.1:4182'}
});
