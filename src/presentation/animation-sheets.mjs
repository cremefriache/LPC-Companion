import { ACTIVITIES, ACTION_PROGRAMS, activityAnimation, validateSequence } from '../state/animation-program.mjs';
import { selectionsFor } from '../catalog/catalog.mjs';

// Compose the complete physical sheet before selecting a presentation cycle/held column.
export async function composeActivity(composer,selections,presentation){
    const behavior=ACTIVITIES[presentation.activityId??'none'];
    if((behavior?.effect||behavior?.physicalAnimationId)&&composer.composeActivityEffect){
        return composer.composeActivityEffect(selections,behavior,presentation?.moodId);
    }
    const sheet=await composer.compose(selections,activityAnimation(presentation),presentation?.moodId);
    return behavior?.cycle?{...sheet,layout:{...sheet.layout,cycle:[...behavior.cycle],...(behavior.frameMs?{frameMs:behavior.frameMs}:{})}}:sheet;
}
export async function composeSequence(composer,sequence,definition,presentation){
    const steps=validateSequence(sequence,definition,presentation),selections=selectionsFor(definition,presentation.outfitId);
    return Promise.all(steps.map(async step=>{const behavior=ACTION_PROGRAMS[step.actionId],sheet=behavior.motion&&composer.composeMotionAction?await composer.composeMotionAction(selections,behavior,presentation?.moodId):await composer.compose(selections,behavior.animationId,presentation?.moodId);return {...step,sheet:{...sheet,layout:{...sheet.layout,cycle:behavior.cycle??sheet.layout.cycle,frameMs:behavior.frameMs??sheet.layout.frameMs}}};}));
}
