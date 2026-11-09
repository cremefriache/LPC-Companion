import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createModelControl } from '../src/adapter/model-control.mjs';
import { modelContract, TOOL_NAME } from '../src/state/model-contract.mjs';
import { createDefinition } from '../src/state/defaults.mjs';

function policy(initial={}) {
    let value={enabled:true,toolCalling:true,shareContext:true,...initial};const listeners=new Set();
    return {get:()=>value,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},set(patch){value={...value,...patch};for(const fn of listeners)fn();},size:()=>listeners.size};
}
function fixture(toolPolicy) {
    const definition = createDefinition('11111111-1111-4111-8111-111111111111');
    const record = { definition, presentation: definition.startingPresentation, binding: {} };
    const listeners = new Map(), tools = new Map(), applied = [], reports = [];
    let generating = true, support = true, prepare = async () => {}, applyHook=async()=>{};
    const active = { characterIndex: 0, characterAvatar: 'Fixture.png', chatLocator: 'Fixture', integrity: definition.characterId };
    const context = { characterId: 0, characters: [{ avatar: 'Fixture.png', data: {} }], groupId: null, chatId: 'Fixture', chatMetadata: { integrity: active.integrity }, getCurrentChatId: () => context.chatId, chat: [],
        isToolCallingSupported: () => support, canPerformToolCalls: type => ['normal', 'swipe', 'regenerate'].includes(type),
        registerFunctionTool: tool => tools.set(tool.name, tool), unregisterFunctionTool: name => tools.delete(name),
        eventTypes: Object.fromEntries(['GENERATION_STARTED','CHAT_COMPLETION_PROMPT_READY','TOOL_CALLS_PERFORMED','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED','MESSAGE_SWIPED','MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','MESSAGE_EDITED'].map(name => [name, name])),
        eventSource: { on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeListener(name, fn) { listeners.get(name).delete(fn); } },
    };
    const emit = async (name, ...args) => { for (const fn of listeners.get(name) ?? []) await fn(...args); };
    const controller = createModelControl({ active, getContext: () => context, getRecord: () => record, crypto: webcrypto,toolPolicy,
        isGenerating: () => generating, prepare: (...args) => prepare(...args), apply: async (pending, current) => { await applyHook(pending,current);if (current()) applied.push(pending); }, report: text => reports.push(text) });
    const call = async args => JSON.parse(await tools.get(TOOL_NAME).action(args));
    const args = { requestId: 'one', established: true, outfitId: 'summer', actionId: 'jump', moodId: 'cheerful', speech: 'Hello.', scene:{backgroundId:'woodland',x:0.5,y:1,scale:1,lightId:'day'} };
    async function receipt(result) {
        const invocation = { name: TOOL_NAME, parameters: JSON.stringify(args), result: JSON.stringify(result) };
        context.chat.push({ is_system: true, extra: { tool_invocations: [invocation] } });
        await emit('TOOL_CALLS_PERFORMED', [invocation]);
    }
    async function finish() { context.chat.push({ mes: 'I change into summer clothes and jump.', is_user: false, is_system: false }); await emit('MESSAGE_RECEIVED', context.chat.length - 1); context.chat.at(-1).swipe_id = 0; generating = false; await emit('GENERATION_ENDED'); }
    return { controller, context, record, tools, listeners, applied, reports, emit, call, args, receipt, finish,
        support: value => { support = value; }, setGenerating: value => { generating = value; }, prepare: fn => { prepare = fn; },applyHook:fn=>{applyHook=fn;} };
}

test('one contract rejects unknown/hypothetical/injected choices and empty operations', () => {
    const f = fixture(), contract = modelContract(f.record.definition, f.record.presentation);
    contract.validate(f.args);
    for (const patch of [{ outfitId: '../shirt' }, { established: false }, { actionId: 'attack' }, { posture: 'sit' }, { url: 'https://example.com' }]) assert.throws(() => contract.validate({ ...f.args, ...patch }));
    assert.throws(() => contract.validate({ requestId: 'one', established: true }));
    f.controller.dispose();
});

test('a removed outfit can be corrected in the same generation without bypassing receipt/final-response gates', async () => {
    for (const verified of [false, true]) {
        const f=fixture(),before=structuredClone(f.record);let prepared=0;
        f.record.definition.outfits=f.record.definition.outfits.filter(outfit=>outfit.id!=='summer');
        const acceptedBefore=structuredClone(f.record);
        f.prepare(async()=>{prepared++;});f.controller.enable(true);await f.emit('GENERATION_STARTED','normal',{},false);
        const rejected=await f.call({requestId:'removed_outfit',established:true,outfitId:'summer'});
        assert.equal(rejected.status,'error');assert.equal(rejected.applied,false);assert.match(rejected.error,/outfitId/);
        assert.match(rejected.error,/retry|call lpc_present again/i);assert.match(rejected.error,/new\s+requestId/i);
        assert.equal(prepared,0);assert.equal(f.applied.length,0);assert.deepEqual(f.record,acceptedBefore);
        const corrected=await f.call({requestId:'corrected_outfit',established:true,outfitId:'evening'});
        assert.equal(corrected.status,'prepared');assert.equal(corrected.applied,false);assert.equal(prepared,1);assert.equal(f.applied.length,0);
        assert.deepEqual(f.record,acceptedBefore);if(verified)await f.receipt(corrected);
        assert.equal(f.applied.length,0,'Verified tools still wait for the accepted final response');await f.finish();
        assert.equal(f.applied.length,verified?1:0);if(verified)assert.equal(f.applied[0].presentation.outfitId,'evening');
        assert.equal(f.record.presentation.outfitId,before.presentation.outfitId);f.controller.dispose();
    }
});

test('prepared is truthful, identical retries coalesce, recursion preserves pending updates and acceptance is once', async () => {
    const f = fixture(); f.controller.enable(true); await f.emit('GENERATION_STARTED', 'normal', {}, false);
    const result = await f.call(f.args); assert.equal(result.status, 'prepared'); assert.equal(result.applied, false); assert.equal(f.applied.length, 0);
    assert.deepEqual(await f.call(f.args), result);
    assert.equal((await f.call({ ...f.args, outfitId: 'evening' })).status, 'error');
    await f.receipt(result); await f.emit('GENERATION_STARTED', 'normal', {}, false);
    const prompt = { chat: [], dryRun: false }; await f.emit('CHAT_COMPLETION_PROMPT_READY', prompt); assert.equal(prompt.chat.length, 1); assert.match(prompt.chat[0].content, /summer/);
    await f.finish(); assert.equal(f.applied.length, 1); assert.equal(f.applied[0].presentation.outfitId, 'summer');
    assert.equal(f.applied[0].presentation.moodId,'cheerful'); assert.equal(f.applied[0].speech,'Hello.');
    assert.equal(f.applied[0].presentation.scene.backgroundId,'woodland');
    await f.emit('GENERATION_ENDED'); assert.equal(f.applied.length, 1);
    f.controller.dispose(); assert.equal(f.tools.size, 0); assert.ok([...f.listeners.values()].every(set => set.size === 0));
});

test('coalesced mood/speech require invocation proof for every prepared request', async () => {
    for (const verified of [false,true]) {
        const f = fixture(); f.controller.enable(true); await f.emit('GENERATION_STARTED','normal',{},false);
        await f.receipt(await f.call(f.args));
        const second = await f.call({requestId:'two',established:true,moodId:'thoughtful',speech:'Second cue.'});
        if (verified) await f.receipt(second);
        await f.finish(); assert.equal(f.applied.length,verified ? 1 : 0);
        if (verified) { assert.equal(f.applied[0].speech,'Second cue.'); assert.equal(f.applied[0].presentation.moodId,'thoughtful'); }
        f.controller.dispose();
    }
});

for (const event of ['GENERATION_STOPPED', 'CHAT_CHANGED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED']) test(`${event} discards staged changes`, async () => {
    const f = fixture(); f.controller.enable(true); await f.emit('GENERATION_STARTED', 'normal', {}, false);
    await f.receipt(await f.call(f.args)); if (event === 'MESSAGE_DELETED') { f.context.chat.push({ mes: 'Accepted candidate', is_system: false, is_user: false }); await f.emit('MESSAGE_RECEIVED', f.context.chat.length - 1); } await f.emit(event); await f.finish(); assert.equal(f.applied.length, 0); f.controller.dispose();
});

test('failed loads, missing invocation proof, disabled providers and manual overrides cannot commit', async () => {
    for (const mode of ['load', 'receipt', 'provider', 'manual']) {
        const f = fixture(); f.controller.enable(true); await f.emit('GENERATION_STARTED', 'normal', {}, false);
        if (mode === 'load') f.prepare(async () => { throw Error('Missing sheet'); });
        const result = await f.call(f.args);
        if (mode === 'load') assert.equal(result.status, 'error');
        else if (mode !== 'receipt') await f.receipt(result);
        if (mode === 'provider') f.support(false);
        if (mode === 'manual') f.controller.cancel();
        await f.finish(); assert.equal(f.applied.length, 0); f.controller.dispose();
    }
});

test('late preparation cannot survive stop or a same-character chat switch', async () => {
    for (const mode of ['stop', 'switch']) {
        const f = fixture(); let resume;
        const gate = new Promise(resolve => { resume = resolve; }); f.prepare(() => gate);
        f.controller.enable(true); await f.emit('GENERATION_STARTED', 'normal', {}, false);
        const pending = f.call(f.args); await new Promise(resolve => setImmediate(resolve));
        if (mode === 'stop') await f.emit('GENERATION_STOPPED'); else f.context.chatId = 'Different';
        resume(); assert.equal((await pending).status, 'error'); assert.equal(f.applied.length, 0); f.controller.dispose();
    }
});

test('dry runs and unsupported generation types expose no mutation; bindings affect only outgoing copies', async () => {
    const f = fixture(); f.controller.enable(true);
    await f.emit('GENERATION_STARTED', 'normal', {}, true); assert.equal((await f.call(f.args)).status, 'error');
    await f.emit('GENERATION_STARTED', 'quiet', {}, false); assert.equal((await f.call(f.args)).status, 'error');
    await f.emit('GENERATION_STARTED', 'normal', {}, false);
    const original = { role: 'system', content: 'Wearing [[LPC_OUTFIT]], [[LPC_POSTURE]], [[LPC_FACING]].' };
    const prompt = { chat: [structuredClone(original)], dryRun: false };
    await f.emit('CHAT_COMPLETION_PROMPT_READY', prompt); await f.emit('CHAT_COMPLETION_PROMPT_READY', prompt);
    assert.equal(prompt.chat.length, 2); assert.match(prompt.chat[0].content, /Everyday/); assert.match(original.content, /\[\[LPC_OUTFIT\]\]/);
    f.controller.dispose();
});

test('direct model-control outfit bindings insert dollar replacement patterns literally', async () => {
    const f=fixture(),name='Costume $$ $& $` $\'';
    f.record.definition.outfits[0].name=name;
    f.controller.enable(true);await f.emit('GENERATION_STARTED','normal',{},false);
    const original={role:'system',content:'Before [[LPC_OUTFIT]] after.'},prompt={chat:[structuredClone(original)],dryRun:false};
    await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    assert.equal(prompt.chat[0].content,`Before ${name} after.`);assert.equal(original.content,'Before [[LPC_OUTFIT]] after.');
    f.controller.dispose();
});

test('activity plus sequence require accepted proof, prepare every inherited step and discard on abort',async()=>{
    for(const abort of [false,true]){
        const f=fixture(),prepared=[];f.prepare(async(...args)=>prepared.push(args));f.controller.enable(true);await f.emit('GENERATION_STARTED','normal',{},false);
        const args={requestId:'sequence',established:true,activityId:'walk',sequence:[{actionId:'jump'},{actionId:'spellcast'}]};
        const first=await f.call(args);assert.equal(first.status,'prepared');await f.receipt(first);assert.equal(f.applied.length,0);
        const second=await f.call({requestId:'facing',established:true,facing:'east'});await f.receipt(second);assert.equal(prepared.at(-1)[3].length,2);
        if(abort)await f.emit('GENERATION_STOPPED');await f.finish();assert.equal(f.applied.length,abort?0:1);
        if(!abort){assert.equal(f.applied[0].presentation.activityId,'walk');assert.deepEqual(f.applied[0].sequence.map(step=>step.actionId),['jump','spellcast']);}
        f.controller.dispose();
    }
});

test('failure preparing a later sequence leaves previously prepared requests unchanged',async()=>{
    const f=fixture();f.controller.enable(true);await f.emit('GENERATION_STARTED','normal',{},false);
    const first=await f.call({requestId:'activity',established:true,activityId:'walk'});await f.receipt(first);
    f.prepare(async()=>{throw Error('Later sheet unavailable');});const rejected=await f.call({requestId:'sequence',established:true,activityId:'run',sequence:[{actionId:'jump'},{actionId:'spellcast'}]});assert.equal(rejected.status,'error');
    await f.finish();assert.equal(f.applied.length,1);assert.equal(f.applied[0].presentation.activityId,'walk');assert.equal(f.applied[0].sequence,null);f.controller.dispose();
});

test('direct policy allows accepted context without provider/run and removes it plus bindings when sharing is disabled',async()=>{
    const prefs=policy({toolCalling:false}),f=fixture(prefs);f.support(false);
    const prompt={chat:[{role:'system',content:'Wearing [[LPC_OUTFIT]].'}]};await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);
    assert.equal(f.tools.size,0);assert.equal(prompt.chat[0].content,'Wearing Everyday.');
    const data=JSON.parse(prompt.chat[1].content.split('\n')[1]);assert.equal(data.readOnly,true);assert.equal(data.companions[0].current.outfitId,'everyday');assert.equal(Object.hasOwn(data,'allowedTargetIds'),false);
    prefs.set({shareContext:false});await f.emit('CHAT_COMPLETION_PROMPT_READY',prompt);assert.equal(prompt.chat.length,1);assert.equal(prompt.chat[0].content,'Wearing [[LPC_OUTFIT]].');
    f.controller.dispose();assert.equal(prefs.size(),0);
});

test('direct master disable revokes prepared receipts, queued preparation and late application predicates',async()=>{
    const prefs=policy(),f=fixture(prefs);f.controller.enable(true);await f.emit('GENERATION_STARTED','normal',{},false);
    let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    let preparations=0;f.prepare(async()=>{preparations++;entered();await gate;});
    const action=f.tools.get(TOOL_NAME).action,first=action(f.args);await started;const queued=action({...f.args,requestId:'queued'});
    prefs.set({toolCalling:false});assert.equal(f.tools.size,0);prefs.set({toolCalling:true});await f.emit('GENERATION_STARTED','normal',{},false);release();
    assert.equal(JSON.parse(await first).status,'error');assert.equal(JSON.parse(await queued).status,'error');assert.equal(preparations,1);
    f.prepare(async()=>{});await f.receipt(await f.call(f.args));prefs.set({enabled:false});prefs.set({enabled:true});await f.finish();assert.equal(f.applied.length,0);f.controller.dispose();

    const late=fixture(prefs);late.controller.enable(true);await late.emit('GENERATION_STARTED','normal',{},false);await late.receipt(await late.call(late.args));
    let applyEntered,applyRelease;const applying=new Promise(resolve=>{applyEntered=resolve;}),applyGate=new Promise(resolve=>{applyRelease=resolve;});late.applyHook(async()=>{applyEntered();await applyGate;});
    const finishing=late.finish();await applying;prefs.set({toolCalling:false});prefs.set({toolCalling:true});applyRelease();await finishing;assert.equal(late.applied.length,0);late.controller.dispose();
});

test('four focused tools (lpc_outfit, lpc_pose, lpc_emote, lpc_scene), two-digit outfit IDs (01-99) and toolScope work cleanly', async () => {
    const prefs = policy({ toolScope: 'character' }), f = fixture(prefs);
    f.record.definition.outfits[0].name = 'Nurse';
    f.controller.enable(true); await f.emit('GENERATION_STARTED', 'normal', {}, false);
    const prompt = { chat: [], dryRun: false };
    await f.emit('CHAT_COMPLETION_PROMPT_READY', prompt);
    const data = JSON.parse(prompt.chat[0].content.split('\n')[1]);
    assert.equal(data.outfits[0].id, '01');
    assert.equal(data.outfits[0].name, 'Nurse');
    assert.equal(data.current.pose, 'idle');
    assert.equal(Object.hasOwn(data, 'stage'), false);
    assert.equal(Object.hasOwn(data.current, 'scene'), false);

    // In character scope: lpc_outfit, lpc_pose, lpc_emote are registered; lpc_scene is omitted
    assert.deepEqual([...f.tools.keys()], ['lpc_outfit', 'lpc_pose', 'lpc_emote']);
    assert.deepEqual(f.tools.get('lpc_outfit').parameters.properties.outfitId.enum, ['01', '02', '03']);

    // Chain lpc_outfit + lpc_pose + lpc_emote in the same turn without requestId or established boilerplate
    const callTool = async (name, args) => {
        const res = JSON.parse(await f.tools.get(name).action(args));
        const inv = { name, parameters: JSON.stringify(args), result: JSON.stringify(res) };
        f.context.chat.push({ is_system: true, extra: { tool_invocations: [inv] } });
        await f.emit('TOOL_CALLS_PERFORMED', [inv]);
        return res;
    };
    const r1 = await callTool('lpc_outfit', { outfitId: '02' });
    const r2 = await callTool('lpc_pose', { pose: 'sit_low', facing: 'east' });
    const r3 = await callTool('lpc_emote', { mood: 'blush', action: 'arms_raise' });
    assert.equal(r1.status, 'prepared');
    assert.equal(r2.status, 'prepared');
    assert.equal(r3.status, 'prepared');
    await f.finish();
    assert.equal(f.applied.length, 1);
    assert.equal(f.applied[0].presentation.outfitId, 'evening');
    assert.equal(f.applied[0].presentation.activityId, 'sit_low');
    assert.equal(f.applied[0].presentation.facing, 'east');
    assert.equal(f.applied[0].presentation.moodId, 'blush');
    assert.equal(f.applied[0].actionId, 'arms_raise');

    // Switching to scene scope adds the 4th tool: lpc_scene
    prefs.set({ toolScope: 'scene' });
    assert.deepEqual([...f.tools.keys()], ['lpc_outfit', 'lpc_pose', 'lpc_emote', 'lpc_scene']);
    const contract = modelContract(f.record.definition, f.record.presentation, { includeScene: true });
    const validated = contract.validate({ requestId: 'scene_call', established: true, outfitId: 'Nurse', scene: { backgroundId: 'hearth', lightId: 'night' } });
    assert.equal(validated.presentation.outfitId, 'everyday');
    assert.equal(validated.presentation.scene.backgroundId, 'hearth');
    assert.equal(validated.presentation.scene.lightId, 'night');
    assert.equal(validated.presentation.scene.x, f.record.presentation.scene.x);
    assert.equal(validated.presentation.scene.y, f.record.presentation.scene.y);
    assert.equal(validated.presentation.scene.scale, f.record.presentation.scene.scale);
    f.controller.dispose();
});

test('streaming event order (GENERATION_ENDED before MESSAGE_RECEIVED) and trailing GENERATION_ENDED during async apply preserve the accepted update', async () => {
    const prefs = policy({ toolScope: 'character' }), f = fixture(prefs);
    let releaseApply;
    const applyGate = new Promise(resolve => { releaseApply = resolve; });
    f.applyHook(() => applyGate);
    f.controller.enable(true);
    await f.emit('GENERATION_STARTED', 'normal', {}, false);
    const res = JSON.parse(await f.tools.get('lpc_emote').action({ mood: 'concerned' }));
    const inv = { name: 'lpc_emote', parameters: JSON.stringify({ mood: 'concerned' }), result: JSON.stringify(res) };
    f.context.chat.push({ is_system: true, extra: { tool_invocations: [inv] } });
    await f.emit('TOOL_CALLS_PERFORMED', [inv]);

    // Recursive streaming turn ends: SillyTavern's finalizeIntermediaryMessage calls markUIGenStopped() (GENERATION_ENDED) before MESSAGE_RECEIVED
    await f.emit('GENERATION_STARTED', 'normal', {}, false);
    f.context.chat.push({ mes: '*Looks concerned.*', is_user: false, is_system: false, swipe_id: 0 });
    f.setGenerating(false);
    await f.emit('GENERATION_ENDED');
    const receiving = f.emit('MESSAGE_RECEIVED', f.context.chat.length - 1);
    // A trailing GENERATION_ENDED while apply() is awaiting reconciliation must not cancel the in-flight apply()
    await f.emit('GENERATION_ENDED');
    releaseApply();
    await receiving;
    assert.equal(f.applied.length, 1);
    assert.equal(f.applied[0].presentation.moodId, 'concerned');
    f.controller.dispose();
});
