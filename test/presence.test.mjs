import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, MOODS, MOOD_EXPRESSIONS, moodLabel } from '../src/presentation/presence.mjs';
import { populateSlotSelect, SLOT_CATEGORIES, slotShortName, formatSourceColorLabel, formatSourceActionLabel, SOURCE_POSE_PRESETS } from '../src/presentation/source-ui.mjs';
import { SOURCE_IDENTITY_SLOTS, SOURCE_OUTFIT_SLOTS } from '../src/state/full-state.mjs';
import { ACTION_PROGRAMS, supportedActions, validateSequence } from '../src/state/animation-program.mjs';
import { selectionsFor } from '../src/catalog/catalog.mjs';
import { createDefinition } from '../src/state/defaults.mjs';
import { modelContract, scopedToolsFor } from '../src/state/model-contract.mjs';
import { defaultRepertoireFor, readRepertoire, writeRepertoire, presetRepertoire, isActionEnabledInRepertoire } from '../src/state/repertoire.mjs';
import { initializeState, appendChange, reconstruct } from '../src/state/history.mjs';

function fixture({onDismiss=()=>{}}={}) {
    const timers=new Map();let next=0,now=0;
    class Element {
        constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.hidden=false;this.text='';this.listeners=new Map();}
        set textContent(value){this.text=String(value);this.children=[];}
        get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
        setAttribute(name,value){this.attributes[name]=String(value);}
        getAttribute(name){return this.attributes[name]??null;}
        append(...nodes){this.children.push(...nodes);}
        appendChild(node){this.append(node);return node;}
        replaceChildren(...nodes){this.text='';this.children=[...nodes];}
        addEventListener(name,callback){this.listeners.set(name,callback);}
        removeEventListener(name,callback){if(this.listeners.get(name)===callback)this.listeners.delete(name);}
        click(){const event={stopPropagation(){},preventDefault(){}};this.onclick?.(event);this.listeners.get('click')?.(event);}
        remove(){this.removed=true;}
    }
    const document={createElement:tag=>new Element(tag)};
    const window={setTimeout:(fn,delay)=>{timers.set(++next,{fn,at:now+delay});return next;},clearTimeout:id=>timers.delete(id)};
    const presence=createPresence({document,window,onDismiss}),find=control=>presence.speech.children.find(node=>node.dataset.control===control);
    const advance=ms=>{now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
    return {timers,presence,advance,content:()=>find('speech-content'),dismiss:()=>find('speech-dismiss')};
}
test('speech persists beyond five seconds, replaces bounded plain text and has an accessible dismiss button',()=>{
    let dismissed=0;const f=fixture({onDismiss:()=>dismissed++});
    f.presence.showSpeech('<img src=x onerror=bad()>');
    assert.equal(f.content().textContent,'<img src=x onerror=bad()>');assert.equal(f.content().children.length,0);assert.equal(f.presence.speech.hidden,false);assert.equal(f.content().getAttribute('role'),'status');
    assert.equal(f.dismiss().tagName,'BUTTON');assert.equal(f.dismiss().type,'button');assert.equal(f.dismiss().getAttribute('aria-label'),'Dismiss speech');assert.equal(f.dismiss().textContent,'×');
    assert.equal(f.timers.size,0);f.advance(6000);assert.equal(f.presence.speech.hidden,false);assert.equal(f.content().textContent,'<img src=x onerror=bad()>');
    f.presence.showSpeech('Second');f.advance(60_000);assert.equal(f.content().textContent,'Second');assert.equal(f.timers.size,0);
    assert.throws(()=>f.presence.showSpeech(' '.repeat(4)));assert.throws(()=>f.presence.showSpeech('a'.repeat(161)));assert.equal(f.content().textContent,'Second');
    f.dismiss().click();assert.equal(f.presence.speech.hidden,true);assert.equal(f.content().textContent,'');assert.equal(dismissed,1);
    f.presence.clearSpeech();assert.equal(dismissed,1,'Programmatic clearing must not recursively notify representation callbacks.');
    f.presence.setMood('cheerful');assert.equal(f.presence.mood.hidden,false);assert.throws(()=>f.presence.setMood('invented'));
    f.presence.showSpeech('last');const dismiss=f.dismiss();f.presence.dispose();f.advance(60_000);dismiss.click();assert.equal(dismissed,1);assert.equal(f.content().textContent,'');assert.equal(f.presence.speech.removed,true);assert.equal(f.presence.mood.removed,true);assert.equal(f.presence.showSpeech('after disposal'),false);assert.equal(f.timers.size,0);
});
test('dismiss callbacks clear both inspector and party representations without a feedback loop',()=>{
    let inspector,party,callbacks=0;
    inspector=fixture({onDismiss:()=>{callbacks++;party.presence.clearSpeech();}});party=fixture({onDismiss:()=>{callbacks++;inspector.presence.clearSpeech();}});
    for(const f of [inspector,party])f.presence.showSpeech('Shared companion speech');
    party.dismiss().click();assert.equal(inspector.presence.speech.hidden,true);assert.equal(party.presence.speech.hidden,true);assert.equal(callbacks,1);
    for(const f of [inspector,party])f.presence.showSpeech('New shared speech');
    inspector.dismiss().click();assert.equal(inspector.presence.speech.hidden,true);assert.equal(party.presence.speech.hidden,true);assert.equal(callbacks,2);
    inspector.presence.dispose();party.presence.dispose();
});
test('mood is response-associated presentation; speech is transient tool output only', () => {
    const definition = createDefinition('11111111-1111-4111-8111-111111111111'), contract = modelContract(definition, definition.startingPresentation);
    const result = contract.validate({ requestId: 'presence', established: true, moodId: 'thoughtful', speech: 'A brief hello.' });
    assert.equal(result.presentation.moodId, 'thoughtful'); assert.equal(result.speech, 'A brief hello.'); assert.equal(result.presentation.speech, undefined);
    assert.throws(() => contract.validate({ requestId: 'bad', established: true, speech: '   ' }));
    let count = 0; const uuid = () => `${(++count).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
    const changed = appendChange(initializeState(definition, uuid), [{ mes: 'Accepted mood', is_user: false, extra: {} }], { schemaVersion: 1, kind: 'presentation-patch', patch: { moodId: 'thoughtful' } }, uuid);
    assert.equal(reconstruct(changed.state, changed.messages).presentation.moodId, 'thoughtful'); assert.equal(reconstruct(changed.state, []).presentation.moodId, undefined);
});
test('all 12 expressive moods, grouped 104-slot studio selector, and extended main-panel action programs validate cleanly', () => {
    const definition = createDefinition('11111111-1111-4111-8111-111111111111'), contract = modelContract(definition, definition.startingPresentation);
    assert.equal(MOODS.length, 12);
    for (const moodId of MOODS) {
        assert.ok(moodLabel(moodId).length > 0);
        assert.equal(contract.validate({ requestId: `m-${moodId}`, established: true, moodId }).presentation.moodId, moodId);
        if (moodId !== 'none') assert.ok(MOOD_EXPRESSIONS[moodId].itemId.startsWith('face_'));
    }
    const actions = supportedActions(selectionsFor(definition, definition.startingPresentation.outfitId));
    assert.deepEqual(actions, ['jump', 'spellcast', 'arms_raise', 'watering', 'thrust', 'slash', 'shoot', 'nod', 'laugh', 'sigh', 'bounce', 'startle', 'shiver', 'shrug', 'polite_bow']);
    for (const actionId of ['watering', 'thrust', 'slash', 'shoot', 'nod', 'laugh', 'sigh', 'bounce', 'startle', 'shiver', 'shrug', 'polite_bow']) {
        const steps = validateSequence([{ actionId }], definition, definition.startingPresentation);
        assert.equal(steps[0].actionId, actionId);
        assert.ok(steps[0].durationMs > 0);
        assert.ok(ACTION_PROGRAMS[actionId].name.length > 0);
    }
    const allSlots = [...SOURCE_IDENTITY_SLOTS, ...SOURCE_OUTFIT_SLOTS];
    const doc = { createElement: tag => ({ tagName: tag.toUpperCase(), children: [], append(...n) { this.children.push(...n); }, replaceChildren(...n) { this.children = [...n]; } }) };
    const selectInput = doc.createElement('select');
    populateSlotSelect(doc, selectInput, allSlots, SOURCE_IDENTITY_SLOTS);
    assert.equal(selectInput.children[0].value, '__all__');
    const optgroups = selectInput.children.slice(1);
    assert.ok(optgroups.every(g => g.tagName === 'OPTGROUP' && g.label.length > 0));
    const optionValues = optgroups.flatMap(g => g.children.map(o => o.value));
    assert.equal(new Set(optionValues).size, 104);
    assert.equal(selectInput.value, 'body');
    assert.ok(SLOT_CATEGORIES.length >= 7);
    assert.equal(slotShortName('clothes'), 'Tops & shirts');
    assert.match(formatSourceColorLabel('cloth.ulpc.navy'), /Navy/);
    assert.match(formatSourceActionLabel('spellcast'), /Cast gesture/);
    assert.ok(SOURCE_POSE_PRESETS.some(p => p.id === 'sleeping'));
});

test('repertoire hides weapon/tool actions by default when unarmed and lets users customize main-page poses, moods, and actions', () => {
    const definition = createDefinition('22222222-2222-4222-8222-222222222222');
    const defRep = defaultRepertoireFor(definition, 'everyday');
    assert.equal(isActionEnabledInRepertoire('nod', defRep), true);
    assert.equal(isActionEnabledInRepertoire('jump', defRep), true);
    assert.equal(isActionEnabledInRepertoire('thrust', defRep), false);
    assert.equal(isActionEnabledInRepertoire('slash', defRep), false);
    assert.equal(isActionEnabledInRepertoire('shoot', defRep), false);
    assert.equal(isActionEnabledInRepertoire('watering', defRep), false);

    const defaultTools = scopedToolsFor(definition, definition.startingPresentation);
    const emoteTool = defaultTools.find(t => t.name === 'lpc_emote');
    assert.equal(emoteTool.parameters.properties.action.enum.includes('thrust'), false);
    assert.equal(emoteTool.parameters.properties.action.enum.includes('nod'), true);

    writeRepertoire(definition.characterId, {
        mode: 'custom',
        poses: ['walk', 'sleeping'],
        expressions: ['calm', 'cheerful'],
        actions: ['nod', 'thrust'],
    });
    const customRep = readRepertoire(definition, 'everyday');
    assert.deepEqual(customRep.poses, ['walk', 'sleeping']);
    assert.deepEqual(customRep.expressions, ['calm', 'cheerful']);
    assert.deepEqual(customRep.actions, ['nod', 'thrust']);

    const customTools = scopedToolsFor(definition, definition.startingPresentation);
    const customPoseTool = customTools.find(t => t.name === 'lpc_pose');
    const customEmoteTool = customTools.find(t => t.name === 'lpc_emote');
    assert.deepEqual(customPoseTool.parameters.properties.pose.enum, ['idle', 'walk', 'sleeping']);
    assert.deepEqual(customEmoteTool.parameters.properties.mood.enum, ['none', 'calm', 'cheerful']);
    assert.deepEqual(customEmoteTool.parameters.properties.action.enum, ['thrust', 'nod']);

    const allPreset = presetRepertoire('all', definition, 'everyday');
    assert.equal(allPreset.actions.includes('thrust'), true);
    writeRepertoire(definition.characterId, { mode: 'auto' });
});
