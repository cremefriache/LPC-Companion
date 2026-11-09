import policy from '../../vendor/lpc/full-catalog/hurt-phases.json' with {type:'json'};
import {phaseLayout} from './source-phase-signatures.mjs';
const transformItems=new Set(policy.transforms.map(row=>row.itemId));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fullFrame=[{sx:0,sy:0,sw:384,sh:64,dx:0,dy:0,dw:384,dh:64}],transforms=new Map(policy.transforms.map(row=>[row.itemId+'\n'+row.path+'\n'+row.sha256,row]));
if(policy.schemaVersion!==1||policy.sourceCommit!=='86160e7507d6841259cff624a51a63c1d4847ee3')throw Error('Unreviewed Hurt source policy.');
function selected(recipe,id,entry){return entry&&entry.bodies.includes(recipe.bodyType)&&recipe.selections[entry.slot]?.itemId===id;}
function known(plan,id,entry){
 if(!selected(plan.recipe,id,entry))return false;const layers=plan.layers.filter(l=>l.itemId===id);if(!same(layers.map(l=>l.layer),entry.layerNumbers[plan.recipe.bodyType]))return false;
 return layers.every(l=>{const row=entry.paths[l.path];return row&&row.sha256===l.sha256&&row.layer===l.layer&&row.z===l.z&&!l.isMask&&row.sourceWidth===l.sourceWidth&&row.sourceHeight===l.sourceHeight&&same(l.frames,fullFrame)&&(row.sourceTransformId??null)===(l.sourceTransformId??null);});
}
function parentIds(recipe){return [recipe.selections.body?.itemId,recipe.selections.head?.itemId];}
function rigSelected(recipe){return parentIds(recipe).every(id=>id&&selected(recipe,id,policy.parents[id]));}
function rig(plan){return plan.action==='hurt'&&same(phaseLayout(plan),policy.layout)&&parentIds(plan.recipe).every(id=>id&&known(plan,id,policy.parents[id]));}
function dependencies(recipe,entry,plan=null){return entry.requiredParents.every(group=>group.choices.some(choice=>recipe.selections[choice.slot]?.itemId===choice.itemId&&selected(recipe,choice.itemId,policy.parents[choice.itemId])&&(!plan||known(plan,choice.itemId,policy.parents[choice.itemId]))));}
export function attachHurtSourcePreparation(plan){
 if(!rig(plan))return;
 for(const layer of plan.layers){const row=transforms.get(layer.itemId+'\n'+layer.path+'\n'+layer.sha256);if(row&&layer.sourceWidth===row.sourceWidth&&layer.sourceHeight===row.sourceHeight&&same(layer.frames,fullFrame)&&!layer.isMask){layer.sourceTransformId=row.id;plan.warnings.push({code:'reviewed_standing_source',itemId:layer.itemId,message:'Missing standing frames use matching existing artwork.'});}}
}
export function reviewedHurtPhase(plan,itemId){
 const entry=policy.items[itemId];if(!entry||!rig(plan)||!known(plan,itemId,entry)||!dependencies(plan.recipe,entry,plan))return null;
 const layers=plan.layers.filter(l=>l.itemId===itemId),columns=[0,1,2,3,4,5].filter(col=>layers.every(l=>entry.paths[l.path].blankColumns.includes(col)));if(!columns.length)return null;
 const parents=parentIds(plan.recipe);return {kind:'hurt',itemId,baseId:parents[0],parents,blankCells:columns.map(c=>['authored',c]),message:'Some parts are hidden by the character’s Hurt pose.'};
}
export function hurtPreparationItems(recipe){return rigSelected(recipe)?Object.values(recipe.selections).filter(s=>transformItems.has(s.itemId)).map(s=>s.itemId):[];}
export function hurtPhaseVersion(recipe){
 if(!rigSelected(recipe))return 0;
 if(Object.values(recipe.selections).some(s=>transformItems.has(s.itemId)))return 5;
 return Object.values(recipe.selections).some(s=>{const entry=policy.items[s.itemId];return selected(recipe,s.itemId,entry)&&dependencies(recipe,entry);})?5:0;
}
