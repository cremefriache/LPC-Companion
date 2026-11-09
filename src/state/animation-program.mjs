import { catalog, capabilities, selectionsFor } from '../catalog/catalog.mjs';

// Explicit behavior allowlists: a source sheet is not automatically a looping activity.
export const ACTIVITIES=Object.freeze({
    none:{name:'Use resting posture',animationId:null},
    walk:{name:'Walking',animationId:'walk'},run:{name:'Running',animationId:'run'},
    sit_low:{name:'Sit low',animationId:'sit',cycle:[0],classification:'holdable-pose'},
    sit_upright:{name:'Sit upright',animationId:'sit',cycle:[1],classification:'holdable-pose'},
    sit_relaxed:{name:'Sit relaxed',animationId:'sit',cycle:[2],classification:'holdable-pose',extra:true},
    dozing:{name:'Dozing (seated)',animationId:'sit',cycle:[0],effect:'dozing',extra:true},
    sleeping:{name:'Sleeping (lying down)',animationId:'emote',physicalAnimationId:'hurt',cycle:[5],effect:'sleeping',extra:true},
    hands_on_hips:{name:'Hands on hips',animationId:'emote',cycle:[1],classification:'holdable-pose',extra:true},
    looking_around:{name:'Keeping watch',animationId:'emote',physicalAnimationId:'idle',cycle:[0],effect:'looking_around',extra:true},
    guard_stance:{name:'Alert / guard stance',animationId:'emote',physicalAnimationId:'combat_idle',cycle:[0,0,1],frameMs:360,effect:'guard_stance',extra:true},
    tending:{name:'Tending / crafting',animationId:'emote',physicalAnimationId:'thrust',cycle:[0,1,4,4,5,4,1],frameMs:280,effect:'tending',extra:true},
    pacing:{name:'Pacing',animationId:'emote',physicalAnimationId:'walk',cycle:[1,2,3,4,5,6,7,8],frameMs:155,effect:'pacing',extra:true},
});
export const EXTRA_ANIMATION_LAYOUTS=Object.freeze({
    thrust:{frameWidth:64,frameHeight:64,cycle:[0,1,2,3,4,5,6,7],directions:['north','west','south','east'],frameMs:120,physical:'thrust'},
    slash:{frameWidth:64,frameHeight:64,cycle:[0,1,2,3,4,5],directions:['north','west','south','east'],frameMs:120,physical:'slash'},
    shoot:{frameWidth:64,frameHeight:64,cycle:[0,1,2,3,4,5,6,7,8,9,10,11,12],directions:['north','west','south','east'],frameMs:100,physical:'shoot'},
    combat_idle:{frameWidth:64,frameHeight:64,cycle:[0,0,1],directions:['north','west','south','east'],frameMs:360,physical:'combat_idle'},
    hurt:{frameWidth:64,frameHeight:64,cycle:[0,1,2,3,4,5],directions:['north','west','south','east'],frameMs:200,physical:'hurt',singleRowSource:true},
});
export const ACTION_PROGRAMS=Object.freeze({
    jump:{name:'Jump',animationId:'jump'},spellcast:{name:'Cast gesture',animationId:'spellcast'},
    arms_raise:{name:'Expressive gesture',animationId:'emote',cycle:[0,1,2,1,0],frameMs:160},
    watering:{name:'Watering',animationId:'thrust',cycle:[0,1,4,4,4,4,5],frameMs:140,capability:'emote'},
    thrust:{name:'Thrust',animationId:'thrust',capability:'emote'},
    slash:{name:'Slash',animationId:'slash',capability:'emote'},
    shoot:{name:'Shoot',animationId:'shoot',capability:'emote'},
    nod:{name:'Nod ("Yes")',animationId:'idle',cycle:[0,1,2,3,4,5,6,7],frameMs:105,capability:'emote',motion:'nod'},
    laugh:{name:'Laugh / chuckle',animationId:'idle',cycle:[0,1,2,3,4,5,6,7],frameMs:120,capability:'emote',motion:'laugh'},
    sigh:{name:'Deep sigh',animationId:'idle',cycle:[0,1,2,3,4,5,6,7,8],frameMs:140,capability:'emote',motion:'sigh'},
    bounce:{name:'Happy hop',animationId:'idle',cycle:[0,1,2,3,4,5,6,7],frameMs:110,capability:'emote',motion:'bounce'},
    startle:{name:'Startle / jolt',animationId:'idle',cycle:[0,1,2,3,4,5,6],frameMs:110,capability:'emote',motion:'startle'},
    shiver:{name:'Shiver / fluster',animationId:'idle',cycle:[0,1,2,3,4,5,6,7],frameMs:115,capability:'emote',motion:'shiver'},
    shrug:{name:'Shrug',animationId:'idle',cycle:[0,1,2,3,4,5,6,7],frameMs:125,capability:'emote',motion:'shrug'},
    polite_bow:{name:'Polite bow',animationId:'idle',cycle:[0,1,2,3,4,5,6,7],frameMs:135,capability:'emote',motion:'polite_bow'},
});
export const SEQUENCE_ACTIONS=Object.freeze(Object.keys(ACTION_PROGRAMS));
export const actionName=id=>ACTION_PROGRAMS[id]?.name??id;
export const SEQUENCE_SCHEMA={type:'array',minItems:1,maxItems:4,items:{type:'object',additionalProperties:false,required:['actionId'],properties:{actionId:{enum:SEQUENCE_ACTIONS}}}};
export function activityAnimation(presentation){const activity=ACTIVITIES[presentation.activityId??'none'];if(!activity)throw Error('Unavailable activity. Choose a listed activity.');return activity.animationId??presentation.posture;}
export function activityName(presentation){return presentation.activityId&&presentation.activityId!=='none'?ACTIVITIES[presentation.activityId]?.name:presentation.posture==='walk'?'Walking':'Resting';}
export function supportedActions(selections){const supported=capabilities(selections);return SEQUENCE_ACTIONS.filter(id=>supported.includes(ACTION_PROGRAMS[id].capability??ACTION_PROGRAMS[id].animationId));}
export function validateActivity(definition,presentation){const animation=activityAnimation(presentation);if(!capabilities(selectionsFor(definition,presentation.outfitId)).includes(animation))throw Error('This outfit cannot perform that activity. Stop the activity or choose a compatible outfit.');if(!catalog.animations[animation].directions.includes(presentation.facing))throw Error('This activity does not support the selected facing.');return animation;}
export function validateSequence(sequence,definition,presentation){
    if(!Array.isArray(sequence)||sequence.length<1||sequence.length>4)throw Error('An action sequence needs 1–4 steps.');
    const supported=supportedActions(selectionsFor(definition,presentation.outfitId));let duration=0;
    const steps=sequence.map(step=>{if(!step||typeof step!=='object'||Array.isArray(step)||Object.keys(step).length!==1||!Object.hasOwn(step,'actionId')||!supported.includes(step.actionId))throw Error('Every sequence step must use a listed action supported by the complete outfit.');const behavior=ACTION_PROGRAMS[step.actionId],layout=catalog.animations[behavior.animationId]??EXTRA_ANIMATION_LAYOUTS[behavior.animationId];if(!layout.directions.includes(presentation.facing))throw Error('A sequence step does not support the selected facing.');const durationMs=(behavior.cycle??layout.cycle).length*(behavior.frameMs??layout.frameMs);duration+=durationMs;return {actionId:step.actionId,durationMs};});
    if(duration>20000)throw Error('An action sequence may last at most 20 seconds of active playback.');return steps;
}
