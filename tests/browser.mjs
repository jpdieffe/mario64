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
async function command(page,text){await page.keyboard.press('KeyT');await page.waitForTimeout(150);await page.keyboard.type('/cooptest '+text,{delay:30});await page.keyboard.press('Enter');await page.waitForTimeout(200);}
async function state(page){return page.evaluate(()=>together.state);}
async function wait(page,fn,arg){await page.waitForFunction(fn,arg,{timeout:45000});}
try{
 const code=process.env.ROOM||'TSTB';
 for(const role of ['host','join']){
  const page=await browser.newPage({viewport:{width:960,height:600}});pages.push(page);
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
  if(!process.env.PUBLIC_SIGNALING)await signaling(page);
  await page.goto(`${base}play.html?role=${role}&room=${code}&debug`);
  await page.waitForFunction(()=>window.together?.state?.players?.length,null,{timeout:120000});
  console.log(role,'booted',await state(page));
 }
 const [host,guest]=pages;
 for(const p of pages)await wait(p,()=>together.state.players.length===2);
 console.log('CONNECTED',await state(host),await state(guest));
 await guest.waitForTimeout(3500);
 await command(guest,'hurt');
 await wait(guest,()=>{const s=together.state;return s.players.find(p=>p.id===s.localId).health===0x480;});
 assert.equal((await state(host)).players.find(p=>p.id===0).health,0x880,'host health stays separate');
 console.log('SEPARATE HEALTH PASS');
 await command(host,'base');await command(guest,'above');
 await wait(guest,()=>together.state.bounces>0);
 console.log('HEAD BOUNCE PASS',await state(guest));
 await command(guest,'beside');await guest.waitForTimeout(1000);
 await host.screenshot({path:'test-results/two-players.png'});
 for(const [index,p] of pages.entries()){
  const epoch=(await state(host)).epoch;
  await command(p,'die');
  for(const q of pages)await wait(q,e=>together.state.epoch===e+1&&together.state.resetting,epoch);
  for(const q of pages)await wait(q,e=>together.state.lastReset===e+1&&!together.state.resetting&&together.state.players.every(p=>p.health===0x880),epoch);
  console.log('SHARED RESET PASS',index,await state(host),await state(guest));
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
  peer.on('open',()=>{const connection=peer.connect('mario64-together-v1-'+code,{reliable:true,serialization:'binary'});connection.on('data',data=>{clearTimeout(timer);resolve(data);peer.destroy();});});
  peer.on('error',reject);
 }),code);
 assert.equal(rejection.together,'full');await extra.close();
 console.log('THIRD PLAYER REJECTED PASS');
 await guest.reload();
 await guest.waitForFunction(()=>window.together?.state?.players?.length===2,null,{timeout:120000});
 assert.equal((await state(guest)).localId,1);
 await wait(host,()=>Object.keys(PeerNetwork.connections).length===1&&together.state.players.length===2);
 console.log('GUEST REJOIN PASS');
 for(const p of pages){assert.deepEqual(await p.evaluate(()=>together.errors),[]);}
 assert.deepEqual(errors,[]);
 console.log('BROWSER CO-OP CHECKS PASSED');
}catch(error){for(const [i,p] of pages.entries()){console.error('FAILED STATE',i,await p.evaluate(()=>({state:window.together?.state,errors:window.together?.errors,notice:document.querySelector('#play-notice')?.textContent})));await p.screenshot({path:`test-results/failure-${i}.png`});}throw error;}
finally{await browser.close();server?.close();}
