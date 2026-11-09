import {SOURCE_IDENTITY_SLOTS,SOURCE_LOOP_ACTIONS} from './full-state.mjs';
import {FULL_SOURCE_COMMIT} from '../catalog/full-catalog.mjs';
import {catalog as curatedCatalog} from '../catalog/catalog.mjs';
import {MAX_OUTFITS,nextOutfitId} from './wardrobe.mjs';
const identitySlots=new Set(SOURCE_IDENTITY_SLOTS);

function mapCuratedSelection(sel,fullCatalog){
 if(!sel?.itemId)return null;
 const item=curatedCatalog.items[sel.itemId];
 const sourceId=item?.upstreamSource?.itemId
  ??(sel.itemId==='body_female'?'body'
   :sel.itemId.startsWith('face_neutral')?'face_neutral'
   :sel.itemId==='shield_heater_revised_wood_recolor'?'shield_heater_revised_wood'
   :sel.itemId.startsWith('heads_')?sel.itemId
   :sel.itemId.replace(/_female$/,''));
 let found;
 try{found=fullCatalog.item(sourceId);}catch{return null;}
 const targetSlot=found.type_name??found.slot;
 const variant=found.variants.length?found.variants[0]:null;
 const colors={};
 const primaryChannel=fullCatalog.colorOptions(found.id)[0]?.channel;
 if(primaryChannel&&sel.paletteId&&!sel.paletteId.startsWith('original.')){
  try{colors[primaryChannel]=fullCatalog.validateColor(found.id,primaryChannel,sel.paletteId);}catch{}
 }
 return {slot:targetSlot,selection:{itemId:found.id,variant,colors}};
}

/** Upgrades a schemaVersion 1 curated definition into a schemaVersion 2 full-catalog definition. */
export function upgradeCuratedDefinitionToSource(v1Def,fullCatalog,fullState){
 if(!v1Def||v1Def.schemaVersion!==1||!fullCatalog||!fullState)return null;
 try{
  const bodyType=v1Def.identity?.bodyType==='female'?'female':'male';
  const identitySelections={};
  for(const slot of ['body','head','hair','beard','ears','expression']){
   const mapped=mapCuratedSelection(v1Def.identity?.[slot],fullCatalog);
   if(mapped&&fullCatalog.item(mapped.selection.itemId).required.includes(bodyType)){
    identitySelections[mapped.slot]=mapped.selection;
   }
  }
  const firstOutfitSelections={};
  for(const [,sel]of Object.entries(v1Def.outfits?.[0]?.selections??{})){
   const mapped=mapCuratedSelection(sel,fullCatalog);
   if(mapped&&fullCatalog.item(mapped.selection.itemId).required.includes(bodyType)){
    firstOutfitSelections[mapped.slot]=mapped.selection;
   }
  }
  const restActionId=v1Def.startingPresentation?.posture==='walk'?'walk':'idle';
  const baseDef=fullState.createDefinition({
   schemaVersion:2,
   sourceCommit:FULL_SOURCE_COMMIT,
   bodyType,
   selections:{...identitySelections,...firstOutfitSelections},
   matchBodyColor:true,
   applyMask:true,
  },v1Def.characterId,{
   restActionId,
   facing:v1Def.startingPresentation?.facing??'south',
  });
  const d=sourceDraft(baseDef,fullCatalog);
  const raw=d.read();
  raw.outfits=v1Def.outfits.map(o=>{
   const outSel={};
   for(const [,sel]of Object.entries(o.selections??{})){
    const mapped=mapCuratedSelection(sel,fullCatalog);
    if(mapped&&fullCatalog.item(mapped.selection.itemId).required.includes(bodyType)){
     outSel[mapped.slot]=mapped.selection;
    }
   }
   return {
    id:o.id,
    name:o.name,
    selections:outSel,
    selectionOrder:[...Object.keys(raw.identity.selections),...Object.keys(outSel)],
    rest:{actionId:restActionId,frame:0},
   };
  });
  raw.startingPresentation={
   ...raw.startingPresentation,
   outfitId:v1Def.startingPresentation.outfitId,
   facing:v1Def.startingPresentation?.facing??'south',
   moodId:v1Def.startingPresentation?.moodId??'none',
   partySceneId:v1Def.startingPresentation?.partySceneId??'together',
   scene:structuredClone(v1Def.startingPresentation?.scene??{backgroundId:'plain',x:0.5,y:1,scale:1}),
  };
  d.replace(raw);
  return fullState.validateDefinition(d.canonicalize());
 }catch{
  return null;
 }
}
/** Local editor operations. Invalid intermediate combinations remain local until validated. */
export function sourceDraft(definition,catalog){
 let value=structuredClone(definition),selected=value.startingPresentation.outfitId;
 const outfit=()=>value.outfits.find(o=>o.id===selected);
 function normalize(){
  for(const o of value.outfits){
   const all={...value.identity.selections,...o.selections};o.selectionOrder=o.selectionOrder.filter(s=>Object.hasOwn(all,s));for(const s of Object.keys(all))if(!o.selectionOrder.includes(s))o.selectionOrder.push(s);
  }
  for(const [slot,s]of Object.entries(value.identity.selections)){value.identity.colorMemory[slot]??={};Object.assign(value.identity.colorMemory[slot],s.colors);}
 }
 return {read:()=>structuredClone(value),outfit:()=>structuredClone(outfit()),selected:()=>selected,select(id){if(!value.outfits.some(o=>o.id===id))throw Error('Unknown outfit.');selected=id;},
  replace(next){value=structuredClone(next);selected=value.startingPresentation.outfitId;},
  setItem(slot,id){const target=identitySlots.has(slot)?value.identity.selections:outfit().selections;if(id){const item=catalog.item(id);if(item.type_name!==slot||!item.required.includes(value.identity.bodyType))throw Error('This item does not match the selected slot and body.');const colors={};if(identitySlots.has(slot))for(const [channel,color]of Object.entries(value.identity.colorMemory[slot]??{})){try{colors[channel]=catalog.validateColor(id,channel,color);}catch{}}target[slot]={itemId:id,variant:item.variants[0]??null,colors};}else delete target[slot];normalize();},
  setVariant(slot,variant){const s=value.identity.selections[slot]??outfit().selections[slot],item=catalog.item(s.itemId);if(!item.variants.includes(variant))throw Error('Unknown variant.');s.variant=variant;},
  setColor(slot,channel,color){const s=value.identity.selections[slot]??outfit().selections[slot];if(!s)throw Error('Choose an item first.');if(color)s.colors[channel]=catalog.validateColor(s.itemId,channel,color);else{delete s.colors[channel];if(identitySlots.has(slot))delete value.identity.colorMemory[slot]?.[channel];}normalize();},
  body(id){if(!catalog.bodies().includes(id))throw Error('Unknown body profile.');value.identity.bodyType=id;},
  options(patch){Object.assign(value.renderOptions,patch);},
  rest(actionId,frame){outfit().rest={actionId,frame};if(value.startingPresentation.outfitId===selected&&value.startingPresentation.playback.mode==='hold')value.startingPresentation.playback={mode:'hold',actionId,frame};},
  starting(id){if(!value.outfits.some(o=>o.id===id))throw Error('Unknown starting outfit.');value.startingPresentation.outfitId=id;value.startingPresentation.playback={mode:'hold',...value.outfits.find(o=>o.id===id).rest};},
  startingActivity(actionId){if(actionId==='none')value.startingPresentation.playback={mode:'hold',...value.outfits.find(o=>o.id===value.startingPresentation.outfitId).rest};else{if(!SOURCE_LOOP_ACTIONS.includes(actionId))throw Error('Choose a supported starting loop.');value.startingPresentation.playback={mode:'loop',actionId};}selected=value.startingPresentation.outfitId;},
  facing(id){value.startingPresentation.facing=id;},mood(id){value.startingPresentation.moodId=id;},partyScene(id){value.startingPresentation.partySceneId=id;},rename(name){if(!name.trim()||name.length>80)throw Error('Use an outfit name of 1–80 characters.');outfit().name=name;},
  scene(scene){value.startingPresentation.scene=structuredClone(scene);},
  duplicate(id=nextOutfitId(value.outfits)){if(value.outfits.length>=MAX_OUTFITS||value.outfits.some(o=>o.id===id))throw Error('An outfit needs a new ID and at most 99 outfits are allowed.');const copy=structuredClone(outfit());copy.id=id;copy.name=(copy.name.slice(0,70)+' copy');value.outfits.push(copy);selected=id;},
  remove(){if(value.outfits.length===1)throw Error('Keep at least one outfit.');value.outfits=value.outfits.filter(o=>o.id!==selected);selected=value.outfits[0].id;if(!value.outfits.some(o=>o.id===value.startingPresentation.outfitId))this.starting(selected);},
  presentation(){const p=structuredClone(value.startingPresentation);return {...p,outfitId:selected,playback:selected===p.outfitId?p.playback:{mode:'hold',...outfit().rest}};},
  canonicalize(){
   // The source's linked-color rule is explicit. Canonicalization cannot omit physical slots.
   for(const o of value.outfits){normalize();const all={...value.identity.selections,...o.selections},recipe=catalog.validateRecipe({schemaVersion:2,sourceCommit:value.sourceCommit,bodyType:value.identity.bodyType,...value.renderOptions,selections:Object.fromEntries(o.selectionOrder.map(s=>[s,all[s]]))});for(const [slot,s]of Object.entries(recipe.selections))(identitySlots.has(slot)?value.identity.selections:o.selections)[slot]=s;}normalize();return this.read();
  }
 };
}
