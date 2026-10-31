// Fetch the inspected upstream artifact set; fail closed if upstream changed.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://zalo.github.io/sm64coopdx/';
const files=[
 ['sm64coopdx.js','.build/upstream.js','b4c7e2e660086ba9dabd9f0cfa27df2a0d2e5b274b1235e9b5e69bb1abbf150b'],
 ['sm64coopdx.data','.build/upstream.data','59fffc9da6a97691b3d204baec99f3e2ee589f6e1bd346a68aeebebaed422279'],
 ['','.build/upstream.html','f7e40fb2c99bae0670bf6bb4fbd6ae89a23a6836fdddf74fdb3f0d990fb93efc'],
 ['sm64coopdx.wasm','site/engine/sm64coopdx.wasm','83a331d2701e382f7887a1146efa584913baade2d5d3db389c55c3c4ffc5ddb8']
];
await mkdir('.build',{recursive:true});await mkdir('site/engine',{recursive:true});
for(const [remote,path,hash] of files){
 const response=await fetch(base+remote);if(!response.ok)throw Error(`Download failed: ${response.status} ${remote}`);
 const data=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(data).digest('hex')!==hash)throw Error(`Upstream ${remote||'index.html'} changed. Inspect and test a new pinned engine before updating.`);
 await writeFile(path,data);console.log(`Verified ${path}`);
}
