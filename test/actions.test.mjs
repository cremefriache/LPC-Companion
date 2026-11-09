import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, CUE_REPEAT_MS } from '../src/presentation/player.mjs';
import { validateActionCue } from '../src/state/actions.mjs';
import { createDefinition } from '../src/state/defaults.mjs';

function fixture() {
    const callbacks = new Map(), listeners = new Map(), frames = [];
    let next = 0, intersection;
    const motion = { matches: false, addEventListener: (id, fn) => listeners.set('motion', fn), removeEventListener: () => listeners.delete('motion') };
    const document = { hidden: false, addEventListener: (id, fn) => listeners.set(id, fn), removeEventListener: id => listeners.delete(id) };
    const canvas = { ownerDocument: document, width: 32, height: 48, dataset: {}, getContext: () => ({ clearRect() {}, drawImage: (...args) => frames.push(args) }) };
    const window = { matchMedia: () => motion, requestAnimationFrame: fn => { callbacks.set(++next, fn); return next; }, cancelAnimationFrame: id => callbacks.delete(id),
        IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} disconnect() { intersection = null; } } };
    const sheet = { canvas: {}, layout: { directions: ['south'], frameWidth: 32, frameHeight: 48, cycle: [0, 2, 1], frameMs: 100 } };
    const player = createPlayer(canvas, {}, window);
    return { player, sheet, frames, callbacks, listeners, motion, document, visible: value => intersection([{ isIntersecting: value }]), tick(time) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(time)); } };
}

test('one-row variable-size cue visits its full cycle then returns to rest without repeating', () => {
    const f = fixture(), rest = { ...f.sheet, canvas: { rest: true } }; let reason;
    f.player.publish(rest, 'south'); f.player.playOnce(f.sheet, 'south', 300, value => { reason = value; });
    for (const time of [0, 100, 200, 300]) f.tick(time);
    assert.deepEqual(f.frames.slice(1, 4).map(args => args[1]), [0, 64, 32]);
    assert.equal(f.frames.at(-1)[0], rest.canvas); assert.equal(reason, 'completed');
    f.tick(400); assert.equal(f.frames.at(-1)[0], rest.canvas);
    assert.throws(() => f.player.playOnce(f.sheet, 'north', 300));
    assert.throws(() => f.player.playOnce(f.sheet, 'south', 299));
    f.player.dispose(); assert.equal(f.callbacks.size, 0); assert.equal(f.listeners.size, 0);
});

test('hidden and paused cues freeze; replacement, new rest, reduced motion and disposal release cues', () => {
    const f = fixture(); const reasons = [];
    f.player.publish(f.sheet, 'south');
    f.player.playOnce(f.sheet, 'south', 300, reason => reasons.push(reason));
    f.tick(0); f.tick(100); f.visible(false); assert.equal(f.callbacks.size, 0); f.visible(true); f.tick(9000);
    assert.equal(reasons.length, 0); f.player.pause(true); assert.equal(f.callbacks.size, 0); f.player.pause(false); f.tick(18000); f.tick(18100); assert.equal(reasons.length, 0); f.tick(18200); assert.deepEqual(reasons, ['completed']);
    f.player.playOnce(f.sheet, 'south', 300, () => assert.fail('Replaced cue callback ran'));
    f.player.playOnce(f.sheet, 'south', 300, reason => reasons.push(reason));
    f.motion.matches = true; f.listeners.get('motion')(); assert.equal(reasons.at(-1), 'reduced-motion'); assert.equal(f.callbacks.size, 0);
    f.motion.matches = false; f.player.playOnce(f.sheet, 'south', 300, () => assert.fail('Interrupted cue callback ran'));
    f.player.publish(f.sheet, 'south'); f.tick(20000); f.tick(20500);
    f.player.playOnce(f.sheet, 'south', 300, () => assert.fail('Disposed cue callback ran')); f.player.dispose(); assert.equal(f.callbacks.size, 0);
});

test('action contract is separate from rest and rejects arbitrary, incomplete or unavailable cues', () => {
    const definition = createDefinition('11111111-1111-4111-8111-111111111111');
    const cue = { schemaVersion: 1, kind: 'action-cue', cueId: definition.characterId, actionId: 'jump', durationMs: 720, response: null };
    validateActionCue(cue, definition, definition.startingPresentation);
    for (const patch of [{ actionId: 'sit' }, { actionId: '../jump' }, { durationMs: 10 }, { durationMs: 10001 }, { extra: true }]) assert.throws(() => validateActionCue({ ...cue, ...patch }, definition, definition.startingPresentation));
});

test('prepared sequence preserves order and full cycles, survives hidden time, then resumes its ongoing loop',()=>{
    const f=fixture(),walking={...f.sheet,canvas:{walking:true}},jump={...f.sheet,canvas:{jump:true}},cast={...f.sheet,canvas:{cast:true}};const progress=[],done=[];
    f.player.publish(walking,'south');f.player.playSequence([{sheet:jump,durationMs:300},{sheet:cast,durationMs:300}],'south',value=>done.push(value),(index,total)=>progress.push([index,total]));
    f.tick(0);f.tick(100);f.document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.callbacks.size,0);
    f.document.hidden=false;f.listeners.get('visibilitychange')();f.tick(99999);assert.equal(f.frames.at(-1)[0],jump.canvas);
    f.tick(100099);f.tick(100199);assert.equal(f.frames.at(-1)[0],cast.canvas);assert.deepEqual(progress,[[0,2],[1,2]]);
    f.tick(100299);f.tick(100399);f.tick(100499);assert.deepEqual(done,['completed']);assert.equal(f.frames.at(-1)[0],walking.canvas);
    f.tick(100599);assert.equal(f.frames.at(-1)[0],walking.canvas);assert.equal(f.frames.at(-1)[1],64);f.player.dispose();
});

test('invalid later step cannot interrupt the accepted sequence; slow frames cannot skip later steps',()=>{
    const f=fixture(),next={...f.sheet,canvas:{next:true}};let done=false;
    f.player.publish(f.sheet,'south');f.player.playSequence([{sheet:f.sheet,durationMs:300},{sheet:next,durationMs:300}],'south',()=>done=true);
    assert.throws(()=>f.player.playSequence([{sheet:next,durationMs:300},{sheet:next,durationMs:299}],'south'));
    f.tick(0);f.tick(60000);assert.equal(done,false);assert.equal(f.frames.at(-1)[0],next.canvas);assert.equal(f.frames.at(-1)[1],0);
    f.tick(60100);f.player.cancel();assert.equal(done,true);assert.equal(f.frames.at(-1)[0],f.sheet.canvas);f.player.dispose();
});

test('held columns schedule no animation loop; a finite gesture returns to the held column without a timer',()=>{
    const f=fixture(),held={...f.sheet,layout:{...f.sheet.layout,cycle:[1]},canvas:{held:true}};
    f.player.publish(held,'south');assert.equal(f.callbacks.size,0);assert.equal(f.frames.at(-1)[1],32);
    f.player.playSequence([{sheet:f.sheet,durationMs:300}],'south');f.tick(0);f.tick(100);f.tick(200);f.tick(300);
    assert.equal(f.frames.at(-1)[0],held.canvas);assert.equal(f.frames.at(-1)[1],32);assert.equal(f.callbacks.size,0);f.player.dispose();
});

test('repeating cues return to rest for CUE_REPEAT_MS (7s), replay until paused or cancelled, and respect pause during cooldown',()=>{
    const f=fixture(),rest={...f.sheet,layout:{...f.sheet.layout,cycle:[1]},canvas:{rest:true}},cast={...f.sheet,canvas:{cast:true}};
    const done=[],progress=[];
    f.player.publish(rest,'south');
    f.player.playSequence([{sheet:cast,durationMs:300}],'south',reason=>done.push(reason),(index,total)=>progress.push([index,total]),{repeatMs:CUE_REPEAT_MS});
    assert.equal(progress.length,1);
    for(const time of [0,100,200,300])f.tick(time);
    assert.deepEqual(done,['completed']);
    assert.equal(f.frames.at(-1)[0],rest.canvas);

    // Advance 3000ms into cooldown, then pause; cooldown timer must freeze while paused
    f.tick(3300);
    assert.equal(f.frames.at(-1)[0],rest.canvas);
    f.player.pause(true);
    assert.equal(f.callbacks.size,0);
    f.player.pause(false);
    // Resume and advance remaining 4000ms of the 7000ms cooldown
    f.tick(10000);
    f.tick(14000);
    assert.equal(progress.length,2);
    assert.equal(f.frames.at(-1)[0],cast.canvas);
    // Complete second cycle -> back to rest
    f.tick(14100);f.tick(14200);f.tick(14300);
    assert.deepEqual(done,['completed','completed']);
    assert.equal(f.frames.at(-1)[0],rest.canvas);

    // Cancelling during cooldown stops future repeats without firing a spurious cancelled callback
    f.player.cancel();
    assert.equal(f.callbacks.size,0);
    assert.deepEqual(done,['completed','completed']);
    f.player.dispose();
});
