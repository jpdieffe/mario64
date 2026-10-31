import {chromium,devices} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from '../scripts/serve.mjs';
import {localSignaling} from './local-signaling.mjs';
const base=process.env.TEST_URL||'http://127.0.0.1:4198/';
const server=process.env.TEST_URL?null:createServer(4198);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
const signaling=localSignaling(); const pages=[]; const errors=[];
await mkdir('test-results',{recursive:true});
async function command(page,text){await page.keyboard.press('KeyT',{delay:100});await page.waitForTimeout(150);await page.keyboard.type('/cooptest '+text,{delay:30});await page.keyboard.press('Enter',{delay:100});await page.waitForTimeout(200);}
async function state(page){return page.evaluate(()=>together.state);}
async function wait(page,fn,arg){await page.waitForFunction(fn,arg,{timeout:45000});}
try{
 const code=process.env.ROOM||'TSTB';
 for(const role of ['host','join','join']){
  const page=await browser.newPage({viewport:{width:960,height:600}});pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(/Lua.*error|LUA ERROR|stack overflow|runtime error/i.test(message.text()))errors.push(message.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
  if(!process.env.PUBLIC_SIGNALING)await signaling(page);
  await page.goto(`${base}play.html?role=${role}&room=${code}&debug`);
  await page.waitForFunction(()=>window.together?.state?.players?.length,null,{timeout:120000});
  console.log(role,'booted as', (await state(page)).localId);
 }
 const [host,guest,yoshi]=pages;
 for(const p of pages)await wait(p,()=>together.state.players.length===3);
 console.log('THREE PLAYERS CONNECTED');
 assert.equal((await state(yoshi)).localId,2);
 const model=(await state(yoshi)).model;
 assert.ok(model>0);
 for(const p of pages)await wait(p,model=>together.state.players.find(p=>p.id===2)?.model===model,model);
 await command(host,'base');await command(guest,'beside');await command(yoshi,'above');
 await wait(yoshi,()=>together.state.bounces>0);
 await command(yoshi,'beside');await yoshi.waitForTimeout(1500);
 await host.screenshot({path:'test-results/three-players.png'});
 // Use real input, real synced enemies and native projectile reactions.
 await command(yoshi,'base');await command(guest,'above');
 async function yoshicmd(text){await yoshi.keyboard.press('KeyT',{delay:100});await yoshi.waitForTimeout(150);await yoshi.keyboard.type('/yoshitest '+text,{delay:25});await yoshi.keyboard.press('Enter',{delay:100});await yoshi.waitForTimeout(250);}
 await yoshicmd('face');await yoshicmd('prey');
 for(const p of pages)await wait(p,()=>together.state.goombas===1);
 await yoshi.keyboard.press('KeyX',{delay:120});
 await yoshi.waitForTimeout(180);await yoshi.screenshot({path:'test-results/yoshi-tongue.png'});
 await wait(yoshi,()=>together.state.ammo===1&&together.state.eaten===1);
 for(const p of pages)await wait(p,()=>together.state.goombas===0);
 assert.match(await yoshi.locator('#tb-b').textContent(),/Fireball/);
 console.log('YOSHI TONGUE + SHARED SWALLOW PASS');
 await yoshi.waitForTimeout(900);await yoshicmd('target');for(const p of pages)await wait(p,()=>together.state.goombas===1);
 await yoshi.keyboard.press('KeyX',{delay:120});
 await wait(yoshi,()=>together.state.shots===1&&together.state.ammo===0&&together.state.hits>0);
 for(const p of pages)await wait(p,()=>together.state.goombas===0);
 console.log('YOSHI FIREBALL + SHARED ENEMY DEATH PASS');
 await yoshicmd('prey');await yoshi.waitForTimeout(900);await yoshi.keyboard.press('KeyX',{delay:120});await wait(yoshi,()=>together.state.ammo===1);
 await yoshi.waitForTimeout(900);await yoshi.keyboard.down('Shift');await yoshi.keyboard.press('KeyX',{delay:120});await yoshi.keyboard.up('Shift');
 await wait(yoshi,()=>together.state.shots===2&&together.state.ammo===0);
 console.log('YOSHI SPIN BURST PASS');
 await guest.waitForTimeout(3500);
 const hostHealth=(await state(host)).players.find(p=>p.id===0).health;
 await command(guest,'hurt');
 await wait(guest,()=>{const s=together.state;return s.players.find(p=>p.id===s.localId).health===0x480;});
 assert.equal((await state(host)).players.find(p=>p.id===0).health,hostHealth,'host health stays separate');
 console.log('SEPARATE HEALTH PASS');
 await command(host,'base');await command(guest,'above');
 await wait(guest,()=>together.state.bounces>0);
 console.log('HEAD BOUNCE PASS');
 await command(guest,'beside');await guest.waitForTimeout(1000);
 await host.screenshot({path:'test-results/three-players.png'});
 for(const [index,p] of pages.entries()){
  const epoch=(await state(host)).epoch;
  await command(p,'die');
  for(const q of pages)await wait(q,e=>together.state.epoch===e+1&&together.state.resetting,epoch);
  for(const q of pages)await wait(q,e=>together.state.lastReset===e+1&&!together.state.resetting&&together.state.players.every(p=>p.health===0x880),epoch);
  console.log('SHARED RESET PASS',index);
  await host.waitForTimeout(3500);
 }
 // A real fall in another level must pull the teammate out of the castle too.
 await command(guest,'course');await wait(guest,()=>{const s=together.state;return s.players.find(p=>p.id===s.localId).level===24;});
 await guest.waitForTimeout(2500);const pitEpoch=(await state(host)).epoch;
 await command(guest,'pit');
 for(const q of pages)await wait(q,e=>together.state.lastReset===e+1&&!together.state.resetting&&together.state.players.every(p=>p.health===0x880&&p.level===24),pitEpoch);
 console.log('NATIVE PIT + CROSS-LEVEL RESET PASS');
 const extra=await browser.newPage();
 if(!process.env.PUBLIC_SIGNALING)await signaling(extra);
 await extra.goto(base);await extra.addScriptTag({url:base+'vendor/peerjs.min.js'});
 const rejection=await extra.evaluate(code=>new Promise((resolve,reject)=>{
  const peer=new Peer();const timer=setTimeout(()=>{peer.destroy();reject(Error('Full-room rejection timed out'));},15000);
  peer.on('open',()=>{const connection=peer.connect('mario64-together-v2-'+code,{reliable:true,serialization:'binary'});connection.on('data',data=>{clearTimeout(timer);resolve(data);peer.destroy();});});
  peer.on('error',reject);
 }),code);
 assert.equal(rejection.together,'full');await extra.close();
 console.log('FOURTH PLAYER REJECTED PASS');
 console.log('REJOIN LUIGI'); await guest.reload();
 await guest.waitForFunction(()=>window.together?.state?.players?.length===3,null,{timeout:120000});
 assert.equal((await state(guest)).localId,1);
 console.log('REJOIN YOSHI'); await yoshi.reload();await yoshi.waitForFunction(()=>window.together?.state?.players?.length===3,null,{timeout:120000});assert.equal((await state(yoshi)).localId,2);await wait(yoshi,()=>together.state.model>0);
 await wait(host,()=>Object.keys(PeerNetwork.connections).length===2&&together.state.players.length===3);
 for(const p of pages)await wait(p,()=>together.state.players.length===3);
 console.log('GUEST REJOIN PASS');
 for(const p of pages){assert.deepEqual(await p.evaluate(()=>together.errors),[]);}
 assert.deepEqual(errors,[]);
 console.log('BROWSER CO-OP CHECKS PASSED');
}catch(error){for(const [i,p] of pages.entries()){console.error('FAILED STATE',i,await p.evaluate(()=>({state:window.together?.state,errors:window.together?.errors,notice:document.querySelector('#play-notice')?.textContent})));await p.screenshot({path:`test-results/failure-${i}.png`});}throw error;}
finally{await browser.close();server?.close();}
