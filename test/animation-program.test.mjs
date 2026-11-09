import test from 'node:test';
import assert from 'node:assert/strict';
import {activityAnimation,validateSequence} from '../src/state/animation-program.mjs';
import {createDefinition} from '../src/state/defaults.mjs';
import {validateDefinition,validatePresentation} from '../src/state/validate.mjs';
import {modelContract,modelContextData} from '../src/state/model-contract.mjs';
const definition=createDefinition('11111111-1111-4111-8111-111111111111');
test('legacy resting states remain valid; activities use full outfit capability and persist independently of cues',()=>{
    validateDefinition(definition);assert.equal(activityAnimation(definition.startingPresentation),'idle');
    const presentation=validatePresentation(definition,definition.startingPresentation,{activityId:'run'});assert.equal(activityAnimation(presentation),'run');assert.equal(presentation.posture,'idle');
    assert.throws(()=>validatePresentation(definition,presentation,{activityId:'jump'}));
    const next=structuredClone(definition);next.startingPresentation.activityId='run';validateDefinition(next);
    assert.deepEqual(modelContextData(next,presentation).outfits[0].supported.includes('run'),true);
});
test('sequence contract bounds and validates every step, with no arbitrary paths or extra instructions',()=>{
    const presentation=definition.startingPresentation;
    const steps=validateSequence([{actionId:'jump'},{actionId:'spellcast'}],definition,presentation);assert.deepEqual(steps.map(step=>step.actionId),['jump','spellcast']);assert.ok(steps.every(step=>step.durationMs>0));
    for(const sequence of [[],Array(5).fill({actionId:'jump'}),[{actionId:'bow'}],[{actionId:'jump',repeat:10}],[{actionId:'../jump'}],[null]])assert.throws(()=>validateSequence(sequence,definition,presentation));
    const contract=modelContract(definition,presentation),args={requestId:'seq',established:true,activityId:'walk',sequence:[{actionId:'jump'},{actionId:'spellcast'}]};
    const checked=contract.validate(args);assert.equal(checked.presentation.activityId,'walk');assert.equal(checked.sequence.length,2);
    assert.throws(()=>contract.validate({...args,actionId:'jump'}));assert.equal(Object.hasOwn(checked.presentation,'sequence'),false);
});

test('activities follow accepted response/swipe/delete/branch history; transient sequences cannot enter saved patches',async()=>{
    const {initializeState,appendChange,reconstruct}=await import('../src/state/history.mjs');let n=0;const uuid=()=>`${(++n).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
    const state=initializeState(definition,uuid),chat=[{mes:'We walk together.',extra:{}}];
    const walk=appendChange(state,chat,{schemaVersion:1,kind:'presentation-patch',patch:{activityId:'walk'}},uuid,'model');
    walk.messages.push({mes:'Now we run.',extra:{}});const run=appendChange(walk.state,walk.messages,{schemaVersion:1,kind:'presentation-patch',patch:{activityId:'run'}},uuid,'model');
    assert.equal(reconstruct(run.state,run.messages).presentation.activityId,'run');assert.equal(reconstruct(run.state,run.messages.slice(0,1)).presentation.activityId,'walk');
    const alternative=structuredClone(run.messages);alternative[1].extra={};assert.equal(reconstruct(run.state,alternative).presentation.activityId,'walk');assert.equal(activityAnimation(reconstruct(run.state,[]).presentation),'idle');
    assert.throws(()=>appendChange(run.state,run.messages,{schemaVersion:1,kind:'presentation-patch',patch:{sequence:[{actionId:'jump'}]}},uuid));
});

test('cape stays visible: incompatible activity or later jump rejects the entire operation',()=>{
    const caped=structuredClone(definition);caped.outfits[0].selections.cape={itemId:'cape_solid',paletteId:'cloth.ulpc.white'};validateDefinition(caped);
    assert.throws(()=>validatePresentation(caped,caped.startingPresentation,{activityId:'run'}),/outfit cannot/);
    assert.throws(()=>validateSequence([{actionId:'spellcast'},{actionId:'jump'}],caped,caped.startingPresentation),/complete outfit/);
    const contract=modelContract(caped,caped.startingPresentation);assert.throws(()=>contract.validate({requestId:'cape',established:true,activityId:'walk',sequence:[{actionId:'spellcast'},{actionId:'jump'}]}));
    assert.equal(validateSequence([{actionId:'spellcast'}],caped,caped.startingPresentation).length,1);
});

test('starting activities roundtrip credited packages while legacy definitions remain field-free',async()=>{
    const {exportCompanion,importCompanion}=await import('../src/state/packages.mjs');
    const next=structuredClone(definition);next.startingPresentation.activityId='walk';const value=exportCompanion(next);assert.equal(importCompanion(JSON.stringify(value),definition.characterId).startingPresentation.activityId,'walk');assert.equal(Object.hasOwn(definition.startingPresentation,'activityId'),false);
});

test('held rest selects a physical column after full composition; expressive gesture uses its explicit finite program',async()=>{
    const {composeActivity,composeSequence}=await import('../src/presentation/animation-sheets.mjs');const {catalog,selectionsFor}=await import('../src/catalog/catalog.mjs');
    const calls=[],composer={compose:async(_selections,id)=>{calls.push(id);return {canvas:{width:(Math.max(...catalog.animations[id].cycle)+1)*64},layout:catalog.animations[id]};}};
    for(const [id,column]of [['sit_low',0],['sit_upright',1]]){const presentation=validatePresentation(definition,definition.startingPresentation,{activityId:id});const sheet=await composeActivity(composer,selectionsFor(definition,'everyday'),presentation);assert.equal(sheet.canvas.width,192);assert.deepEqual(sheet.layout.cycle,[column]);assert.equal(calls.at(-1),'sit');}
    const [gesture]=await composeSequence(composer,[{actionId:'arms_raise'}],definition,definition.startingPresentation);assert.equal(gesture.durationMs,800);assert.equal(calls.at(-1),'emote');assert.deepEqual(gesture.sheet.layout.cycle,[0,1,2,1,0]);assert.equal(gesture.sheet.layout.frameMs,160);
    assert.throws(()=>validatePresentation(definition,definition.startingPresentation,{activityId:'arms_raise'}));assert.throws(()=>validateSequence([{actionId:'sit'}],definition,definition.startingPresentation));
});

test('cape/trim/shield reject held poses and gestures for the complete outfit, in every facing',()=>{
    for(const extra of [{cape:{itemId:'cape_solid',paletteId:'cloth.ulpc.white'}},{cape:{itemId:'cape_solid',paletteId:'cloth.ulpc.white'},accessory:{itemId:'cape_trim',paletteId:'cloth.ulpc.white'}},{prop:{itemId:'shield_heater_revised_wood',paletteId:'original.ulpc.original'}}]){
        const next=structuredClone(definition);Object.assign(next.outfits[0].selections,extra);validateDefinition(next);
        for(const facing of ['north','west','south','east']){for(const activityId of ['sit_low','sit_upright'])assert.throws(()=>validatePresentation(next,next.startingPresentation,{activityId,facing}));assert.throws(()=>validateSequence([{actionId:'arms_raise'}],next,{...next.startingPresentation,facing}));}
        const context=modelContextData(next,next.startingPresentation);assert.ok(!context.outfits[0].activities.includes('sit_low'));assert.ok(!context.outfits[0].supported.includes('arms_raise'));
    }
});
