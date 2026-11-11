import {getSourceCertificate} from './source-certificates.mjs';
import {createSourcePhaseRegistry} from './source-phase-registry.mjs';
let cachedPolicy=null,registry=null;
function getRegistry(){
 const policy=getSourceCertificate('prop-phases.json');
 if(policy!==cachedPolicy){registry=createSourcePhaseRegistry(policy,{version:10,message:'This authored prop passes edge-on or behind the body in this pose.'});cachedPolicy=policy;}
 return registry;
}
export function reviewedPropPhase(plan,itemId){return getRegistry().reviewed(plan,itemId);}
export function propPhaseVersion(recipe){return getRegistry().version(recipe);}
