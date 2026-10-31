import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
for(const directory of ['site','scripts','tests'])for(const file of readdirSync(directory)){
  if(!/\.(m?js)$/.test(file))continue;
  const result=spawnSync(process.execPath,['--check',`${directory}/${file}`],{stdio:'inherit'});
  if(result.status)process.exit(result.status);
}
for(const file of ['index.html','play.html','credits.html']){
 const html=readFileSync('site/'+file,'utf8');
 for(const [,asset] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))readFileSync(`site/${asset}`);
}
const manifest=JSON.parse(readFileSync('site/engine-manifest.json','utf8'));
for(const [file,expected] of Object.entries(manifest.engine)){
 const data=readFileSync('site/engine/'+file);
 if(data.length!==expected.bytes||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw Error('Engine artifact mismatch: '+file);
}
const rom=readFileSync('site/roms/super-mario-64.z64');
for(const [file,expected] of Object.entries(manifest.models)){
 const data=readFileSync('site/'+file);
 if(data.length!==expected.bytes||createHash('sha256').update(data).digest('hex')!==expected.sha256)throw Error('Character model mismatch: '+file);
}
for(const file of ['together.lua','yoshi.lua'])readFileSync('site/mods/'+file);
if(rom.length!==manifest.rom.bytes||createHash('sha1').update(rom).digest('hex')!==manifest.rom.sha1)throw Error('ROM identity mismatch');
console.log('Syntax, page assets and pinned engine/ROM identities verified.');
