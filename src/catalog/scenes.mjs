import scenes from '../../assets/lpc/scenes.json' with { type: 'json' };
export { scenes };
export const BACKGROUNDS = [
    ['plain', 'Plain stage'],
    ...Object.entries(scenes.backgrounds).map(([id, item]) => [id, item.name])
];
export const LIGHTS = [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']];
export const SCENE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['backgroundId', 'x', 'y', 'scale'],
    properties: {
        backgroundId: { enum: BACKGROUNDS.map(([id]) => id) },
        x: { type: 'number', minimum: 0, maximum: 1 },
        y: { type: 'number', minimum: 0, maximum: 1 },
        scale: { type: 'number', minimum: 0.5, maximum: 1.25 },
        lightId: { enum: LIGHTS.map(([id]) => id) }
    }
};
export const MODEL_SCENE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['backgroundId'],
    properties: {
        backgroundId: { enum: BACKGROUNDS.map(([id]) => id) },
        lightId: { enum: LIGHTS.map(([id]) => id) },
        x: { type: 'number', minimum: 0, maximum: 1 },
        y: { type: 'number', minimum: 0, maximum: 1 },
        scale: { type: 'number', minimum: 0.5, maximum: 1.25 }
    }
};
export const SCENE_PRESETS = {
    clearing: {
        name: 'A quiet clearing',
        scene: { backgroundId: 'woodland', x: 0.5, y: 1, scale: 1, lightId: 'day' }
    },
    fireside: {
        name: 'By the hearth',
        scene: { backgroundId: 'hearth', x: 0.25, y: 1, scale: 0.85, lightId: 'dusk' }
    },
    arrival: {
        name: 'Courtyard arrival',
        scene: { backgroundId: 'courtyard', x: 0.65, y: 0.8, scale: 0.75, lightId: 'day' }
    },
};

/** Named visual spaces, independent of each companion's detailed stage. */
export const PARTY_SCENES = [
    ['together', 'Together', 'plain'],
    ['woodland', 'Woodland clearing', 'woodland'],
    ['hearth', 'Hearth room', 'hearth'],
    ['courtyard', 'Stone courtyard', 'courtyard'],
];
export const PARTY_SCENE_SCHEMA = { enum: PARTY_SCENES.map(([id]) => id) };
export function partyScene(id = 'together') {
    const scene = PARTY_SCENES.find(([key]) => key === id);
    if (!scene) throw Error('Choose a listed party scene.');
    return { backgroundId: scene[2], x: 0.5, y: 1, scale: 1, lightId: 'day' };
}

export function validateScene(scene) {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene) || Object.keys(scene).some(key => !['backgroundId',
        'x', 'y', 'scale', 'lightId'].includes(key)) || !BACKGROUNDS.some(([id]) => id === scene.backgroundId)
        || !LIGHTS.some(([id]) => id === (scene.lightId === undefined ? 'day' : scene.lightId)) || !['x', 'y', 'scale']
        .every(key => Number.isFinite(scene[key])) || scene.x < 0 || scene.x > 1 || scene.y < 0 || scene.y > 1
        || scene.scale < 0.5 || scene.scale > 1.25)
        throw Error('Unavailable scene. Choose a listed background, day/dusk/night light, placement 0–1 and scale 0.5–1.25. The last accepted stage is retained.');
    return scene;
}
export function sceneCredit(definition) {
    const item = scenes.backgrounds[definition.startingPresentation.scene.backgroundId];
    return item ? {
        version: scenes.version,
        backgroundId: definition.startingPresentation.scene.backgroundId,
        ...structuredClone(item.credits),
        licenseText: scenes.licenseText
    } : null;
}

export function partySceneCredit(definition) {
    const id = partyScene(definition.startingPresentation.partySceneId).backgroundId,
        item = scenes.backgrounds[id];
    return item ? {
        version: scenes.version,
        backgroundId: id,
        ...structuredClone(item.credits),
        licenseText: scenes.licenseText
    } : null;
}
