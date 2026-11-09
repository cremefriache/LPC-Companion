import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {webcrypto} from 'node:crypto';
import {createFullCatalog} from '../src/catalog/full-catalog.mjs';import {createFullArtStore} from '../src/composition/full-art-store.mjs';import {createSourceAvailability} from '../src/catalog/source-availability.mjs';import {createFullState} from '../src/state/full-state.mjs';import {createSourceModelContracts} from '../src/state/source-model-contract.mjs';import {sourceFixture} from '../tools/full-catalog-fixtures.mjs';import {createDefinition} from '../src/state/defaults.mjs';import {createModelControl} from '../src/adapter/model-control.mjs';import {createToolHub} from '../src/adapter/tool-hub.mjs';import {readChatContext} from '../src/adapter/context.mjs';import {readRosterContext,rosterKey} from '../src/adapter/roster-context.mjs';import {matchesMemberResponse} from '../src/state/model-contract.mjs';import {readCloset,addClosetEntry,toggleClosetLayer,unequipOutfitSlot,saveWornAsOutfit,applyModelClosetChanges} from '../src/state/closet.mjs';import {swatchGradientForRamp,swatchChannelsForItem,describeSelectionColor} from '../src/presentation/closet-ui.mjs';
const root=new URL('../',import.meta.url),json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8')),metadata=await json('vendor/lpc/full-catalog/metadata.json'),repairs=await json('vendor/lpc/full-catalog/repairs.json'),index=JSON.parse(gunzipSync(await readFile(new URL('assets/lpc/full-source/index.json.gz',root)))),store=createFullArtStore({index,readPack(){throw Error('Capability descriptions must not read PNG banks.');}}),catalog=createFullCatalog({metadata,repairs,assets:store.assets()}),availability=createSourceAvailability({catalog,evidenceFor:store.evidenceFor}),state=createFullState(catalog,{validatePlan:availability.validate}),runtime={catalog,state,availability};
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function definition(){const d=state.createDefinition(sourceFixture(metadata,'hair_natural'),ids[0],{restActionId:'walk'}),shield=sourceFixture(metadata,'shield_heater_revised_wood').selections.shield;d.outfits.push({...structuredClone(d.outfits[0]),id:'covered',name:'With shield',selections:{shield},selectionOrder:[...d.outfits[0].selectionOrder,'shield']});return state.validateDefinition(d);}
test('source tools validate native held poses, three ongoing loops and whole-program capabilities',()=>{
 const d=definition(),model=createSourceModelContracts(runtime),base={requestId:'one',established:true},contract=model.contractFor(d,d.startingPresentation);
 contract.schema.properties.outfitId.enum.push('invented');contract.schema.required.push('companionId');const fresh=model.contractFor(d,d.startingPresentation);assert(!fresh.schema.properties.outfitId.enum.includes('invented'));assert(!fresh.schema.required.includes('companionId'));
 const held=contract.validate({...base,playback:{mode:'hold',actionId:'hurt',frame:2},facing:'west'});assert.equal(held.presentation.playback.frame,2);assert.equal(held.presentation.facing,'west');assert.equal(d.startingPresentation.playback.actionId,'walk');
 assert.equal(contract.validate({...base,playback:{mode:'loop',actionId:'run'}}).presentation.playback.mode,'loop');assert.equal(contract.validate({...base,outfitId:'covered'}).presentation.playback.mode,'hold');
 const seq=contract.validate({...base,sequence:[{actionId:'walk'},{actionId:'spellcast'}]});assert.equal(seq.sequence.length,2);assert.equal(seq.presentation.playback.mode,'hold');assert(!('sequence'in seq.presentation));
 for(const patch of [{playback:{mode:'loop',actionId:'jump'}},{playback:{mode:'hold',actionId:'walk',frame:63}},{identity:{}},{posture:'walk'},{activityId:'run'},{outfitId:'invented'},{established:false},{actionId:'invented'},{sequence:[]},{sequence:[{actionId:'walk',durationMs:1}]},{actionId:'walk',sequence:[{actionId:'walk'}]}])assert.throws(()=>contract.validate({...base,...patch}));
 assert.throws(()=>contract.validate({...base,outfitId:'covered',actionId:'spellcast'}),/blank south/);assert.throws(()=>model.programFor(Array(5).fill({actionId:'walk'}),d,d.startingPresentation),/1–4/);
});
test('source context describes real identity and current parts, valid frames, authored views and outfit-specific capabilities',()=>{
 const d=definition(),model=createSourceModelContracts(runtime),start=performance.now(),data=model.contextDataFor(d,d.startingPresentation),ms=performance.now()-start;
 assert.equal(data.identity.selections.hair.itemId,'hair_natural');assert.equal(data.identity.selections.hair.name,'Natural');assert.deepEqual(data.currentParts,{});assert(data.poses.heldFrames.hurt.includes(2));assert(data.poses.authoredViews.includes('hurt'));assert(!data.outfits.find(o=>o.id==='covered').supported.includes('spellcast'));assert(data.outfits[0].supported.includes('spellcast'));
 const again=model.contextDataFor(d,d.startingPresentation);assert.deepEqual(again,data);assert.equal(store.stats().loads,0);assert(model.stats().capabilityEntries<=model.stats().maxCapabilityEntries);model.clear();assert.equal(model.stats().capabilityEntries,0);assert(ms<1500,'Two-outfit context projection must remain bounded on the desktop runner.');
});
function fixture(group=false){
 const records=[definition(),createDefinition(ids[1])].map(definition=>({definition,presentation:structuredClone(definition.startingPresentation),binding:{}})),listeners=new Map(),tools=new Map(),applied=[];let generating=true,failPrepare=false,prepared=0;
 const names=['GENERATION_STARTED','CHAT_COMPLETION_PROMPT_READY','TOOL_CALLS_PERFORMED','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','MESSAGE_EDITED','GROUP_WRAPPER_FINISHED'];
 const context={characterId:0,characters:[{avatar:'A.png'},{avatar:'B.png'}],groupId:group?'G':null,groups:[{id:'G',chat_id:'Chat',chats:['Chat'],members:['A.png','B.png']}],chatId:'Chat',chatMetadata:{integrity:ids[0]},getCurrentChatId:()=>context.chatId,chat:[],isToolCallingSupported:()=>true,canPerformToolCalls:type=>type==='normal',registerFunctionTool:tool=>tools.set(tool.name,tool),unregisterFunctionTool:name=>tools.delete(name),eventTypes:Object.fromEntries(names.map(n=>[n,n])),eventSource:{on(n,fn){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(fn);},removeListener(n,fn){listeners.get(n)?.delete(fn);}}};
 const emit=async(n,...args)=>{for(const fn of [...listeners.get(n)??[]])await fn(...args);},hub=createToolHub({getContext:()=>context});hub.start();const active=group?readRosterContext(context):readChatContext(context),source=createSourceModelContracts(runtime);
 const controls=records.map((record,i)=>createModelControl({active,getContext:()=>context,getRecord:()=>record,isGenerating:()=>generating,crypto:webcrypto,hub,ownerKey:String(i),label:i?'Curated':'Source',defaultBindings:i===0,...(i===0?source:{}),
  ...(group?{resolveContext:readRosterContext,contextKey:rosterKey,explicitTarget:true,canTarget:()=>context.characterId===i,responseAllowed:m=>m?.original_avatar===context.characters[i].avatar,deferGroupAcceptance:true,matchesAccepted:(chat,response)=>matchesMemberResponse(chat,response,context.characters[i].avatar)}:{}),
  prepare:async()=>{prepared++;if(failPrepare)throw Error('Fixture image unavailable');},apply:async(pending,current)=>{if(current()){applied.push({i,pending});record.presentation=pending.presentation;}},report:()=>{}}));controls.forEach(c=>c.enable(true));
 return {context,records,tools,applied,emit,controls,prepared:()=>prepared,failPrepare(){failPrepare=true;},async begin(i=0){context.characterId=i;generating=true;await emit('GENERATION_STARTED','normal',{},false);},call:async args=>JSON.parse(await tools.get('lpc_present').action(args)),async receipt(result){const invocation={name:'lpc_present',result:JSON.stringify(result)};context.chat.push({is_system:true,extra:{tool_invocations:[invocation]}});await emit('TOOL_CALLS_PERFORMED',[invocation]);},async finish(avatar='A.png'){context.chat.push({mes:'Established presentation.',original_avatar:avatar,is_user:false});await emit('MESSAGE_RECEIVED',context.chat.length-1);generating=false;await emit('GENERATION_ENDED');},async endGroup(){context.characterId=undefined;await emit('GROUP_WRAPPER_FINISHED');},dispose(){controls.forEach(c=>c.dispose());hub.stop();}};
}
test('mixed source/curated tools use separate schemas, one compact context, exact bindings and accepted receipts',async()=>{
 const f=fixture();try{await f.begin();const args={companionId:ids[0],requestId:'one',established:true,playback:{mode:'loop',actionId:'run'}},result=await f.call(args);assert.equal(result.status,'prepared');assert.equal(result.applied,false);assert.equal(f.applied.length,0);assert.deepEqual(await f.call(args),result);assert.equal(f.prepared(),1);
  assert.equal((await f.call({...args,requestId:'bad',posture:'walk'})).status,'error');assert.equal((await f.call({...args,companionId:ids[1],requestId:'bad'})).status,'error');
  const prompt={chat:[{role:'system',content:`[[LPC_POSTURE]] / [[LPC_OUTFIT:${ids[1]}]]`}],dryRun:false};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);assert.equal(prompt.chat.length,2);assert.equal(prompt.chat[0].content,'run / Everyday');const data=JSON.parse(prompt.chat[1].content.split('\n').slice(1).join('\n'));assert.equal(data.companions[0].format,'lpc-source-v1');assert.equal(data.companions[1].format,'curated-v1');assert.equal(data.companions[0].accepted.playback.mode,'hold');assert.equal(data.companions[0].prepared.playback.mode,'loop');assert(data.companions[0].controls.poses.heldFrames.walk);assert(!('activities'in data));assert(prompt.chat[1].content.length<16000);
  await f.receipt(result);await f.finish();assert.equal(f.applied.length,1);assert.equal(f.applied[0].i,0);assert.equal(f.records[0].presentation.playback.actionId,'run');assert.equal(f.records[1].presentation.outfitId,'everyday');await f.emit('GENERATION_ENDED');assert.equal(f.applied.length,1);
 }finally{f.dispose();}
});
test('source preparation failures, aborts and missing verified tool records cannot authorize a patch',async()=>{
 for(const mode of ['prepare','abort','missing']){const f=fixture();try{await f.begin();const args={companionId:ids[0],requestId:'one',established:true,playback:{mode:'loop',actionId:'walk'}};if(mode==='prepare')f.failPrepare();const result=await f.call(args);if(mode==='prepare')assert.equal(result.status,'error');else{await f.receipt(result);if(mode==='abort')await f.emit('GENERATION_STOPPED');else f.context.chat=[];}await f.finish();assert.equal(f.applied.length,0);}finally{f.dispose();}}
});
test('source group controls reject another member and wait for the completed batch before applying',async()=>{
 const f=fixture(true);try{await f.begin();assert.equal((await f.call({companionId:ids[1],requestId:'bad',established:true,outfitId:'summer'})).status,'error');const result=await f.call({companionId:ids[0],requestId:'one',established:true,playback:{mode:'hold',actionId:'hurt',frame:0}});assert.equal(result.status,'prepared');await f.receipt(result);await f.finish();assert.equal(f.applied.length,0);await f.endGroup();assert.equal(f.applied.length,1);assert.equal(f.applied[0].i,0);
 }finally{f.dispose();}
});
test('reviewed Formal and wound colors are offered by the same full-outfit model contracts',()=>{
 const model=createSourceModelContracts(runtime);for(const [id,actionId]of [['legs_formal','walk'],['wound_eye_left','thrust']])for(const body of catalog.item(id).required){const recipe=sourceFixture(metadata,id,body),slot=catalog.item(id).type_name;recipe.selections[slot].colors[slot]='cloth.ulpc.blue';const d=state.createDefinition(recipe,ids[0],{restActionId:actionId}),data=model.contextDataFor(d,d.startingPresentation),contract=model.contractFor(d,d.startingPresentation);assert(data.poses.heldFrames[actionId].includes(0));assert.equal(contract.validate({requestId:'reviewed-color',established:true,playback:{mode:'hold',actionId,frame:0}}).presentation.playback.actionId,actionId);if(id==='legs_formal'){assert(data.poses.loops.includes('walk'));assert.equal(contract.validate({requestId:'reviewed-loop',established:true,playback:{mode:'loop',actionId:'walk'}}).presentation.playback.mode,'loop');}}
});
test('visual color ramps and character closet toggle worn layers and save numbered outfits',()=>{
 const baseRamp=catalog.colorRamp('torso_clothes_tshirt','clothes','');
 const navyRamp=catalog.colorRamp('torso_clothes_tshirt','clothes','cloth.ulpc.navy');
 assert(baseRamp.length>=3);assert(navyRamp.length>=3);assert.notDeepEqual(baseRamp,navyRamp);
 assert(swatchGradientForRamp(navyRamp).startsWith('linear-gradient(90deg, #'));
 const d=definition();
 const added=addClosetEntry(d,{slot:'clothes',itemId:'torso_clothes_tshirt',variant:null,colors:{clothes:'cloth.ulpc.navy'}},catalog);
 assert.equal(added.colors.clothes,'cloth.ulpc.navy');
 const closetList=readCloset(d,catalog);
 assert(closetList.some(e=>e.itemId==='torso_clothes_tshirt'&&e.colors.clothes==='cloth.ulpc.navy'));
 assert(closetList.some(e=>e.itemId==='shield_heater_revised_wood'));
 const withShirt=toggleClosetLayer(d,'imported',added,catalog);
 assert.equal(withShirt.outfits[0].selections.clothes.itemId,'torso_clothes_tshirt');
 assert.equal(withShirt.outfits[0].selections.clothes.colors.clothes,'cloth.ulpc.navy');
 state.validateDefinition(withShirt);
 const withoutShirt=unequipOutfitSlot(withShirt,'imported','clothes',catalog);
 assert.equal(withoutShirt.outfits[0].selections.clothes,undefined);
 assert(readCloset(withoutShirt,catalog).some(e=>e.itemId==='torso_clothes_tshirt'&&e.colors.clothes==='cloth.ulpc.navy'));
 const {definition:savedDef,outfitId:newId}=saveWornAsOutfit(withShirt,'imported','Casual Navy',catalog);
 assert.equal(newId,'01');
 assert.equal(savedDef.outfits.find(o=>o.id==='01').name,'Casual Navy');
 const {definition:savedDef2,outfitId:newId2}=saveWornAsOutfit(savedDef,'01','Evening Navy',catalog);
 assert.equal(newId2,'02');
 assert.equal(savedDef2.outfits.find(o=>o.id==='02').name,'Evening Navy');
 state.validateDefinition(savedDef2);
 const bicorne=catalog.item('hat_bicorne_athwart_admiral');
 const bicorneChannels=swatchChannelsForItem(catalog,bicorne);
 assert.equal(bicorneChannels.length,1);
 assert.equal(bicorneChannels[0].isVariant,true);
 assert(bicorneChannels[0].choices.includes('navy'));
 const bicorneDesc=describeSelectionColor(catalog,bicorne,{itemId:'hat_bicorne_athwart_admiral',variant:'navy',colors:{}});
 assert.equal(bicorneDesc.label,'Navy');
 assert(bicorneDesc.ramp.length>=3);
 assert(!readCloset(savedDef2,catalog,undefined,{includeOutfits:false}).some(e=>e.itemId==='hat_bicorne_athwart_admiral'));
 addClosetEntry(savedDef2,{slot:'hat',itemId:'hat_bicorne_athwart_admiral',variant:'navy',colors:{}},catalog);
 assert(readCloset(savedDef2,catalog,undefined,{includeOutfits:false}).some(e=>e.itemId==='hat_bicorne_athwart_admiral'&&e.variant==='navy'));
});
test('scoped source prompt and lpc_outfit expose character closet items and wear/remove layers on the fly',async()=>{
 const d=definition();
 addClosetEntry(d,{slot:'hat',itemId:'hat_formal_crown',variant:null,colors:{hat:'metal.ulpc.crown_gold'}},catalog);
 const model=createSourceModelContracts(runtime);
 const compactData=model.contextDataFor(d,d.startingPresentation,{compact:true});
 assert(Array.isArray(compactData.closet));
 const crownEntry=compactData.closet.find(c=>c.name==='Crown');
 assert(crownEntry);
 assert.equal(crownEntry.id,'c01');
 assert.equal(crownEntry.slot,'hat');
 assert.equal(crownEntry.worn,false);
 const scopedTools=model.toolsFor(d,d.startingPresentation);
 const outfitTool=scopedTools.find(t=>t.name==='lpc_outfit');
 assert(outfitTool.parameters.properties.wear.items.enum.includes('c01'));
 assert(outfitTool.parameters.properties.remove.items.enum.includes('c01'));

 const record={definition:structuredClone(d),presentation:structuredClone(d.startingPresentation),binding:{}};
 const listeners=new Map(),tools=new Map(),applied=[];let generating=true;
 const names=['GENERATION_STARTED','CHAT_COMPLETION_PROMPT_READY','TOOL_CALLS_PERFORMED','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','MESSAGE_EDITED','GROUP_WRAPPER_FINISHED'];
 const context={characterId:0,characters:[{avatar:'A.png',name:'Seraphina'}],groupId:null,groups:[],chatId:'Chat',chatMetadata:{integrity:ids[0]},getCurrentChatId:()=>context.chatId,chat:[],isToolCallingSupported:()=>true,canPerformToolCalls:type=>type==='normal',registerFunctionTool:tool=>tools.set(tool.name,tool),unregisterFunctionTool:name=>tools.delete(name),eventTypes:Object.fromEntries(names.map(n=>[n,n])),eventSource:{on(n,fn){if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(fn);},removeListener(n,fn){listeners.get(n)?.delete(fn);}}};
 const emit=async(n,...args)=>{for(const fn of [...listeners.get(n)??[]])await fn(...args);};
 const toolPolicy={get:()=>({enabled:true,toolCalling:true,shareContext:true,toolScope:'scene'}),subscribe:()=>()=>{}};
 const hub=createToolHub({getContext:()=>context,toolPolicy});hub.start();
 const control=createModelControl({active:readChatContext(context),getContext:()=>context,getRecord:()=>record,isGenerating:()=>generating,crypto:webcrypto,hub,toolPolicy,ownerKey:'primary',label:'Primary companion',...model,
  prepare:async()=>{},apply:async(pending,current)=>{if(current()){applied.push(pending);record.definition=pending.definition;record.presentation=pending.presentation;}},report:()=>{}});
 control.enable(true);
 try{
  await emit('GENERATION_STARTED','normal',{},false);
  const prompt={chat:[{role:'user',content:'Put on the crown.'}],dryRun:false};
  await emit('CHAT_COMPLETION_PROMPT_READY',prompt);
  const sysPayload=JSON.parse(prompt.chat.at(-1).content.split('\n').slice(1).join('\n'));
  assert(sysPayload.companions[0].closet.some(c=>c.id==='c01'&&c.name==='Crown'&&c.worn===false));

  const rawResult=await tools.get('lpc_outfit').action({wear:['c01']});
  const parsed=JSON.parse(rawResult);
  assert.equal(parsed.status,'prepared');
  assert.equal(record.definition.outfits[0].selections.hat,undefined,'Preparation must not mutate the accepted outfit.');
  const inv={name:'lpc_outfit',result:rawResult};
  context.chat.push({is_system:true,extra:{tool_invocations:[inv]}});
  await emit('TOOL_CALLS_PERFORMED',[inv]);
  context.chat.push({mes:'She places the golden crown upon her head.',original_avatar:'A.png',is_user:false});
  await emit('MESSAGE_RECEIVED',context.chat.length-1);
  generating=false;
  await emit('GENERATION_ENDED');
  assert.equal(applied.length,1);
  assert.equal(record.definition.outfits[0].selections.hat.itemId,'hat_formal_crown');

  generating=true;
  await emit('GENERATION_STARTED','normal',{},false);
  const removeResult=await tools.get('lpc_outfit').action({remove:['c01']});
  const parsedRemove=JSON.parse(removeResult);
  assert.equal(parsedRemove.status,'prepared');
  const invRemove={name:'lpc_outfit',result:removeResult};
  context.chat.push({is_system:true,extra:{tool_invocations:[invRemove]}});
  await emit('TOOL_CALLS_PERFORMED',[invRemove]);
  context.chat.push({mes:'She gently removes the crown.',original_avatar:'A.png',is_user:false});
  await emit('MESSAGE_RECEIVED',context.chat.length-1);
  generating=false;
  await emit('GENERATION_ENDED');
  assert.equal(applied.length,2);
  assert.equal(record.definition.outfits[0].selections.hat,undefined);
  generating=true;await emit('GENERATION_STARTED','normal',{},false);
  const stale=await tools.get('lpc_outfit').action({wear:['c01']});
  assert.equal(JSON.parse(stale).status,'prepared');
  record.definition.outfits[0].name='Manual edit while generation was pending';
  const staleInvocation={name:'lpc_outfit',result:stale};
  context.chat.push({is_system:true,extra:{tool_invocations:[staleInvocation]}});
  await emit('TOOL_CALLS_PERFORMED',[staleInvocation]);
  context.chat.push({mes:'She puts it on.',original_avatar:'A.png',is_user:false});
  await emit('MESSAGE_RECEIVED',context.chat.length-1);generating=false;await emit('GENERATION_ENDED');
  assert.equal(applied.length,2,'A changed accepted definition must discard pending closet changes.');
  assert.equal(record.definition.outfits[0].selections.hat,undefined);
 }finally{
  control.dispose();
  hub.stop();
 }
});

test('model closet changes reject unworn IDs and guessed item names without changing identity or input',()=>{
 const d=definition();d.characterId='33333333-3333-4333-8333-333333333333';
 const crown={slot:'hat',itemId:'hat_formal_crown',variant:null,colors:{hat:'metal.ulpc.crown_gold'}};
 addClosetEntry(d,crown,catalog);
 const before=structuredClone(d),outfitId=d.startingPresentation.outfitId;
 assert.throws(()=>applyModelClosetChanges(d,outfitId,{remove:['c01']},catalog),/not currently worn/);
 assert.throws(()=>applyModelClosetChanges(d,outfitId,{wear:['Crown']},catalog),/listed closet id/);
 assert.throws(()=>applyModelClosetChanges(d,outfitId,{wear:['c99']},catalog),/Unknown closet item/);
 const wearing=applyModelClosetChanges(d,outfitId,{wear:['c01']},catalog);
 assert.deepEqual(wearing.identity,d.identity);
 const removed=applyModelClosetChanges(wearing,outfitId,{remove:['hat']},catalog);
 assert.equal(removed.outfits.find(o=>o.id===outfitId).selections.hat,undefined);
 assert.deepEqual(d,before);
});

test('model closet replacements follow the accepted response through deletion and independent branches',()=>{
 const d=definition();d.characterId='44444444-4444-4444-8444-444444444444';
 addClosetEntry(d,{slot:'hat',itemId:'hat_formal_crown',variant:null,colors:{hat:'metal.ulpc.crown_gold'}},catalog);
 const wearing=applyModelClosetChanges(d,d.startingPresentation.outfitId,{wear:['c01']},catalog);
 const initial=state.initializeState(d,()=>webcrypto.randomUUID());
 const result=state.appendChange(initial,[{is_user:false,mes:'She puts on the crown.'}],{schemaVersion:2,kind:'companion-replacement',definition:wearing,presentation:wearing.startingPresentation},()=>webcrypto.randomUUID(),'model');
 assert.equal(result.state.history[0].origin,'model');
 assert.deepEqual(state.reconstruct(result.state,result.messages).definition,wearing);
 assert.deepEqual(state.reconstruct(result.state,[]).definition,d);
 const branch=structuredClone(result);
 const removed=applyModelClosetChanges(wearing,d.startingPresentation.outfitId,{remove:['c01']},catalog);
 const next=state.appendChange(branch.state,[...branch.messages,{is_user:false,mes:'She removes it.'}],{schemaVersion:2,kind:'companion-replacement',definition:removed,presentation:removed.startingPresentation},()=>webcrypto.randomUUID(),'model');
 assert.equal(state.reconstruct(next.state,next.messages).definition.outfits[0].selections.hat,undefined);
 assert.deepEqual(state.reconstruct(result.state,result.messages).definition,wearing,'The original branch must keep its accepted crown.');
});
