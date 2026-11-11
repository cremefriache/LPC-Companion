import {getSourceCertificate} from './source-certificates.mjs';
import {createSourcePhaseRegistry} from './source-phase-registry.mjs';
let cachedPolicy=null,registry=null;
function getRegistry(){
 const policy=getSourceCertificate('pose-phases.json');
 if(policy!==cachedPolicy){registry=createSourcePhaseRegistry(policy,{version:6});cachedPolicy=policy;}
 return registry;
}
export function reviewedPosePhase(plan,itemId){return getRegistry().reviewed(plan,itemId);}
export function posePhaseVersion(recipe){return getRegistry().version(recipe);}
