import { catalog } from './catalog.mjs';

export const MOOD_EXPRESSIONS = Object.freeze({
    none: Object.freeze({ label: 'Default expression', itemId: null, faceDir: null }),
    calm: Object.freeze({ label: 'Calm (neutral)', itemId: 'face_neutral', faceDir: 'neutral' }),
    cheerful: Object.freeze({ label: 'Cheerful (happy)', itemId: 'face_happy', faceDir: 'happy' }),
    blush: Object.freeze({ label: 'Blushing', itemId: 'face_blush', faceDir: 'blush' }),
    thoughtful: Object.freeze({ label: 'Thoughtful (look aside)', itemId: 'face_look_l', faceDir: 'look_l' }),
    concerned: Object.freeze({ label: 'Concerned (sad)', itemId: 'face_sad', faceDir: 'sad' }),
    angry: Object.freeze({ label: 'Angry', itemId: 'face_angry', faceDir: 'anger' }),
    shock: Object.freeze({ label: 'Shocked', itemId: 'face_shock', faceDir: 'shock' }),
    eyeroll: Object.freeze({ label: 'Rolling eyes', itemId: 'face_eyeroll', faceDir: 'eyeroll' }),
    shame: Object.freeze({ label: 'Ashamed', itemId: 'face_shame', faceDir: 'shame' }),
    closed: Object.freeze({ label: 'Eyes closed', itemId: 'face_closed', faceDir: 'closed' }),
    look_right: Object.freeze({ label: 'Glancing right', itemId: 'face_look_r', faceDir: 'look_r' }),
});

export const MOODS = Object.freeze(Object.keys(MOOD_EXPRESSIONS));
export const moodLabel = id => MOOD_EXPRESSIONS[id]?.label ?? id;

export const EXTRA_ANIMATION_LAYOUTS = Object.freeze({
    thrust: Object.freeze({ frameWidth: 64, frameHeight: 64, cycle: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]), directions: Object.freeze(['north', 'west', 'south', 'east']), frameMs: 120, physical: 'thrust' }),
    slash: Object.freeze({ frameWidth: 64, frameHeight: 64, cycle: Object.freeze([0, 1, 2, 3, 4, 5]), directions: Object.freeze(['north', 'west', 'south', 'east']), frameMs: 120, physical: 'slash' }),
    shoot: Object.freeze({ frameWidth: 64, frameHeight: 64, cycle: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), directions: Object.freeze(['north', 'west', 'south', 'east']), frameMs: 100, physical: 'shoot' }),
    combat_idle: Object.freeze({ frameWidth: 64, frameHeight: 64, cycle: Object.freeze([0, 0, 1]), directions: Object.freeze(['north', 'west', 'south', 'east']), frameMs: 360, physical: 'combat_idle' }),
    hurt: Object.freeze({ frameWidth: 64, frameHeight: 64, cycle: Object.freeze([0, 1, 2, 3, 4, 5]), directions: Object.freeze(['north', 'west', 'south', 'east']), frameMs: 200, physical: 'hurt', singleRowSource: true }),
});

export const CURATED_BANK_ANIMATIONS = Object.freeze(['thrust', 'slash', 'shoot', 'combat_idle', 'hurt']);

export const CURATED_BANK_ACTIVITY_FALLBACKS = Object.freeze({
    dozing: 'sit',
    sleeping: 'idle',
    looking_around: 'idle',
    guard_stance: 'idle',
    tending: 'idle',
    pacing: 'walk',
});

export const isCuratedBankAssetPath = path => (
    /\/(thrust|slash|shoot|combat_idle|hurt)\.png$/.test(path)
    || /^spritesheets\/head\/faces\/(male|female|elderly)\/(?!neutral\/)[a-z_]+\//.test(path)
);

export function createEnhancedCuratedCatalog(baseCatalog = catalog) {
    const data = structuredClone(baseCatalog);
    Object.assign(data.animations, EXTRA_ANIMATION_LAYOUTS, {
        hurt: { ...EXTRA_ANIMATION_LAYOUTS.hurt, directions: ['south'] },
    });
    for (const [itemId, item] of Object.entries(data.items)) {
        if (!Object.hasOwn(item.unavailableAnimations ?? {}, 'emote') && item.layers.every(l => l.paths.emote)) {
            for (const layer of item.layers) {
                for (const anim of ['thrust', 'slash', 'shoot', 'combat_idle']) {
                    layer.paths[anim] = layer.paths.emote.replace(/\/emote\.png$/, `/${anim}.png`);
                }
                if (!itemId.startsWith('face_')) {
                    layer.paths.hurt = layer.paths.emote.replace(/\/emote\.png$/, '/hurt.png');
                }
            }
        }
    }
    for (const [moodId, info] of Object.entries(MOOD_EXPRESSIONS)) {
        if (!info.faceDir || info.faceDir === 'neutral') continue;
        for (const [suffix, baseId] of [['', 'face_neutral'], ['_female', 'face_neutral_female'], ['_elder', 'face_neutral_elder']]) {
            const itemId = `face_${moodId}${suffix}`;
            const cloned = structuredClone(data.items[baseId]);
            cloned.name = `${info.label} face`;
            cloned.optionalBankEnhancement = true;
            cloned.counterparts = suffix === '_elder' ? {} : { male: `face_${moodId}`, female: `face_${moodId}_female` };
            for (const layer of cloned.layers) {
                for (const [anim, p] of Object.entries(layer.paths)) {
                    layer.paths[anim] = p.replace('/neutral/', `/${info.faceDir}/`);
                }
            }
            data.items[itemId] = cloned;
            data.slots.expression.push(itemId);
        }
    }
    return data;
}

export const enhancedCuratedCatalog = createEnhancedCuratedCatalog(catalog);

export function curatedMoodSelections(selections, moodId, targetCatalog = enhancedCuratedCatalog) {
    if (!moodId || moodId === 'none' || !MOOD_EXPRESSIONS[moodId]?.faceDir) return selections;
    const headId = selections?.head?.itemId;
    const suffix = headId === 'heads_human_female'
        ? '_female'
        : (headId === 'heads_human_male_elderly' || headId === 'heads_human_female_elderly')
            ? '_elder'
            : headId === 'heads_human_male'
                ? ''
                : null;
    if (suffix === null) return selections;
    const itemId = moodId === 'calm' ? `face_neutral${suffix}` : `face_${moodId}${suffix}`;
    if (!targetCatalog.items[itemId]) return selections;
    const paletteId = selections.expression?.paletteId ?? selections.head?.paletteId ?? selections.body?.paletteId ?? 'body.ulpc.light';
    return { ...selections, expression: { itemId, paletteId } };
}

export function isBankBackedMood(moodId) {
    const faceDir = MOOD_EXPRESSIONS[moodId]?.faceDir;
    return Boolean(faceDir && faceDir !== 'neutral');
}

export function curatedBankEnhancementNote(definition) {
    const start = definition?.startingPresentation;
    if (!start) return null;
    const hasBankMood = isBankBackedMood(start.moodId);
    const hasBankActivity = Object.hasOwn(CURATED_BANK_ACTIVITY_FALLBACKS, start.activityId);
    if (!hasBankMood && !hasBankActivity) return null;
    const fallbackAnimation = hasBankActivity
        ? CURATED_BANK_ACTIVITY_FALLBACKS[start.activityId]
        : (start.activityId && start.activityId !== 'none' ? start.activityId : start.posture);
    return {
        embeddedInCuratedPackage: false,
        fallback: {
            expression: definition.identity?.expression ? 'neutral' : 'none',
            animation: fallbackAnimation,
        },
        ...(hasBankMood ? { moodId: start.moodId } : {}),
        ...(hasBankActivity ? { activityId: start.activityId } : {}),
    };
}
