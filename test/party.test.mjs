import test from 'node:test';
import assert from 'node:assert/strict';
import schema from '../schemas/lpc-state.schema.json' with {type:'json'};
import { PARTY_SCENES, PARTY_SCENE_SCHEMA, partyScene } from '../src/state/party.mjs';
import { createDefinition } from '../src/state/defaults.mjs';
import { validatePresentation } from '../src/state/validate.mjs';
import { modelContract, modelContextData } from '../src/state/model-contract.mjs';
import { initializeState, appendChange, reconstruct } from '../src/state/history.mjs';
import { exportCompanion, importCompanion } from '../src/state/packages.mjs';
import { requiredArtwork } from '../src/state/portable-packages.mjs';
const definition=createDefinition('11111111-1111-4111-8111-111111111111');
let n=0;const uuid=()=>`${(++n).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
test('party scene schema/tool gates agree; scene membership never chooses interface layout or detailed backdrop',()=>{
    assert.deepEqual(schema.definitions.presentation.properties.partySceneId,PARTY_SCENE_SCHEMA);assert.deepEqual(schema.definitions.patch.properties.partySceneId,PARTY_SCENE_SCHEMA);
    const contract=modelContract(definition,definition.startingPresentation);
    for(const [id]of PARTY_SCENES){const next=contract.validate({requestId:'move',established:true,partySceneId:id}).presentation;assert.equal(next.partySceneId,id);assert.deepEqual(next.scene,definition.startingPresentation.scene);assert.equal(next.outfitId,'everyday');assert.ok(partyScene(id).backgroundId);}
    for(const id of ['invented','https://host/scene',null,{},'<script>'])assert.throws(()=>contract.validate({requestId:'bad',established:true,partySceneId:id}));
    assert.throws(()=>contract.validate({requestId:'bad',established:true,partySceneId:'hearth',layout:'party'}));
    assert.equal(validatePresentation(definition,definition.startingPresentation,{facing:'south'}).partySceneId,undefined);assert.equal(partyScene().backgroundId,'plain');assert.equal(modelContextData(definition,definition.startingPresentation).partyScenes.length,4);
});
test('split/reunion membership follows response receipts, swipes, delete and branch reconstruction independently',()=>{
    const state=initializeState(definition,uuid),chat=[{mes:'We enter the woods.',extra:{}}];
    const joined=appendChange(state,chat,{schemaVersion:1,kind:'presentation-patch',patch:{partySceneId:'woodland'}},uuid);
    joined.messages.push({mes:'I stay at the hearth.',extra:{}});
    const split=appendChange(joined.state,joined.messages,{schemaVersion:1,kind:'presentation-patch',patch:{partySceneId:'hearth'}},uuid);
    assert.equal(reconstruct(split.state,split.messages).presentation.partySceneId,'hearth');
    const branch=split.messages.slice(0,1);assert.equal(reconstruct(split.state,branch).presentation.partySceneId,'woodland');
    const alternative=structuredClone(split.messages);alternative[1].extra={};assert.equal(reconstruct(split.state,alternative).presentation.partySceneId,'woodland');assert.equal(reconstruct(split.state,[]).presentation.partySceneId,undefined);
    const other=initializeState(definition,uuid);assert.equal(reconstruct(other,split.messages).presentation.partySceneId,undefined);
});
test('starting membership roundtrips config packages with its distinct shared backdrop and attribution',()=>{
    const start=structuredClone(definition);start.startingPresentation.partySceneId='woodland';start.startingPresentation.scene={backgroundId:'hearth',x:0.5,y:1,scale:1};
    const value=exportCompanion(start),next=importCompanion(JSON.stringify(value),definition.characterId);assert.equal(next.startingPresentation.partySceneId,'woodland');assert.equal(value.attribution.partyScene.backgroundId,'woodland');assert.equal(value.attribution.scene.backgroundId,'hearth');assert.ok(requiredArtwork(start).includes('backgrounds/woodland.svg'));assert.ok(requiredArtwork(start).includes('backgrounds/hearth.svg'));
});
