import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createDefinition } from '../src/state/defaults.mjs';
import { createModelControl } from '../src/adapter/model-control.mjs';
import { createToolHub } from '../src/adapter/tool-hub.mjs';
import { readChatContext } from '../src/adapter/context.mjs';
import { readRosterContext,rosterKey } from '../src/adapter/roster-context.mjs';
import { matchesMemberResponse } from '../src/state/model-contract.mjs';

function policy(initial={}){
    let value={enabled:true,toolCalling:true,shareContext:true,...initial};const listeners=new Set();
    return {get:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},set(patch){value={...value,...patch};for(const fn of listeners)fn();},size:()=>listeners.size};
}
function fixture(group=false,defer=false,toolPolicy){
    const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
    const records=ids.map(id=>{const definition=createDefinition(id);return {definition,presentation:structuredClone(definition.startingPresentation),binding:{}};});
    const listeners=new Map(),tools=new Map(),applied=[];let generating=true,prepare=async()=>{},applyHook=async()=>{};
    const names=['GENERATION_STARTED','CHAT_COMPLETION_PROMPT_READY','TOOL_CALLS_PERFORMED','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','MESSAGE_EDITED','GROUP_WRAPPER_FINISHED'];
    const context={characterId:0,characters:[{avatar:'A.png'},{avatar:'B.png'}],groupId:group?'G':null,groups:[{id:'G',chat_id:'Chat',chats:['Chat'],members:['A.png','B.png']}],chatId:'Chat',chatMetadata:{integrity:ids[0]},getCurrentChatId:()=>context.chatId,chat:[],isToolCallingSupported:()=>true,canPerformToolCalls:type=>type==='normal',registerFunctionTool:tool=>tools.set(tool.name,tool),unregisterFunctionTool:name=>tools.delete(name),eventTypes:Object.fromEntries(names.map(name=>[name,name])),eventSource:{on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeListener(name,fn){listeners.get(name)?.delete(fn);}}};
    const emit=async(name,...args)=>{for(const fn of [...listeners.get(name)??[]])await fn(...args);};
    const hub=createToolHub({getContext:()=>context,toolPolicy});hub.start();
    const active=group?readRosterContext(context):readChatContext(context);
    const controllers=records.map((record,index)=>createModelControl({active,getContext:()=>context,getRecord:()=>record,isGenerating:()=>generating,prepare:(...args)=>prepare(...args),apply:async(pending,current)=>{await applyHook(pending,current);if(current()){applied.push({id:ids[index],pending});record.presentation=pending.presentation;}},report:()=>{},crypto:webcrypto,hub,ownerKey:String(index),label:'Identical label',defaultBindings:!group&&index===0,
        ...(group?{resolveContext:readRosterContext,contextKey:rosterKey,explicitTarget:true,canTarget:()=>context.characterId===index,responseAllowed:message=>message?.original_avatar===context.characters[index].avatar,deferGroupAcceptance:defer,matchesAccepted:(chat,response)=>matchesMemberResponse(chat,response,context.characters[index].avatar)}:{})}));
    for(const controller of controllers)controller.enable(true);
    const begin=async index=>{context.characterId=index;generating=true;await emit('GENERATION_STARTED','normal',{},false);};
    const call=async args=>JSON.parse(await tools.get('lpc_present').action(args));
    async function receipt(result){const invocation={name:'lpc_present',result:JSON.stringify(result)};context.chat.push({is_system:true,extra:{tool_invocations:[invocation]}});await emit('TOOL_CALLS_PERFORMED',[invocation]);}
    async function finish(avatar,{running=false}={}){context.chat.push({mes:'Accepted targeted presentation.',is_user:false,is_system:false,original_avatar:avatar});await emit('MESSAGE_RECEIVED',context.chat.length-1);generating=running;await emit('GENERATION_ENDED');}
    return {ids,records,context,tools,listeners,controllers,hub,applied,begin,call,receipt,finish,emit,prepare:fn=>{prepare=fn;},applyHook:fn=>{applyHook=fn;},async endGroup(){generating=false;context.characterId=undefined;await emit('GROUP_WRAPPER_FINISHED');},dispose(){for(const controller of controllers)controller.dispose();hub.stop();}};
}
test('UUID-targeted and fallback outfit bindings insert every dollar replacement pattern literally',async()=>{
    const f=fixture(),names=['Costume $$ $& $` $\'','Other $$ $& $` $\''];
    for(let index=0;index<f.records.length;index++)f.records[index].definition.outfits[0].name=names[index];
    await f.begin(0);
    const prompt={chat:[{role:'system',content:`Before [[LPC_OUTFIT]] / [[LPC_OUTFIT:${f.ids[0]}]] / [[LPC_OUTFIT:${f.ids[1]}]] after.`}],dryRun:false};
    await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    assert.equal(prompt.chat[0].content,`Before ${names[0]} / ${names[0]} / ${names[1]} after.`);
    f.dispose();
});
test('two enabled panels require UUID targeting, keep one context and apply only the selected companion',async()=>{
    const f=fixture();assert.deepEqual(f.tools.get('lpc_present').parameters.oneOf.map(s=>s.properties.companionId.const),f.ids);await f.begin(0);
    const args={requestId:'same',established:true,outfitId:'evening'};
    assert.equal((await f.call(args)).status,'error');assert.equal((await f.call({...args,companionId:'unlisted'})).status,'error');
    const result=await f.call({...args,companionId:f.ids[1]});assert.equal(result.companionId,f.ids[1]);assert.equal(result.applied,false);
    const prompt={chat:[{role:'system',content:`[[LPC_OUTFIT]] / [[LPC_OUTFIT:${f.ids[1]}]]`}],dryRun:false};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    assert.equal(prompt.chat.length,2);assert.equal(prompt.chat[0].content,'Everyday / Evening');assert.equal(prompt.chat.filter(message=>message.content.startsWith('LPC companion live presentation')).length,1);
    await f.receipt(result);await f.finish();assert.equal(f.applied.length,1);assert.equal(f.applied[0].id,f.ids[1]);assert.equal(f.records[0].presentation.outfitId,'everyday');assert.equal(f.records[1].presentation.outfitId,'evening');
    f.controllers[1].dispose();assert.ok(f.tools.has('lpc_present'));f.dispose();assert.ok([...f.listeners.values()].every(set=>set.size===0));
});
test('identical request IDs are scoped per UUID and verified responses may independently update both targets',async()=>{
    const f=fixture();await f.begin(0);
    for(const id of f.ids){const result=await f.call({requestId:'shared',established:true,companionId:id,outfitId:'summer'});assert.equal(result.status,'prepared');await f.receipt(result);}
    await f.finish();assert.deepEqual(new Set(f.applied.map(value=>value.id)),new Set(f.ids));assert.ok(f.records.every(record=>record.presentation.outfitId==='summer'));f.dispose();
});
test('group tools require the member UUID and match the speaking avatar again at final response acceptance',async()=>{
    const f=fixture(true);await f.begin(0);const args={requestId:'group',established:true,outfitId:'summer'};
    assert.equal((await f.call(args)).status,'error');assert.equal((await f.call({...args,companionId:f.ids[1]})).status,'error');
    await f.receipt(await f.call({...args,companionId:f.ids[0]}));await f.finish('B.png');assert.equal(f.applied.length,0);
    await f.begin(1);assert.ok(f.tools.has('lpc_present'),'Speaker changes must refresh tool availability');
    assert.equal((await f.call({...args,companionId:f.ids[0]})).status,'error');await f.receipt(await f.call({...args,companionId:f.ids[1]}));await f.finish('B.png');assert.equal(f.applied.length,1);assert.equal(f.applied[0].id,f.ids[1]);f.dispose();
});

test('group batches retain each member’s verified final response and commit only after the wrapper finishes',async()=>{
    for(const aborted of [false,true]){
        const f=fixture(true,true);await f.begin(0);
        await f.receipt(await f.call({requestId:'batch',established:true,companionId:f.ids[0],outfitId:'summer',partySceneId:'woodland'}));await f.finish('A.png',{running:true});assert.equal(f.applied.length,0);
        await f.begin(1);await f.receipt(await f.call({requestId:'batch',established:true,companionId:f.ids[1],outfitId:'evening',partySceneId:'hearth'}));
        f.context.chat.push({mes:'',is_user:false,original_avatar:'B.png'});f.context.chat.pop();await f.emit('MESSAGE_DELETED');
        await f.begin(1);await f.finish('B.png',{running:true});assert.equal(f.applied.length,0);
        if(aborted)await f.emit('GENERATION_STOPPED');await f.endGroup();
        assert.equal(f.applied.length,aborted?0:2);if(!aborted){assert.equal(f.records[0].presentation.outfitId,'summer');assert.equal(f.records[1].presentation.outfitId,'evening');assert.equal(f.records[0].presentation.partySceneId,'woodland');assert.equal(f.records[1].presentation.partySceneId,'hearth');}else assert.ok(f.records.every(record=>record.presentation.partySceneId===undefined));
        f.dispose();
    }
});

test('master tool disable revokes prepared requests and rebuilds a reused prompt as accepted read-only context',async()=>{
    const prefs=policy(),f=fixture(false,false,prefs);await f.begin(0);
    const oldTool=f.tools.get('lpc_present');
    await f.receipt(await f.call({requestId:'prepared',established:true,companionId:f.ids[0],outfitId:'summer'}));
    const prompt={chat:[{role:'system',content:'Wearing [[LPC_OUTFIT]].'}]};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    assert.ok(JSON.parse(prompt.chat.at(-1).content.split('\n')[1]).allowedTargetIds.length);
    prefs.set({toolCalling:false});assert.equal(f.hub.toolsAllowed(),false);assert.equal(f.tools.size,0);
    assert.equal(JSON.parse(await oldTool.action({requestId:'late',established:true,companionId:f.ids[0],outfitId:'evening'})).status,'error');
    await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);assert.equal(prompt.chat.length,2);
    const data=JSON.parse(prompt.chat[1].content.split('\n')[1]);assert.equal(data.readOnly,true);assert.equal(data.companions[0].outfit.name,'Everyday');
    assert.equal(prompt.chat[0].content,'Wearing Everyday.','Prepared bindings must be replaced with accepted state on the same outgoing array.');
    assert.equal(data.companions[0].current.outfitId,'everyday');assert.ok(data.companions[0].currentParts.clothes.name);assert.ok(data.companions[0].currentParts.clothes.paletteId);
    for(const key of ['allowedTargetIds','rules','activities','sequence','stage','partyScenes'])assert.equal(Object.hasOwn(data,key),false);
    for(const key of ['prepared','outfits','controls'])assert.equal(Object.hasOwn(data.companions[0],key),false);
    prefs.set({toolCalling:true});await f.finish();assert.equal(f.applied.length,0);f.dispose();assert.equal(prefs.size(),0);
});

test('tool disable cancels queued and in-flight preparation even if re-enabled before they resume',async()=>{
    const prefs=policy(),f=fixture(false,false,prefs);await f.begin(0);
    let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});let preparations=0;
    f.prepare(async()=>{preparations++;entered();await gate;});
    const args={requestId:'first',established:true,companionId:f.ids[0],outfitId:'summer'},first=f.call(args);await started;
    const queued=f.call({...args,requestId:'queued'});prefs.set({toolCalling:false});prefs.set({toolCalling:true});await f.begin(0);release();
    assert.equal((await first).status,'error');assert.equal((await queued).status,'error');assert.equal(preparations,1);assert.equal(f.applied.length,0);
    assert.equal((await f.call({...args,requestId:'fresh'})).status,'prepared');f.dispose();
});

test('master LPC disable cancels group batch acceptance and final asynchronous application',async()=>{
    const prefs=policy(),f=fixture(true,true,prefs);await f.begin(0);
    await f.receipt(await f.call({requestId:'group',established:true,companionId:f.ids[0],outfitId:'summer'}));await f.finish('A.png',{running:true});
    prefs.set({enabled:false});assert.equal(f.tools.size,0);prefs.set({enabled:true});await f.endGroup();assert.equal(f.applied.length,0);f.dispose();
    const second=fixture(false,false,prefs);await second.begin(0);
    await second.receipt(await second.call({requestId:'apply',established:true,companionId:second.ids[0],outfitId:'summer'}));
    let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});second.applyHook(async()=>{entered();await gate;});
    const finishing=second.finish();await started;prefs.set({toolCalling:false});prefs.set({toolCalling:true});release();await finishing;
    assert.equal(second.applied.length,0);second.dispose();
});

test('passive closed-panel context is provider-independent, deduplicated and removed when sharing is disabled',async()=>{
    const prefs=policy({toolCalling:false}),f=fixture(false,false,prefs);
    for(const controller of f.controllers)controller.dispose();f.context.isToolCallingSupported=()=>false;
    const record=f.records[0];f.hub.update('passive',{label:'Closed companion',record:()=>record,describeAvailable:()=>true,available:()=>false,defaultBindings:true});
    const prompt={chat:[{role:'system',content:'Accepted [[LPC_OUTFIT]].'}]};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    assert.equal(prompt.chat[0].content,'Accepted Everyday.');assert.equal(JSON.parse(prompt.chat[1].content.split('\n')[1]).companions.length,1);assert.equal(f.tools.size,0);
    record.presentation={...record.presentation,outfitId:'summer'};
    const fresh={chat:[{role:'system',content:'Accepted [[LPC_OUTFIT]].'}]};await f.emit('CHAT_COMPLETION_PROMPT_READY',fresh);
    assert.equal(fresh.chat[0].content,'Accepted Summer.');
    prefs.set({shareContext:false});await f.emit('CHAT_COMPLETION_PROMPT_READY',fresh);
    assert.equal(fresh.chat.length,1);assert.equal(fresh.chat[0].content,'Accepted [[LPC_OUTFIT]].');
    prefs.set({shareContext:true,enabled:false});await f.emit('CHAT_COMPLETION_PROMPT_READY',fresh);assert.equal(fresh.chat.length,1);f.dispose();
});

test('passive source appearance uses lean accepted descriptors without publishing offered vocabulary',async()=>{
    const prefs=policy({toolCalling:false}),f=fixture(false,false,prefs);for(const controller of f.controllers)controller.dispose();
    const source={...f.records[0].definition,schemaVersion:2},record={definition:source,presentation:source.startingPresentation};
    const identity={bodyType:'male',selections:{body:{itemId:'body',name:'Body'}}},parts={clothes:{itemId:'top',name:'Red shirt',colors:{cloth:'cloth.ulpc.red'}}};
    f.hub.update('source-passive',{record:()=>record,describeAvailable:()=>true,available:()=>false,contextDataFor:()=>({format:'lpc-source-v1',identity,currentParts:parts})});
    const prompt={chat:[]};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    const data=JSON.parse(prompt.chat[0].content.split('\n')[1]);assert.equal(data.readOnly,true);assert.deepEqual(data.companions[0].identity,identity);assert.deepEqual(data.companions[0].currentParts,parts);
    assert.equal(Object.hasOwn(data.companions[0],'controls'),false);assert.equal(Object.hasOwn(data.companions[0],'outfits'),false);f.dispose();
});

test('passive/controller coalescing does not require an explicit target for one enabled companion',async()=>{
    const prefs=policy(),f=fixture(false,false,prefs);f.controllers[1].dispose();const record=f.records[0];
    f.hub.update('passive',{label:'Passive duplicate',record:()=>record,describeAvailable:()=>true,available:()=>false});await f.begin(0);
    assert.equal(f.tools.get('lpc_present').parameters.required.includes('companionId'),false);
    assert.equal((await f.call({requestId:'single',established:true,outfitId:'summer'})).status,'prepared');
    const prompt={chat:[]};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    const data=JSON.parse(prompt.chat[0].content.split('\n')[1]);assert.equal(data.companions.length,1);assert.equal(data.companions[0].label,'Identical label');f.dispose();
});

test('outgoing live-state system prompt is inserted before trailing assistant tool_calls and tool results on continuation turns',async()=>{
    const prefs=policy({toolScope:'character'}),f=fixture(false,false,prefs);f.controllers[1].dispose();await f.begin(0);
    const initial={chat:[{role:'user',content:'Hello.'}],dryRun:false};
    await f.emit('CHAT_COMPLETION_PROMPT_READY',initial);
    assert.equal(initial.chat.length,2);
    assert.equal(initial.chat[1].role,'system');
    const initialData=JSON.parse(initial.chat[1].content.split('\n')[1]);
    assert.equal(Object.hasOwn(initialData.companions[0],'prepared'),false);
    assert.match(initialData.rules,/call the needed tool\(s\) first/i);

    const res=JSON.parse(await f.tools.get('lpc_emote').action({mood:'concerned'}));
    assert.equal(res.status,'prepared');
    const continuation={
        chat:[
            {role:'user',content:'Hello.'},
            {role:'assistant',content:'',tool_calls:[{id:'call_1',type:'function',function:{name:'lpc_emote',arguments:'{"mood":"concerned"}'}}]},
            {role:'tool',tool_call_id:'call_1',content:JSON.stringify(res)},
        ],
        dryRun:false,
    };
    await f.emit('CHAT_COMPLETION_PROMPT_READY',continuation);
    assert.equal(continuation.chat.length,4);
    assert.equal(continuation.chat[0].role,'user');
    assert.equal(continuation.chat[1].role,'system');
    assert.equal(continuation.chat[2].role,'assistant');
    assert.equal(continuation.chat[3].role,'tool');
    const contData=JSON.parse(continuation.chat[1].content.split('\n')[1]);
    assert.equal(contData.companions[0].prepared.mood,'concerned');
    assert.match(contData.rules,/already prepared/i);
    f.dispose();
});
