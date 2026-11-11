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
test('more than four distinct concurrent bank reads queue FIFO with AbortSignal cancellation, waiter bounds, and dispose drain',async()=>{
 const count=10,packs=[],paths={},blobs={},payloads=[];
 for(let i=0;i<count;i++){
  const bytes=new Uint8Array([i,1,2,3,4,5,6,7]),sha=sha256Hex(bytes);
  payloads.push({bytes,sha});
  packs.push({file:`art-${String(i).padStart(4,'0')}.bin`,bytes:8,sha256:sha});
  paths[`p${i}a`]=sha;paths[`p${i}b`]=sha;
  blobs[sha]={pack:i,offset:0,length:8,width:1,height:1};
 }
 const fixture={schemaVersion:1,kind:'lpc-full-art-library',packByteLimit:256*1024,packs,paths,blobs};
 const started=[],resolvers=new Map();let inFlight=0,peakInFlight=0;
 const store=createFullArtStore({
  index:fixture,
  maxConcurrentPacks:4,
  maxQueuedPacks:4,
  readPack:descriptor=>{
   const id=Number(descriptor.file.slice(4,8));
   started.push(id);
   inFlight++;peakInFlight=Math.max(peakInFlight,inFlight);
   return new Promise(resolve=>{resolvers.set(id,()=>{inFlight--;resolve(payloads[id].bytes);});});
  },
 });
 // Launch 4 active (0..3) + 4 queued (4..7), coalescing shared pack 4 and cancelling sole pack 5 mid-queue.
 const c4=new AbortController(),c5=new AbortController();
 const p0=store.loadBytes('p0a',payloads[0].sha);
 const p1=store.loadBytes('p1a',payloads[1].sha);
 const p2=store.loadBytes('p2a',payloads[2].sha);
 const p3=store.loadBytes('p3a',payloads[3].sha);
 const p4Cancelled=store.loadBytes('p4a',payloads[4].sha,{signal:c4.signal});
 const p4Kept=store.loadBytes('p4b',payloads[4].sha);
 const p5Sole=store.loadBytes('p5a',payloads[5].sha,{signal:c5.signal});
 const p6=store.loadBytes('p6a',payloads[6].sha);
 const p7=store.loadBytes('p7a',payloads[7].sha);
 // Queue is now full (4 active + 4 queued); 9th distinct pack rejects with busy, while duplicate pack 7 coalesces.
 await assert.rejects(store.loadBytes('p8a',payloads[8].sha),/Artwork library is busy/);
 const p7Coalesced=store.loadBytes('p7b',payloads[7].sha);
 await Promise.resolve();
 assert.deepEqual(started,[0,1,2,3]);
 assert.equal(store.stats().active,4);
 assert.equal(store.stats().queued,4);
 // Cancel sole waiter on pack 5 -> immediately frees one queue slot without ever starting pack 5!
 c5.abort();
 await assert.rejects(p5Sole,/cancelled/);
 assert.equal(store.stats().queued,3);
 const p8=store.loadBytes('p8a',payloads[8].sha);
 assert.equal(store.stats().queued,4);
 // Cancel one of two waiters on pack 4 -> pack 4 keeps its FIFO slot for p4Kept.
 c4.abort();
 await assert.rejects(p4Cancelled,/cancelled/);
 assert.equal(store.stats().queued,4);
 // Finish packs in order and verify strict FIFO promotion (4, 6, 7, 8 — skipping cancelled 5).
 for(const id of [0,1,2,3]){resolvers.get(id)();await new Promise(r=>setTimeout(r,0));}
 assert.deepEqual(started,[0,1,2,3,4,6,7,8]);
 assert.equal(peakInFlight,4);
 for(const id of [4,6,7,8])resolvers.get(id)();
 assert.deepEqual(await Promise.all([p0,p1,p2,p3,p4Kept,p6,p7,p7Coalesced,p8]),[0,1,2,3,4,6,7,7,8].map(i=>payloads[i].bytes));
 assert.equal(store.stats().loads,8);
 // Verify dispose drains both active and queued waiters immediately.
 const store2=createFullArtStore({index:fixture,maxConcurrentPacks:2,maxQueuedPacks:2,readPack:()=>new Promise(()=>{})});
 const w0=store2.loadBytes('p0a',payloads[0].sha),w1=store2.loadBytes('p1a',payloads[1].sha),w2=store2.loadBytes('p2a',payloads[2].sha);
 store2.dispose();
 await assert.rejects(w0,/closed/);await assert.rejects(w1,/closed/);await assert.rejects(w2,/closed/);
 store.dispose();
});
