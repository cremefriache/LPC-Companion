import Ajv from 'ajv';
import sourceSchema from '../../schemas/lpc-source-state.schema.json' with {type:'json'};
import recipeSchema from '../../schemas/lpc-source-recipe.schema.json' with {type:'json'};
import legacySchema from '../../schemas/lpc-state.schema.json' with {type:'json'};
import {FULL_SOURCE_COMMIT} from '../catalog/full-catalog.mjs';
import {validateScene} from '../catalog/scenes.mjs';
import {createHistoryEngine} from './history.mjs';
import {importFullGenerator} from './full-generator-import.mjs';

export const SOURCE_IDENTITY_SLOTS=Object.freeze([...sourceSchema.definitions.identity.properties.selections.propertyNames.enum]);
export const SOURCE_OUTFIT_SLOTS=Object.freeze([...sourceSchema.definitions.outfit.properties.selections.propertyNames.enum]);
export const SOURCE_LOOP_ACTIONS=Object.freeze(['idle','walk','run']);
const identitySlots=new Set(SOURCE_IDENTITY_SLOTS),canonical=v=>JSON.stringify(v,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const ajv=new Ajv({strict:true,ownProperties:true});ajv.addSchema(legacySchema);ajv.addSchema(recipeSchema);ajv.addSchema(sourceSchema);const checks=new Map();

/** Isolated source-format contracts; not installed as the live legacy adapter's validator. */
export function createFullState(catalog,{validatePlan=()=>{}}={}){
 function validateContract(value,name){
  if(JSON.stringify(value).length>2_000_000)throw Error('Companion data exceeds the 2 MB limit.');
  if(!Object.hasOwn(sourceSchema.definitions,name))throw Error('Unknown source contract.');
  if(!checks.has(name))checks.set(name,ajv.compile({$ref:'urn:lpc-companion:source-state:2#/definitions/'+name}));
  if(!checks.get(name)(value))throw Error('Unsupported or corrupt full-source '+name+'.');return structuredClone(value);
 }
 function recipeFor(value,outfitId){
  const outfit=value.outfits.find(o=>o.id===outfitId);if(!outfit)throw Error('Unknown source outfit.');
  const all={...value.identity.selections,...outfit.selections},order=outfit.selectionOrder;
  if(order.length!==Object.keys(all).length||order.some(slot=>!Object.hasOwn(all,slot))||new Set(order).size!==order.length)throw Error('Selection order must name every physical slot exactly once.');
  const recipe={schemaVersion:2,sourceCommit:value.sourceCommit,bodyType:value.identity.bodyType,...value.renderOptions,selections:Object.fromEntries(order.map(slot=>[slot,all[slot]]))},checked=catalog.validateRecipe(recipe);
  if(canonical(checked)!==canonical(recipe))throw Error('Stored source selections must contain canonical colors and explicit matching linked colors.');
  return checked;
 }
 function checkPlayback(definition,presentation){
  if(presentation.playback.mode==='loop'&&!SOURCE_LOOP_ACTIONS.includes(presentation.playback.actionId))throw Error('This source action is a finite cue or held pose, not a persistent activity.');
  const plan=catalog.plan(recipeFor(definition,presentation.outfitId),presentation.playback.actionId);
  if(presentation.playback.mode==='hold'&&(presentation.playback.frame>=plan.width/plan.layout.frameWidth))throw Error('The held frame is outside its source layout.');
  validatePlan(plan,presentation);
  return plan;
 }
 function validateMemory(definition){
  for(const [slot,colors]of Object.entries(definition.identity.colorMemory))for(const [channel,color]of Object.entries(colors)){
   const candidates=catalog.items().filter(i=>i.slot===slot);if(!candidates.some(i=>{try{return catalog.validateColor(i.id,channel,color)===color;}catch{return false;}}))throw Error('Unknown remembered source identity color.');
  }
  for(const [slot,s]of Object.entries(definition.identity.selections))for(const [channel,color]of Object.entries(s.colors))if(definition.identity.colorMemory[slot]?.[channel]!==color)throw Error('Identity color memory must agree with every current identity channel.');
 }
 function validateDefinition(value){
  const definition=validateContract(value,'characterDefinition'),ids=definition.outfits.map(o=>o.id);
  if(new Set(ids).size!==ids.length)throw Error('Source outfit IDs must be unique.');validateMemory(definition);
  for(const outfit of definition.outfits){recipeFor(definition,outfit.id);checkPlayback(definition,{...definition.startingPresentation,outfitId:outfit.id,playback:{mode:'hold',...outfit.rest}});}
  validatePresentation(definition,definition.startingPresentation,{});return definition;
 }
 function validatePresentation(definition,current,patch){
  if(Object.keys(patch).length)validateContract({schemaVersion:2,kind:'presentation-patch',patch},'presentationPatch');
  const next={...structuredClone(current),...structuredClone(patch)};
  if(patch.outfitId!==undefined&&patch.outfitId!==current.outfitId&&patch.playback===undefined){const outfit=definition.outfits.find(o=>o.id===patch.outfitId);if(!outfit)throw Error('Unknown source outfit.');next.playback={mode:'hold',...outfit.rest};}
  validateContract(next,'presentation');validateScene(next.scene);checkPlayback(definition,next);return next;
 }
 function assertStateInvariants(state){
  if(state.kind!=='chat-state')return state;
  const ids=new Set(state.snapshot.outfits.map(o=>o.id)),entries=new Set();let sequence=0;
  for(const entry of state.history){if(entries.has(entry.entryId)||entry.sequence<=sequence)throw Error('Source history must have unique increasing entries.');entries.add(entry.entryId);sequence=entry.sequence;if(entry.change.kind==='companion-replacement'){if(entry.change.definition.characterId!==state.snapshot.characterId)throw Error('History belongs to another character.');for(const o of entry.change.definition.outfits)ids.add(o.id);}}
  if(!ids.has(state.presentation.outfitId)||state.history.some(e=>e.change.patch?.outfitId!==undefined&&!ids.has(e.change.patch.outfitId)))throw Error('Unknown source history outfit.');return state;
 }
 const history=createHistoryEngine({validateContract,validateDefinition,validatePresentation,assertStateInvariants});
 function createDefinition(recipe,characterId,{restActionId,restFrame=0,facing='south'}={}){
  const checked=catalog.validateRecipe(recipe),identity=Object.fromEntries(Object.entries(checked.selections).filter(([s])=>identitySlots.has(s))),outfit=Object.fromEntries(Object.entries(checked.selections).filter(([s])=>!identitySlots.has(s)));
  return validateDefinition({schemaVersion:2,kind:'character-definition',characterId,revision:1,catalogVersion:'lpc-source-v1',sourceCommit:FULL_SOURCE_COMMIT,identity:{bodyType:checked.bodyType,selections:identity,colorMemory:Object.fromEntries(Object.entries(identity).map(([s,v])=>[s,structuredClone(v.colors)]))},renderOptions:{matchBodyColor:checked.matchBodyColor,applyMask:checked.applyMask},outfits:[{id:'imported',name:'Imported outfit',selections:outfit,selectionOrder:Object.keys(checked.selections),rest:{actionId:restActionId,frame:restFrame}}],startingPresentation:{outfitId:'imported',playback:{mode:'hold',actionId:restActionId,frame:restFrame},facing,scene:{backgroundId:'plain',x:0.5,y:1,scale:1}}});
 }
 function importDefinition(text,characterId,options){const imported=importFullGenerator(text,catalog),definition=createDefinition(imported.recipe,characterId,options);definition.importProvenance=imported.provenance;return {...imported,definition:validateDefinition(definition)};}
 return Object.freeze({validateContract,validateDefinition,validatePresentation,recipeFor(value,outfitId){validateContract(value,'characterDefinition');return recipeFor(value,outfitId);},createDefinition,importDefinition,...history});
}
