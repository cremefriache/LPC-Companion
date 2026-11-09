import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLifecycle } from '../src/adapter/lifecycle.mjs';

test('activate/enable, chat transitions, disable/delete and pagehide clean up completely', () => {
    const eventSource = new EventEmitter();
    let context = {
        groupId: null, characterId: '0', characters: [{ avatar: 'Fixture.png' }],
        chatId: 'Fixture', getCurrentChatId: () => 'Fixture',
        chatMetadata: { integrity: '11111111-1111-4111-8111-111111111111' },
        eventSource, eventTypes: { APP_READY: 'ready', CHAT_CHANGED: 'chat' },
    };
    const window = new EventTarget();
    let mounted = 0;
    const lifecycle = createLifecycle({
        getContext: () => context, window,
        createView: () => { mounted++; return { remove: () => { mounted--; } }; },
    });
    for (let i = 0; i < 10; i++) {
        lifecycle.start(); lifecycle.start();
        assert.equal(mounted, 1);
        assert.equal(eventSource.listenerCount('chat'), 1);
        const character = context;
        context = { ...context, groupId: 'group' };
        eventSource.emit('chat');
        assert.equal(mounted, 0);
        context = character;
        eventSource.emit('chat');
        assert.equal(mounted, 1);
        if (i % 2) lifecycle.stop();
        else window.dispatchEvent(new Event('pagehide'));
        lifecycle.stop();
        assert.equal(mounted, 0);
        assert.equal(eventSource.listenerCount('chat'), 0);
        assert.equal(eventSource.listenerCount('ready'), 0);
        eventSource.emit('chat');
        assert.equal(mounted, 0);
    }
});

test('missing APIs and unavailable host transitions do not mount or write', () => {
    let context = {};
    let unavailable = true;
    const lifecycle = createLifecycle({
        getContext: () => { if (unavailable) throw Error('Host is transitioning'); return context; },
        window: new EventTarget(),
        createView: () => assert.fail('Unsupported context mounted'),
    });
    lifecycle.start();
    unavailable = false;
    lifecycle.start();
    const source = new EventEmitter();
    context = { eventSource: source, eventTypes: { APP_READY: 'ready', CHAT_CHANGED: 'chat' } };
    lifecycle.start();
    context = null;
    source.emit('chat');
    lifecycle.stop();
    assert.equal(source.listenerCount('chat'), 0);
});

test('no-chat settings remain mounted until a verified chat replaces them and dispose with the lifecycle', () => {
    const eventSource = new EventEmitter();
    const empty = { eventSource, eventTypes: { APP_READY: 'ready', CHAT_CHANGED: 'chat' } };
    const character = {
        ...empty, groupId: null, characterId: 0, characters: [{ avatar: 'Fixture.png' }],
        chatId: 'Fixture', getCurrentChatId: () => 'Fixture',
        chatMetadata: { integrity: '11111111-1111-4111-8111-111111111111' },
    };
    let context = empty, unavailable = false, activeViews = 0, inactiveViews = 0, inactiveCreated = 0;
    const window = new EventTarget();
    const lifecycle = createLifecycle({
        getContext: () => { if (unavailable) throw Error('Host transition'); return context; }, window,
        createView: () => { activeViews++; return { remove: () => { activeViews--; } }; },
        createInactiveView: () => { inactiveCreated++; inactiveViews++; return { remove: () => { inactiveViews--; } }; },
    });
    for (let i = 0; i < 10; i++) {
        context = empty;
        lifecycle.start(); lifecycle.start();
        const created = inactiveCreated;
        eventSource.emit('ready'); eventSource.emit('chat');
        assert.equal(inactiveCreated, created, 'Repeated no-chat events retain one settings view');
        assert.equal(inactiveViews, 1); assert.equal(activeViews, 0);
        context = character; eventSource.emit('chat');
        assert.equal(inactiveViews, 0); assert.equal(activeViews, 1);
        unavailable = true; eventSource.emit('chat'); unavailable = false;
        assert.equal(inactiveViews, 1); assert.equal(activeViews, 0);
        context = empty; eventSource.emit('chat');
        assert.equal(inactiveViews, 1);
        if (i % 2) lifecycle.stop();
        else window.dispatchEvent(new Event('pagehide'));
        assert.equal(activeViews, 0); assert.equal(inactiveViews, 0);
        assert.equal(eventSource.listenerCount('ready'), 0); assert.equal(eventSource.listenerCount('chat'), 0);
        eventSource.emit('chat'); assert.equal(inactiveViews, 0);
    }
});

test('host prompt/token-count dry runs do not cancel playback or begin continuity generation tracking',async()=>{
    const eventSource=new EventEmitter(),begun=[];let cancelled=0;
    const context={characterId:0,characters:[{avatar:'Fixture.png'}],groupId:null,chatId:'Fixture',getCurrentChatId:()=> 'Fixture',chatMetadata:{integrity:'11111111-1111-4111-8111-111111111111'},eventSource,eventTypes:{APP_READY:'ready',CHAT_CHANGED:'chat',GENERATION_STARTED:'start'}};
    const lifecycle=createLifecycle({getContext:()=>context,window:new EventTarget(),continuity:{whenIdle:async()=>{},beginGeneration:type=>begun.push(type)},createView:()=>({cancelActions:()=>cancelled++,remove(){}})});lifecycle.start();
    eventSource.emit('start','normal',{},true);await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,0);assert.deepEqual(begun,[]);
    eventSource.emit('start','normal',{},false);await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,1);assert.deepEqual(begun,['normal']);lifecycle.stop();assert.equal(eventSource.listenerCount('start'),0);
});

test('queued generation work cannot resume after disable, inactive context, or a chat switch', async () => {
    for (const mode of ['disabled', 'inactive', 'switch', 'reenabled', 'reactivated', 'switch-back']) {
        const eventSource = new EventEmitter();
        let allowed = true, released, begun = 0;
        const context = { groupId:null, characterId:0, characters:[{avatar:'Fixture.png'}], chatId:'A', getCurrentChatId:()=>context.chatId, chatMetadata:{integrity:'11111111-1111-4111-8111-111111111111'}, eventSource, eventTypes:{APP_READY:'ready',CHAT_CHANGED:'chat',GENERATION_STARTED:'start'} };
        const lifecycle=createLifecycle({getContext:()=>context,window:new EventTarget(),readContext:()=>allowed?{id:context.chatId}:null,contextKey:active=>active.id,createView:()=>({remove(){}}),continuity:{whenIdle:()=>new Promise(resolve=>{released=resolve;}),beginGeneration:()=>begun++}});
        lifecycle.start();eventSource.emit('start','swipe',{},false);
        assert.equal(typeof released,'function');
        if(mode==='disabled'||mode==='reenabled'){lifecycle.stop();if(mode==='reenabled')lifecycle.start();}
        else if(mode==='inactive'||mode==='reactivated'){allowed=false;lifecycle.refresh();if(mode==='reactivated'){allowed=true;lifecycle.refresh();}}
        else{context.chatId='B';eventSource.emit('chat');if(mode==='switch-back'){context.chatId='A';eventSource.emit('chat');}}
        released();await new Promise(resolve=>setImmediate(resolve));
        assert.equal(begun,0,mode);lifecycle.stop();
    }
});


test('a sent user reply dismisses speech without refreshing state and unsubscribes on stop', () => {
    const eventSource=new EventEmitter();let cleared=0;
    const context={eventSource,eventTypes:{APP_READY:'ready',CHAT_CHANGED:'chat',MESSAGE_SENT:'sent'}};
    const lifecycle=createLifecycle({getContext:()=>context,readContext:()=>({id:'A'}),contextKey:value=>value.id,window:new EventTarget(),createView:()=>({clearSpeech:()=>cleared++,refresh:()=>assert.fail('Speech dismissal must not read or save state'),remove(){}})});
    lifecycle.start();eventSource.emit('sent',3);assert.equal(cleared,1);
    lifecycle.stop();assert.equal(eventSource.listenerCount('sent'),0);eventSource.emit('sent',4);assert.equal(cleared,1);
});

test('mid-generation MESSAGE_DELETED (tool draft cleanup) does not refresh or lock view until generation ends', async () => {
    const eventSource = new EventEmitter();
    let generating = true, refreshed = 0;
    const context = {
        groupId: null, characterId: 0, characters: [{ avatar: 'Fixture.png' }],
        chatId: 'Fixture', getCurrentChatId: () => 'Fixture',
        chatMetadata: { integrity: '11111111-1111-4111-8111-111111111111' },
        eventSource, eventTypes: { APP_READY: 'ready', CHAT_CHANGED: 'chat', MESSAGE_DELETED: 'deleted', GENERATION_ENDED: 'ended' },
    };
    const lifecycle = createLifecycle({
        getContext: () => context, window: new EventTarget(),
        isGenerating: () => generating,
        continuity: { whenIdle: async () => {}, beginGeneration() {}, noteRename() {} },
        createView: () => ({ cancelActions() {}, refresh: async () => { refreshed++; }, remove() {} }),
    });
    lifecycle.start();
    eventSource.emit('deleted');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(refreshed, 0, 'MESSAGE_DELETED during generation must not refresh');
    generating = false;
    eventSource.emit('deleted');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(refreshed, 1, 'MESSAGE_DELETED when idle refreshes normally');
    lifecycle.stop();
});
