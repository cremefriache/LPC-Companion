const STORAGE_PREFIX = 'lpc-companion:repertoire:v1:';

export const REPERTOIRE_POSES = Object.freeze([
    ['walk', 'Walking'],
    ['run', 'Running'],
    ['pacing', 'Pacing'],
    ['sit_low', 'Sitting (low)'],
    ['sit_upright', 'Sitting (upright)'],
    ['sit_relaxed', 'Sitting (relaxed)'],
    ['dozing', 'Dozing / nodding off'],
    ['sleeping', 'Sleeping (Zzz)'],
    ['hands_on_hips', 'Hands on hips'],
    ['looking_around', 'Keeping watch'],
    ['guard_stance', 'Alert / guard stance'],
    ['tending', 'Tending / crafting'],
]);

export const REPERTOIRE_EXPRESSIONS = Object.freeze([
    ['calm', 'Calm'],
    ['cheerful', 'Cheerful'],
    ['blush', 'Blushing'],
    ['thoughtful', 'Thoughtful'],
    ['concerned', 'Concerned'],
    ['angry', 'Angry'],
    ['shock', 'Shocked'],
    ['eyeroll', 'Eye roll'],
    ['shame', 'Ashamed'],
    ['closed', 'Eyes closed'],
    ['look_right', 'Side glance'],
]);

export const REPERTOIRE_ACTIONS = Object.freeze([
    ['nod', 'Nod (Yes)', 'everyday'],
    ['laugh', 'Laugh', 'everyday'],
    ['sigh', 'Deep sigh', 'everyday'],
    ['bounce', 'Happy bounce', 'everyday'],
    ['startle', 'Startle', 'everyday'],
    ['shiver', 'Shiver', 'everyday'],
    ['shrug', 'Shrug', 'everyday'],
    ['polite_bow', 'Polite bow', 'everyday'],
    ['arms_raise', 'Expressive gesture', 'everyday'],
    ['jump', 'Jump', 'everyday'],
    ['spellcast', 'Cast gesture', 'everyday'],
    ['watering', 'Watering', 'combat'],
    ['thrust', 'Thrust (Spear / Sword)', 'combat'],
    ['slash', 'Slash (Blade / Wand)', 'combat'],
    ['shoot', 'Shoot (Bow)', 'combat'],
    ['hurt', 'Hurt / Collapse', 'combat'],
]);

export const ALL_POSE_IDS = Object.freeze(REPERTOIRE_POSES.map(([id]) => id));
export const ALL_EXPRESSION_IDS = Object.freeze(REPERTOIRE_EXPRESSIONS.map(([id]) => id));
export const ALL_ACTION_IDS = Object.freeze(REPERTOIRE_ACTIONS.map(([id]) => id));
export const EVERYDAY_ACTION_IDS = Object.freeze(
    REPERTOIRE_ACTIONS.filter(([, , cat]) => cat === 'everyday').map(([id]) => id),
);
export const COMBAT_ACTION_IDS = Object.freeze(
    REPERTOIRE_ACTIONS.filter(([, , cat]) => cat === 'combat').map(([id]) => id),
);

const memoryStore = new Map();
const listeners = new Set();

export function outfitHasCombatOrToolGear(definition, outfitId) {
    if (!definition?.outfits?.length) return false;
    const target = outfitId
        ? [definition.outfits.find(o => o.id === outfitId)].filter(Boolean)
        : definition.outfits;
    for (const outfit of target) {
        const sel = outfit?.selections ?? {};
        if (sel.weapon || sel.weapon_magic_crystal || sel.ammo || sel.quiver || sel.shield) {
            return true;
        }
    }
    return false;
}

export function defaultRepertoireFor(definition, outfitId) {
    const hasGear = outfitHasCombatOrToolGear(definition, outfitId);
    return {
        mode: 'auto',
        poses: [...ALL_POSE_IDS],
        expressions: [...ALL_EXPRESSION_IDS],
        actions: hasGear ? [...ALL_ACTION_IDS] : [...EVERYDAY_ACTION_IDS],
    };
}

export function presetRepertoire(presetName, definition, outfitId) {
    if (presetName === 'all') {
        return {
            mode: 'custom',
            poses: [...ALL_POSE_IDS],
            expressions: [...ALL_EXPRESSION_IDS],
            actions: [...ALL_ACTION_IDS],
        };
    }
    if (presetName === 'minimal') {
        return {
            mode: 'custom',
            poses: ['walk', 'sit_relaxed', 'sleeping', 'hands_on_hips', 'looking_around'],
            expressions: ['calm', 'cheerful', 'blush', 'thoughtful', 'concerned', 'angry'],
            actions: ['nod', 'laugh', 'sigh', 'shrug', 'jump', 'spellcast'],
        };
    }
    if (presetName === 'roleplay') {
        return {
            mode: 'custom',
            poses: [...ALL_POSE_IDS],
            expressions: [...ALL_EXPRESSION_IDS],
            actions: [...EVERYDAY_ACTION_IDS],
        };
    }
    return defaultRepertoireFor(definition, outfitId);
}

function sanitizeRepertoire(raw, definition, outfitId) {
    if (!raw || typeof raw !== 'object') return defaultRepertoireFor(definition, outfitId);
    if (raw.mode === 'auto') return defaultRepertoireFor(definition, outfitId);
    const poses = Array.isArray(raw.poses)
        ? raw.poses.filter(id => ALL_POSE_IDS.includes(id))
        : [...ALL_POSE_IDS];
    const expressions = Array.isArray(raw.expressions)
        ? raw.expressions.filter(id => ALL_EXPRESSION_IDS.includes(id))
        : [...ALL_EXPRESSION_IDS];
    const actions = Array.isArray(raw.actions)
        ? raw.actions.filter(id => ALL_ACTION_IDS.includes(id))
        : defaultRepertoireFor(definition, outfitId).actions;
    return {
        mode: 'custom',
        poses,
        expressions,
        actions,
    };
}

function storageKey(characterId) {
    return `${STORAGE_PREFIX}${characterId || 'default'}`;
}

export function readRepertoire(definition, outfitId, storage = globalThis.window?.localStorage) {
    const characterId = definition?.characterId ?? 'default';
    const key = storageKey(characterId);
    try {
        const raw = storage?.getItem?.(key) ?? memoryStore.get(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            return sanitizeRepertoire(parsed, definition, outfitId);
        }
    } catch { /* fall through to default */ }
    return defaultRepertoireFor(definition, outfitId);
}

export function writeRepertoire(characterId, value, storage = globalThis.window?.localStorage) {
    const key = storageKey(characterId);
    if (!value || value.mode === 'auto') {
        memoryStore.delete(key);
        try { storage?.removeItem?.(key); } catch {}
    } else {
        const payload = JSON.stringify({
            schemaVersion: 1,
            mode: 'custom',
            poses: [...new Set(value.poses ?? [])].filter(id => ALL_POSE_IDS.includes(id)),
            expressions: [...new Set(value.expressions ?? [])].filter(id => ALL_EXPRESSION_IDS.includes(id)),
            actions: [...new Set(value.actions ?? [])].filter(id => ALL_ACTION_IDS.includes(id)),
        });
        memoryStore.set(key, payload);
        try { storage?.setItem?.(key, payload); } catch {}
    }
    for (const listener of [...listeners]) {
        try { listener(characterId); } catch {}
    }
}

export function subscribeRepertoire(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function isActionEnabledInRepertoire(actionId, repertoire) {
    if (!repertoire?.actions) return true;
    if (actionId === 'emote') {
        return repertoire.actions.includes('arms_raise') || repertoire.actions.includes('emote');
    }
    return repertoire.actions.includes(actionId);
}
