import policy from '../../vendor/lpc/full-catalog/pose-phases.json' with {type:'json'};
import {createSourcePhaseRegistry} from './source-phase-registry.mjs';
const registry=createSourcePhaseRegistry(policy,{version:6});
export const reviewedPosePhase=registry.reviewed,posePhaseVersion=registry.version;
