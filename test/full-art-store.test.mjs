import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {createFullArtStore,sha256Hex} from '../src/composition/full-art-store.mjs';
const root=new URL('../assets/lpc/full-source/',import.meta.url),index=JSON.parse(gunzipSync(await readFile(new URL('index.json.gz',root))));
test('complete offline banks reproduce every compiled original PNG hash within byte bounds',async()=>{
 const paths=new Map(Object.entries(index.paths).map(([p,s])=>[s,p]));let loads=0;const store=createFullArtStore({index,readPack:async d=>{loads++;return new Uint8Array(await readFile(new URL(d.file,root)));}});
 for(const [sha,b]of Object.entries(index.blobs).sort((a,b)=>a[1].pack-b[1].pack||a[1].offset-b[1].offset)){const bytes=await store.loadBytes(paths.get(sha),sha);assert.equal(bytes.length,b.length);assert.equal(sha256Hex(bytes),sha);assert(store.stats().bytes<=store.stats().maxBytes);}
 assert(index.packs.every(p=>p.bytes<=256*1024));assert.equal(paths.size,72914);assert.equal(loads,index.packs.length);await assert.rejects(store.loadBytes('https://example.com/art.png','a'.repeat(64)),/Unknown/);assert.equal(store.assets().length,73924);store.dispose();assert.equal(store.stats().bytes,0);
});
test('bank corruption rejects without caching; disposed pending reads cannot regain ownership',async()=>{
 const [path,sha]=Object.entries(index.paths)[0],bad=createFullArtStore({index,readPack:async d=>new Uint8Array(d.bytes)});await assert.rejects(bad.loadBytes(path,sha),/verification/);assert.equal(bad.stats().bytes,0);bad.dispose();
 let resolve;const pending=createFullArtStore({index,readPack:()=>new Promise(r=>resolve=r)}),work=pending.loadBytes(path,sha);pending.dispose();resolve(new Uint8Array());await assert.rejects(work,/closed/);assert.equal(pending.stats().bytes,0);await assert.rejects(pending.loadBytes(path,sha),/closed/);
});
test('shared bank reads coalesce while cancellation remains local to each image request',async()=>{
 const bytes=new Uint8Array([1,2,3,4,5,6,7,8]),sha=sha256Hex(bytes),small={schemaVersion:1,kind:'lpc-full-art-library',packByteLimit:256*1024,packs:[{file:'art-0000.bin',bytes:8,sha256:sha}],paths:{one:sha,two:sha},blobs:{[sha]:{pack:0,offset:0,length:8,width:1,height:1}}};let finish,loads=0;const controller=new AbortController(),store=createFullArtStore({index:small,readPack:()=>{loads++;return new Promise(resolve=>finish=resolve);}}),first=store.loadBytes('one',sha,{signal:controller.signal}),second=store.loadBytes('two',sha);controller.abort();finish(bytes);await assert.rejects(first,/cancelled/);assert.deepEqual(await second,bytes);assert.equal(loads,1);assert.equal(store.stats().pending,0);store.dispose();
});
