import test from 'node:test';import assert from 'node:assert/strict';
import {inspectSourceVisibility} from '../src/catalog/full-coverage.mjs';
const layer=(id,hash,extra={})=>({itemId:id,sha256:hash,frames:[{sx:0,sy:0,sw:128,sh:64,dx:0,dy:0,dw:128,dh:64}],...extra});
const plan=layers=>({layout:{frameWidth:64,directions:['authored'],cycle:[0,1,0]},layers});
test('visibility joins required item layers without allowing another item or a mask to conceal blank frames',()=>{
 const data={front:{width:128,height:64,physical64CellNonblankPixels:[4,0]},back:{width:128,height:64,physical64CellNonblankPixels:[0,8]},blank:{width:128,height:64,physical64CellNonblankPixels:[0,0]}};
 const joined=inspectSourceVisibility(plan([layer('hair','front'),layer('hair','back'),layer('body','blank'),layer('body','front',{isMask:true})]),k=>data[k]);
 assert.equal(joined[0].frames.length,2);assert.equal(joined[0].blankFrames.length,0);assert(joined[1].fullyBlank);assert.deepEqual(joined[1].fullyBlankDirections,['authored']);
});
test('visibility follows source row crops and custom centered source remaps; absent alpha data stays unknown',()=>{
 const art={width:64,height:128,physical64CellNonblankPixels:[0,13]},p={layout:{frameWidth:128,directions:['north'],cycle:[0]},layers:[layer('hair','a',{frames:[{sx:0,sy:64,sw:64,sh:64,dx:32,dy:32,dw:64,dh:64}]})]};
 assert.equal(inspectSourceVisibility(p,()=>art)[0].frames[0].nonblankPixelSum,13);
 const unknown=inspectSourceVisibility(p,()=>null)[0];assert(unknown.unmeasurable);assert(!unknown.fullyBlank);assert.equal(unknown.blankFrames.length,0);
});
