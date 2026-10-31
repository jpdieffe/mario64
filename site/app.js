import {newCode,parseCode} from './rooms.js';
const $=s=>document.querySelector(s);
function launch(role,code){const url=new URL('./play.html',location.href);url.search=new URLSearchParams({role,room:code});location.assign(url);}
$('#host-button').onclick=()=>launch('host',newCode());
$('#join-form').onsubmit=e=>{e.preventDefault();const code=parseCode($('#room-code').value);if(!code){$('#status').textContent='Enter the four-character code or paste your friend’s invite link.';return;}launch('join',code);};
const invited=parseCode(new URLSearchParams(location.hash.slice(1)).get('room')||'');
if(invited){$('#room-code').value=invited;$('#status').textContent=`Your friend invited you to room ${invited}. Tap Join when ready.`;}
$('#network-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(data.turn&&!/^turns?:[^\s]+$/.test(data.turn)){$('#status').textContent='Use a relay URL beginning with turn: or turns:.';return;}sessionStorage.setItem('mario64-network',JSON.stringify(data));$('#status').textContent='Connection settings saved for this tab.';};
