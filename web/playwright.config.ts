import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'e2e',workers:1,
 use:{baseURL:'http://127.0.0.1:8765',headless:true,launchOptions:{executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-webgl']}},
 webServer:[
  {command:'.venv/bin/akshauhini serve',url:'http://127.0.0.1:8765/api/health',reuseExistingServer:true,cwd:'..'},
  {command:'.venv/bin/python sample_projects/request_studio/run.py',url:'http://127.0.0.1:8766/api/requests',reuseExistingServer:true,cwd:'..'}
 ],timeout:45000
});
