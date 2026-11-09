import { validateContract } from './validate.mjs';
import { validateSequence } from './animation-program.mjs';
export { SEQUENCE_ACTIONS as BRIEF_ACTIONS } from './animation-program.mjs';
export function validateActionCue(value,definition,presentation){
    const cue=validateContract(value,'actionCue');
    const [step]=validateSequence([{actionId:cue.actionId}],definition,presentation);
    if(cue.durationMs<step.durationMs)throw Error('Action duration must include a full cycle.');
    return cue;
}
