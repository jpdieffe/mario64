import {chromium,devices} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from '../scripts/serve.mjs';
import {localSignaling} from './local-signaling.mjs';
const server=createServer(4199),signaling=localSignaling();
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const pages=[];const errors=[];await mkdir('test-results',{recursive:true});
try{
 for(const [device,role] of [['Pixel 7','host'],['iPhone 13','join']]){
  const page=await browser.newPage({...devices[device],viewport:{width:844,height:390},deviceScaleFactor:1});pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));await signaling(page);
  await page.goto('http://127.0.0.1:4199/');await page.screenshot({path:`test-results/lobby-${role}.png`});
  await page.goto(`http://127.0.0.1:4199/play.html?role=${role}&room=MABL`);
  await page.waitForFunction(()=>window.together?.state?.players?.length,null,{timeout:120000});
  console.log(device,'booted');
 }
 for(const page of pages){
  await page.waitForFunction(()=>together.state.players.length===2);await page.waitForTimeout(2000);
  assert.equal(await page.locator('#touch-gamepad').isVisible(),true);
  // Hold and move the real on-screen analog stick through browser touch events.
  const before=await page.evaluate(()=>together.state.players.find(p=>p.id===together.state.localId));
  const cdp=await page.context().newCDPSession(page),stick=await page.locator('#touch-stick-base').boundingBox();
  const center={x:stick.x+stick.width/2,y:stick.y+stick.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...center,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x+45,y:center.y,id:1}]});
  await page.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await page.evaluate(()=>together.state.players.find(p=>p.id===together.state.localId));
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>50,'touch stick moves Mario');
  console.log('touch moved',pages.indexOf(page),before,after);
  await page.touchscreen.tap(...await page.locator('#tb-a').evaluate(el=>{const r=el.getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2];}));
  await page.waitForFunction(y=>together.state.players.find(p=>p.id===together.state.localId).y>y+15,after.y,{timeout:5000});
  await page.locator('#sound').tap();await page.waitForFunction(()=>document.querySelector('#sound').textContent==='Sound on');
  for(const id of ['tb-start','tb-r','tb-l'])assert.equal(await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true,`${id} is reachable`);
  await page.screenshot({path:`test-results/mobile-${pages.indexOf(page)}.png`});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'portrait fits screen');
  await page.locator('#controls-help').tap();await page.locator('#close-help').tap();
  await page.screenshot({path:`test-results/portrait-${pages.indexOf(page)}.png`});
  await page.setViewportSize({width:844,height:390});
 }
 assert.deepEqual(errors,[]);console.log('ANDROID / IPHONE VIEWPORTS, TOUCH MOVEMENT, JUMP, AUDIO AND CONTROLS PASS (Chromium emulation)');
}catch(error){for(const [i,page] of pages.entries()){console.error(await page.evaluate(()=>({state:together.state,errors:together.errors})));await page.screenshot({path:`test-results/mobile-failure-${i}.png`});}throw error;}
finally{await browser.close();server.close();}
