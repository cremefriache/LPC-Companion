import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {createFullCatalog} from '../src/catalog/full-catalog.mjs';import {createFullState,SOURCE_IDENTITY_SLOTS,SOURCE_OUTFIT_SLOTS} from '../src/state/full-state.mjs';import {sourceFixture} from '../tools/full-catalog-fixtures.mjs';import {MESSAGE_KEY} from '../src/state/history.mjs';
import {createDefinition as curatedDefinition} from '../src/state/defaults.mjs';
import {changeBodyType} from '../src/state/wardrobe.mjs';
import {upgradeCuratedDefinitionToSource} from '../src/state/source-draft.mjs';
import {readCloset} from '../src/state/closet.mjs';
import {initializeState as initializeCurated,appendChange as appendCurated,reconstruct as replayCurated} from '../src/state/history.mjs';
const root=new URL('../',import.meta.url),metadata=JSON.parse(await readFile(new URL('vendor/lpc/full-catalog/metadata.json',root),'utf8')),repairs=JSON.parse(await readFile(new URL('vendor/lpc/full-catalog/repairs.json',root),'utf8')),index=JSON.parse(gunzipSync(await readFile(new URL('assets/lpc/full-source/index.json.gz',root)))),assets=Object.entries(index.paths).map(([path,sha256])=>({path,sha256,width:index.blobs[sha256].width,height:index.blobs[sha256].height})),catalog=createFullCatalog({metadata,assets,repairs}),state=createFullState(catalog);let count=0;const uuid=()=>`12345678-1234-4234-8234-${String(++count).padStart(12,'0')}`;
function definition(id='hair_bob',body='male'){const recipe=sourceFixture(metadata,id,body),actions=catalog.resolvableActions(recipe),restActionId=actions.includes('walk')?'walk':actions[0];return state.createDefinition(recipe,uuid(),{restActionId});}
const patch=p=>({schemaVersion:2,kind:'presentation-patch',patch:p});
test('source identity/outfit partition covers all 106 slots and every definition round-trips original selection and layer order',()=>{
 assert.equal(new Set([...SOURCE_IDENTITY_SLOTS,...SOURCE_OUTFIT_SLOTS]).size,106);assert.equal(SOURCE_IDENTITY_SLOTS.some(s=>SOURCE_OUTFIT_SLOTS.includes(s)),false);
 for(const item of metadata.items){let r,actions;for(const body of item.required){r=sourceFixture(metadata,item.id,body);actions=catalog.resolvableActions(r);if(actions.length)break;}assert(actions.length,item.id);const d=state.createDefinition(r,uuid(),{restActionId:actions.includes('walk')?'walk':actions[0]});assert.deepEqual(state.recipeFor(d,'imported'),catalog.validateRecipe(r));assert.deepEqual(d.outfits[0].selectionOrder,Object.keys(r.selections));}
});
test('identity fields cannot enter outfits; duplicate IDs, omitted order, changed memory and unsupported playback fail separately',()=>{
 const d=definition();for(const change of [v=>v.outfits[0].selections.hair=v.identity.selections.hair,v=>v.outfits.push(structuredClone(v.outfits[0])),v=>v.outfits[0].selectionOrder.pop(),v=>v.identity.colorMemory.hair={hair:'hair.ulpc.unknown'},v=>v.startingPresentation.playback.frame=63,v=>v.startingPresentation.playback.actionId='fake']){const bad=structuredClone(d);change(bad);assert.throws(()=>state.validateDefinition(bad));}
 assert.throws(()=>state.createDefinition(sourceFixture(metadata,'hair_bob'),uuid()),/corrupt/);
});
test('named outfit switches replace garments, choose their authored held rest, retain identity and facing, and loop only whole valid source programs',()=>{
 const d=definition('torso_clothes_tshirt'),other=structuredClone(d.outfits[0]);other.id='bare';other.name='Bare';other.selections={};other.selectionOrder=Object.keys(d.identity.selections);d.outfits.push(other);state.validateDefinition(d);
 const identityBefore=structuredClone(d.identity),current={...d.startingPresentation,facing:'west',playback:{mode:'loop',actionId:'run'}},next=state.validatePresentation(d,current,{outfitId:'bare'});assert.deepEqual(next.playback,{mode:'hold',...other.rest});assert.equal(next.facing,'west');assert.equal(state.recipeFor(d,'bare').selections.clothes,undefined);assert.deepEqual(d.identity,identityBefore);
 assert.throws(()=>state.validatePresentation(d,d.startingPresentation,{playback:{mode:'loop',actionId:'jump'}}),/finite cue/);
 const cape=definition('cape_solid');assert.throws(()=>state.validatePresentation(cape,cape.startingPresentation,{playback:{mode:'loop',actionId:'jump'}}));
});
test('source defaults copy once, response/swipe receipts replay, deletion reverts and branches evolve without mutating the shared source',()=>{
 const d=definition(),original=state.initializeState(d,uuid);d.revision++;d.identity.bodyType='female';assert.equal(original.snapshot.identity.bodyType,'male');
 let result=state.appendChange(original,[{is_user:false,mes:'A'}],patch({facing:'west'}),uuid);const receipt=structuredClone(result.messages[0].extra[MESSAGE_KEY]);assert.equal(state.reconstruct(result.state,result.messages).presentation.facing,'west');assert.equal(state.reconstruct(result.state,[]).presentation.facing,'south');
 const swiped=structuredClone(result.messages);swiped[0].extra[MESSAGE_KEY]={...receipt,swipeId:uuid(),entries:[]};assert.equal(state.reconstruct(result.state,swiped).presentation.facing,'south');
 const branch=state.appendChange(structuredClone(result.state),structuredClone(result.messages),patch({facing:'east'}),uuid);assert.equal(branch.presentation.facing,'east');assert.equal(state.reconstruct(result.state,result.messages).presentation.facing,'west');
});
test('source history validates inactive replacements, ownership, entry order, accepted-model anchors and hard history/data bounds',()=>{
 const d=definition(),initial=state.initializeState(d,uuid);assert.throws(()=>state.appendChange(initial,[],patch({facing:'east'}),uuid,'model'),/accepted assistant/);
 const other=definition('hair_natural'),bad={schemaVersion:2,kind:'companion-replacement',definition:other,presentation:other.startingPresentation};assert.throws(()=>state.appendChange(initial,[],bad,uuid),/another character/);
 const replacement=structuredClone(other);replacement.characterId=d.characterId;const replaced=state.appendChange(initial,[{is_user:false,mes:'Accepted'}],{schemaVersion:2,kind:'companion-replacement',definition:replacement,presentation:replacement.startingPresentation},uuid);replaced.state.history[0].change.definition.identity.selections.body.itemId='made_up';assert.throws(()=>state.reconstruct(replaced.state,[]));
 const one=state.appendChange(initial,[],patch({facing:'west'}),uuid),invalid=structuredClone(one.state);invalid.history[0].sequence=0;assert.throws(()=>state.reconstruct(invalid,one.messages));
 const full=structuredClone(initial);full.history=Array.from({length:1000},(_,n)=>({entryId:uuid(),sequence:n+1,origin:'manual',response:null,change:patch({facing:'west'})}));assert.throws(()=>state.appendChange(full,[],patch({facing:'east'}),uuid),/1,000/);assert.equal(full.history.length,1000);
 assert.throws(()=>state.validateContract({...initial,extra:'x'.repeat(2_000_001)},'chatState'),/2 MB/);
});
test('full import requires an explicit resting source choice and retains bounded provenance separately from preview UI flags',async()=>{
 const text=await readFile(new URL('test/fixtures/generator-default.json',root),'utf8');assert.throws(()=>state.importDefinition(text,uuid()),/corrupt/);const result=state.importDefinition(text,uuid(),{restActionId:'walk'});assert.equal(result.previewAnimation,'walk');assert.equal(result.definition.startingPresentation.playback.mode,'hold');assert.equal(result.definition.importProvenance.format,'official-generator-v2');assert.equal(result.definition.identity.selections.hair,undefined);
});
test('model-origin source changes anchor only to an explicit accepted assistant response',()=>{
 const d=definition(),initial=state.initializeState(d,uuid),messages=[{is_user:false,mes:'A'},{is_user:true,mes:'User'},{is_user:false,mes:'B'}],before=structuredClone(messages),result=state.appendChange(initial,messages,patch({facing:'east'}),uuid,'model',0);assert.equal(result.state.history[0].origin,'model');assert(result.messages[0].extra[MESSAGE_KEY]);assert.equal(result.messages[2].extra,undefined);assert.equal(state.reconstruct(result.state,result.messages).presentation.facing,'east');assert.deepEqual(messages,before);assert.throws(()=>state.appendChange(initial,messages,patch({facing:'west'}),uuid,'model',1),/accepted assistant/);
});

function curatedReplacementHistory({cape=false,sparse=false}={}){
 const original=curatedDefinition(uuid());
 if(cape)for(const outfit of original.outfits)outfit.selections.cape={itemId:'cape_solid',paletteId:'cloth.ulpc.brown'};
 const edited=structuredClone(original);edited.revision++;edited.outfits.push({...structuredClone(edited.outfits[0]),id:'added',name:'Added outfit'});
 const a=appendCurated(initializeCurated(original,uuid),[{is_user:false,mes:'A'}],{schemaVersion:1,kind:'companion-replacement',definition:edited,presentation:edited.startingPresentation},uuid);
 const presentation={...edited.startingPresentation,outfitId:'added'};
 const b=appendCurated(a.state,[...a.messages,{is_user:false,mes:'B'}],{schemaVersion:1,kind:'presentation-patch',patch:sparse?{outfitId:'added'}:presentation},uuid);
 return {original,edited,...b,deleted:b.messages.slice(1)};
}

test('unguarded curated history keeps deleted replacement dependencies dormant and restores them without pruning',()=>{
 for(const sparse of [false,true]){
  const history=curatedReplacementHistory({sparse}),before=structuredClone(history.state),entry=history.state.history.at(-1);
  assert.equal(entry.change.definitionHash,undefined,'curated wire format stays unchanged');
  assert.equal(replayCurated(history.state,history.messages).presentation.outfitId,'added');
  const restored=replayCurated(history.state,history.deleted);
  assert.deepEqual(restored.definition,history.original);assert.deepEqual(restored.presentation,history.original.startingPresentation);assert.deepEqual(restored.dormantChanges,[entry.entryId]);
  const switched=structuredClone(history.messages);delete switched[0].extra;
  assert.deepEqual(replayCurated(history.state,switched),restored);
  assert.equal(replayCurated(history.state,history.messages).presentation.outfitId,'added');
  assert.deepEqual(history.state,before);
  assert.throws(()=>appendCurated(history.state,history.deleted,{schemaVersion:1,kind:'presentation-patch',patch:{outfitId:'added'}},uuid),/Unknown outfit/,'historical witnesses cannot authorize a new invalid patch');
 }
});

test('curated replay preserves compatible manual ordering and uses skipped replacement capability evidence only',()=>{
 const history=curatedReplacementHistory(),later=appendCurated(history.state,[...history.messages,{is_user:false,mes:'C'}],{schemaVersion:1,kind:'presentation-patch',patch:{facing:'west'}},uuid);
 const deleted=later.messages.slice(1),result=replayCurated(later.state,deleted);
 assert.equal(result.presentation.outfitId,'everyday');assert.equal(result.presentation.facing,'west');assert.deepEqual(result.dormantChanges,[history.state.history.at(-1).entryId]);
 assert.equal(replayCurated(later.state,later.messages).presentation.outfitId,'added');assert.equal(replayCurated(later.state,later.messages).presentation.facing,'west');
 const original=curatedDefinition(uuid());for(const outfit of original.outfits)outfit.selections.cape={itemId:'cape_solid',paletteId:'cloth.ulpc.brown'};
 const edited=structuredClone(original);edited.revision++;for(const outfit of edited.outfits)delete outfit.selections.cape;
 const replacement=appendCurated(initializeCurated(original,uuid),[{is_user:false,mes:'A'}],{schemaVersion:1,kind:'companion-replacement',definition:edited,presentation:edited.startingPresentation},uuid);
 const running=appendCurated(replacement.state,[...replacement.messages,{is_user:false,mes:'B'}],{schemaVersion:1,kind:'presentation-patch',patch:{...edited.startingPresentation,activityId:'run'}},uuid);
 assert.equal(replayCurated(running.state,running.messages).presentation.activityId,'run');const stopped=replayCurated(running.state,running.messages.slice(1));assert.equal(stopped.presentation.activityId,undefined);assert.deepEqual(stopped.dormantChanges,[running.state.history.at(-1).entryId]);
});

test('curated replay rejects genuinely invalid patches and corrupt skipped replacements',()=>{
 const history=curatedReplacementHistory({cape:true}),corrupt=structuredClone(history.state);
 Object.assign(corrupt.history.at(-1).change.patch,{outfitId:'everyday',activityId:'run'});assert.throws(()=>replayCurated(corrupt,history.deleted),/cannot perform/);
 const unknown=structuredClone(history.state);unknown.history.at(-1).change.patch.outfitId='unknown';assert.throws(()=>replayCurated(unknown,history.deleted),/Unknown history outfit/);
 const futureOnly=structuredClone(history.state),future=structuredClone(history.edited);future.outfits.push({...structuredClone(future.outfits[0]),id:'future',name:'Future'});futureOnly.history.at(-1).change.patch.outfitId='future';futureOnly.history.push({entryId:uuid(),sequence:3,origin:'manual',response:{messageId:uuid(),swipeId:uuid()},change:{schemaVersion:1,kind:'companion-replacement',definition:future,presentation:future.startingPresentation}});assert.throws(()=>replayCurated(futureOnly,history.deleted),/Unknown outfit/,'a later definition is not an original compatibility witness');
 const noWitness=initializeCurated(history.original,uuid);noWitness.history.push({entryId:uuid(),sequence:1,origin:'manual',response:null,change:{schemaVersion:1,kind:'presentation-patch',patch:{activityId:'run'}}});assert.throws(()=>replayCurated(noWitness,[]),/cannot perform/);
 const malformed=structuredClone(history.state);malformed.history.at(-1).change.patch.scene.scale=10;assert.throws(()=>replayCurated(malformed,history.deleted),/corrupt/);
 const invalidReplacement=structuredClone(history.state);invalidReplacement.history[0].change.definition.identity.hair.itemId='unknown';assert.throws(()=>replayCurated(invalidReplacement,history.deleted),/Unavailable hair/);
});

test('upgradeCuratedDefinitionToSource upgrades male and female v1 definitions into valid v2 full-catalog definitions with closet pieces',()=>{
 const maleV1=curatedDefinition(uuid());
 const upgradedMale=upgradeCuratedDefinitionToSource(maleV1,catalog,state);
 assert.equal(upgradedMale.schemaVersion,2);
 assert.equal(upgradedMale.characterId,maleV1.characterId);
 assert.equal(upgradedMale.identity.bodyType,'male');
 assert.deepEqual(upgradedMale.outfits.map(o=>o.id),['everyday','evening','summer']);
 assert.ok(readCloset(upgradedMale,catalog,null).length>=4);

 const femaleV1=changeBodyType(maleV1,'female');
 const upgradedFemale=upgradeCuratedDefinitionToSource(femaleV1,catalog,state);
 assert.equal(upgradedFemale.schemaVersion,2);
 assert.equal(upgradedFemale.identity.bodyType,'female');
 assert.equal(upgradedFemale.identity.selections.head.itemId,'heads_human_female');
 assert.deepEqual(upgradedFemale.outfits.map(o=>o.name),['Everyday','Evening','Summer']);
});
