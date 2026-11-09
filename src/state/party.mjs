/** Named visual spaces, independent of each companion's detailed stage. */
export const PARTY_SCENES = [
    ['together','Together','plain'],
    ['woodland','Woodland clearing','woodland'],
    ['hearth','Hearth room','hearth'],
    ['courtyard','Stone courtyard','courtyard'],
];
export const PARTY_SCENE_SCHEMA={enum:PARTY_SCENES.map(([id])=>id)};
export function partyScene(id='together') {
    const scene=PARTY_SCENES.find(([key])=>key===id);
    if(!scene)throw Error('Choose a listed party scene.');
    return {backgroundId:scene[2],x:0.5,y:1,scale:1,lightId:'day'};
}
