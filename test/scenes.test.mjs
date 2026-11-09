import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../schemas/lpc-state.schema.json' with {type:'json'};
import { SCENE_SCHEMA, SCENE_PRESETS, validateScene } from '../src/catalog/scenes.mjs';
import { createDefinition } from '../src/state/defaults.mjs';
import { validateDefinition, validatePresentation } from '../src/state/validate.mjs';
import { initializeState, appendChange, reconstruct } from '../src/state/history.mjs';
import { modelContract, modelContext } from '../src/state/model-contract.mjs';

const definition=createDefinition('11111111-1111-4111-8111-111111111111');
test('scene gates match state/tool schemas, accept legacy plain and curated presets, reject unsupported/fabricated choices',()=>{
    assert.deepEqual(SCENE_SCHEMA,schema.definitions.scene);
    validateDefinition(definition);
    const contract=modelContract(definition,definition.startingPresentation);
    for(const preset of Object.values(SCENE_PRESETS)) {
        const next=validatePresentation(definition,definition.startingPresentation,{scene:preset.scene});
        assert.equal(next.outfitId,definition.startingPresentation.outfitId);
        assert.deepEqual(contract.validate({requestId:'scene',established:true,scene:preset.scene}).presentation.scene,preset.scene);
    }
    for(const patch of [{backgroundId:'https://evil.test/room.svg'},{backgroundId:'../../room'},{lightId:'fire'},{lightId:null},{scale:2},{scale:0.4},{x:-0.1},{y:1.1},{url:'https://evil.test'},{scale:NaN}]) {
        const scene={...SCENE_PRESETS.clearing.scene,...patch};
        assert.throws(()=>validateScene(scene));
        assert.throws(()=>validatePresentation(definition,definition.startingPresentation,{scene}));
        assert.throws(()=>contract.validate({requestId:'bad-scene',established:true,scene}));
    }
    assert.match(modelContext(definition,definition.startingPresentation),/Visual approximation/);
});
test('scene snapshots/defaults and response replay preserve wardrobe/identity and reject bad inactive history',()=>{
    let count=0;const uuid=()=>`${(++count).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
    const state=initializeState(definition,uuid), chat=[{mes:'A visual change',is_user:false,extra:{}}];
    const scene=SCENE_PRESETS.fireside.scene;
    const changed=appendChange(state,chat,{schemaVersion:1,kind:'presentation-patch',patch:{outfitId:'summer',scene}},uuid);
    const result=reconstruct(changed.state,changed.messages);
    assert.deepEqual(result.definition.identity,definition.identity);assert.equal(result.presentation.outfitId,'summer');assert.deepEqual(result.presentation.scene,scene);
    assert.equal(reconstruct(changed.state,[]).presentation.scene.backgroundId,'plain');
    const defaults=structuredClone(definition);defaults.startingPresentation.scene=scene;
    assert.deepEqual(initializeState(defaults,uuid).snapshot.startingPresentation.scene,scene);
    assert.equal(state.snapshot.startingPresentation.scene.backgroundId,'plain');
    const bad=structuredClone(changed.state);bad.history[0].change.patch.scene.backgroundId='missing';assert.throws(()=>reconstruct(bad,[]));
});
