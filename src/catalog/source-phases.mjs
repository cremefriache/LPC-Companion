import {reviewedPropPhase,propPhaseVersion} from './source-prop-phases.mjs';
import {reviewedOrientationPhase,orientationPhaseVersion} from './source-orientation-phases.mjs';
import {reviewedPosePhase,posePhaseVersion} from './source-pose-phases.mjs';
import {reviewedHurtPhase,hurtPhaseVersion} from './source-hurt-phases.mjs';
import {phaseLayers,phaseLayout} from './source-phase-signatures.mjs';
export {phaseLayers,phaseLayout} from './source-phase-signatures.mjs';
import policy from '../../vendor/lpc/full-catalog/shield-phases.json' with {type:'json'};
const key=(item,action)=>item+'\n'+action,byPose=new Map();
if(policy.schemaVersion!==1||policy.sourceCommit!=='86160e7507d6841259cff624a51a63c1d4847ee3')throw Error('Unreviewed source-phase policy.');
for(const row of policy.rows){const k=key(row.itemId,row.action),rows=byPose.get(k)??[];rows.push(row);byPose.set(k,rows);}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function assembly(recipe,row){return row.bodies.includes(recipe.bodyType)&&recipe.selections.shield?.itemId===row.baseId&&(!recipe.selections.shield_paint||recipe.selections.shield_paint.itemId===row.surfaceId);}
/** Exact source/geometry certificate. Actual visible-parent evidence is checked by availability. */
export function reviewedSourcePhase(plan,itemId){
 const prop=reviewedPropPhase(plan,itemId);if(prop)return prop;
 const orientation=reviewedOrientationPhase(plan,itemId),pose=reviewedPosePhase(plan,itemId);if(orientation)return {...orientation,...(pose?{message:pose.message+' '+orientation.message}:{}),blankCells:[...new Map([...orientation.blankCells,...(pose?.blankCells??[])].map(cell=>[JSON.stringify(cell),cell])).values()],parents:[...new Set([...orientation.parents,...(pose?.parents??[])])]};if(pose)return pose;
 if(plan.action==='hurt'){const hurt=reviewedHurtPhase(plan,itemId);if(hurt)return hurt;}
 for(const row of byPose.get(key(itemId,plan.action))??[])if(assembly(plan.recipe,row)&&same(phaseLayout(plan),row.layout)&&same(phaseLayers(plan,itemId),row.targetLayers)&&same(phaseLayers(plan,row.baseId),row.parentLayers))return row;
 return null;
}
export function sourcePhaseVersion(recipe){return Math.max(propPhaseVersion(recipe),orientationPhaseVersion(recipe),posePhaseVersion(recipe),hurtPhaseVersion(recipe),policy.rows.some(row=>recipe.selections[row.slot]?.itemId===row.itemId&&assembly(recipe,row))?4:0);}
