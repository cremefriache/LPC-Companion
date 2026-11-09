import { catalog } from '../catalog/catalog.mjs';
import { validateDefinition } from './validate.mjs';

export const PALETTE_PRESETS = Object.freeze({
    woodland: { name: 'Woodland', clothes: 'forest', legs: 'charcoal' },
    coast: { name: 'Coast', clothes: 'white', legs: 'navy' },
    sunset: { name: 'Sunset', clothes: 'maroon', legs: 'charcoal' },
    bright: { name: 'Bright', clothes: 'yellow', legs: 'blue' },
});
export const MAX_OUTFITS = 99;
export function nextOutfitId(outfits = []) {
    const used = new Set(outfits.map(outfit => outfit.id));
    for (let i = 1; i <= MAX_OUTFITS; i++) {
        const id = String(i).padStart(2, '0');
        if (!used.has(id)) return id;
    }
    throw Error('A companion can have up to 99 outfits.');
}
export function duplicateOutfit(value, outfitId, newId) {
    const definition = validateDefinition(value);
    if (definition.outfits.length >= MAX_OUTFITS) throw Error('A companion can have up to 99 outfits.');
    const original = definition.outfits.find(outfit => outfit.id === outfitId);
    if (!original) throw Error('Unknown outfit.');
    const id = newId ?? nextOutfitId(definition.outfits);
    definition.outfits.push({ ...structuredClone(original), id, name: `${original.name.slice(0, 73)} (copy)`, favorite: false });
    return validateDefinition(definition);
}
/** Removal is an editor draft change; persistence still requires explicit Apply. */
export function removeOutfit(value, outfitId) {
    const definition = structuredClone(value);
    if (!definition.outfits.some(outfit => outfit.id === outfitId)) throw Error('Unknown outfit.');
    if (definition.outfits.length <= 1) throw Error('Keep at least one outfit.');
    definition.outfits = definition.outfits.filter(outfit => outfit.id !== outfitId);
    if (definition.startingPresentation.outfitId === outfitId) definition.startingPresentation.outfitId = definition.outfits[0].id;
    return validateDefinition(definition);
}
export function applyPalettePreset(value, outfitId, presetId) {
    const definition = validateDefinition(value);
    if (!Object.hasOwn(PALETTE_PRESETS, presetId)) throw Error('Unknown clothing palette preset.');
    const outfit = definition.outfits.find(outfit => outfit.id === outfitId);
    if (!outfit) throw Error('Unknown outfit.');
    if (!outfit.selections.clothes && !outfit.selections.legs) throw Error('Add a top or bottoms before choosing a clothing palette.');
    for (const slot of ['clothes', 'legs']) if (outfit.selections[slot]) outfit.selections[slot].paletteId = `cloth.ulpc.${PALETTE_PRESETS[presetId][slot]}`;
    return validateDefinition(definition);
}


/** Explicit identity edit; ordinary outfit changes never call this. */
export function changeBodyType(value, bodyType) {
    const definition = validateDefinition(value);
    if (!catalog.bodyTypes.includes(bodyType)) throw Error('Unsupported body type.');
    const map = selection => {
        const item = catalog.items[selection.itemId];
        const id = item.counterparts?.[bodyType] ?? selection.itemId;
        if (!catalog.items[id]?.bodyTypes.includes(bodyType)) throw Error(`No verified ${bodyType} counterpart for ${item.name}.`);
        return { ...selection, itemId: id };
    };
    for (const slot of ['body', 'head', 'hair', 'beard', 'ears', 'expression']) if(definition.identity[slot]) definition.identity[slot] = map(definition.identity[slot]);
    definition.identity.bodyType = bodyType;
    for (const outfit of definition.outfits) for (const [slot, selection] of Object.entries(outfit.selections)) outfit.selections[slot] = map(selection);
    return validateDefinition(definition);
}

export function neutralFaceForHead(headId){
 const id=catalog.slots.expression.find(id=>catalog.items[id].requires.head.includes(headId));
 if(!id)throw Error('No verified neutral face for this head.');return id;
}
