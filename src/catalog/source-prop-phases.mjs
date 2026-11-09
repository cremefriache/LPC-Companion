import policy from '../../vendor/lpc/full-catalog/prop-phases.json' with {type:'json'};
import {createSourcePhaseRegistry} from './source-phase-registry.mjs';
const registry=createSourcePhaseRegistry(policy,{version:10,message:'This authored prop passes edge-on or behind the body in this pose.'});
export const reviewedPropPhase=registry.reviewed,propPhaseVersion=registry.version;
