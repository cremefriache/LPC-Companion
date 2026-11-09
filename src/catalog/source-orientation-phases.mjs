import policy from '../../vendor/lpc/full-catalog/orientation-phases.json' with {type:'json'};
import {phaseLayers,phaseLayout} from './source-phase-signatures.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),key=(action,layout)=>action+'\n'+JSON.stringify(layout),rows=new Map(),byItem=new Map(),parents=new Map();
if(policy.schemaVersion!==2||policy.sourceCommit!=='86160e7507d6841259cff624a51a63c1d4847ee3')throw Error('Unreviewed source orientation policy.');
const layerSignatures=policy.layerSets.map(layers=>JSON.stringify(layers));
for(const raw of policy.rows){const row={...raw,layout:policy.layouts[raw.layout]};const id=row.itemId+'\n'+row.action,list=rows.get(id)??[];list.push({...row,bindingKey:key(row.action,row.layout),signature:layerSignatures[row.layers]});rows.set(id,list);const items=byItem.get(row.itemId)??[];items.push(list.at(-1));byItem.set(row.itemId,items);}
for(const [id,entry]of Object.entries(policy.parents)){const bindings=new Map();for(const raw of entry.bindings){const b={...raw,layout:policy.layouts[raw.layout]};const k=key(b.action,b.layout),list=bindings.get(k)??[];list.push({...b,signature:layerSignatures[b.layers]});bindings.set(k,list);}parents.set(id,{slot:entry.slot,bindings});}
function selectedParent(recipe,id,k){const entry=parents.get(id);return entry&&recipe.selections[entry.slot]?.itemId===id&&entry.bindings.get(k)?.some(b=>b.bodies.includes(recipe.bodyType));}
function knownParent(plan,id,k){const entry=parents.get(id);if(!selectedParent(plan.recipe,id,k))return false;const signature=JSON.stringify(phaseLayers(plan,id));return entry.bindings.get(k).some(b=>b.bodies.includes(plan.recipe.bodyType)&&b.signature===signature);}
const rigIds=recipe=>[recipe.selections.body?.itemId,recipe.selections.head?.itemId];
/** Only explicitly reviewed original view omissions; actual parent alpha is checked by availability. */
export function reviewedOrientationPhase(plan,itemId){
 const candidates=rows.get(itemId+'\n'+plan.action);if(!candidates)return null;const ids=rigIds(plan.recipe),layout=phaseLayout(plan),signature=JSON.stringify(phaseLayers(plan,itemId));
 for(const row of candidates)if(row.bodies.includes(plan.recipe.bodyType)&&plan.recipe.selections[row.slot]?.itemId===itemId&&same(layout,row.layout)&&signature===row.signature&&ids.every(id=>id&&knownParent(plan,id,row.bindingKey)))return {kind:'orientation',parents:ids,blankCells:row.blankCells,message:'This item is hidden from view by the selected authored pose.'};
 return null;
}
export function orientationPhaseVersion(recipe){
 for(const selection of Object.values(recipe.selections))for(const row of byItem.get(selection.itemId)??[])if(row.bodies.includes(recipe.bodyType)&&rigIds(recipe).every(id=>id&&selectedParent(recipe,id,row.bindingKey)))return 8;
 return 0;
}
