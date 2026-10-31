export const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(){return [...crypto.getRandomValues(new Uint8Array(4))].map(n=>ALPHABET[n%ALPHABET.length]).join('');}
export function parseCode(input){let code=input.trim();if(/^https?:\/\//i.test(code)){try{const url=new URL(code);code=new URLSearchParams(url.hash.slice(1)).get('room')||url.searchParams.get('room')||'';}catch{return null;}}code=code.toUpperCase().replace(/[\s-]/g,'');return code.length===4&&[...code].every(c=>ALPHABET.includes(c))?code:null;}
