import catalog from '../../assets/lpc/catalog.json' with { type: 'json' };
export { catalog };
export const IDENTITY_SLOTS = ['body', 'head', 'hair', 'beard', 'ears', 'expression'];
export const label = value => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

export function validateSelection(slot, selection, data = catalog) {
    const item = data.items[selection?.itemId];
    if (!Object.hasOwn(data.slots, slot) || !data.slots[slot].includes(selection?.itemId)
        || !item?.bodyTypes.some(type => ['male', 'female'].includes(type))) throw Error(`Unavailable ${slot} item.`);
    const palette = selection.paletteId;
    const prefix = `${item.material}.ulpc.`;
    if (typeof palette !== 'string' || !palette.startsWith(prefix)
        || !data.paletteChoices[item.material].includes(palette.slice(prefix.length))) throw Error(`Unavailable ${slot} color.`);
    return item;
}

export function selectionsFor(definition, outfitId) {
    const outfit = definition.outfits.find(outfit => outfit.id === outfitId);
    if (!outfit) throw Error('Unknown outfit.');
    const { bodyType, bald, ...identity } = definition.identity;
    return { ...identity, ...outfit.selections };
}

export function validateSelections(selections, data = catalog) {
    const entries = Object.entries(selections).map(([slot, selection]) => [slot, validateSelection(slot, selection, data)]);
    const ids = new Set(Object.values(selections).map(selection => selection.itemId));
    const occupied = new Set();
    if (entries.length && !['male', 'female'].some(type => entries.every(([, item]) => item.bodyTypes.includes(type)))) throw Error('Selected layers belong to incompatible body types.');
    for (const [, item] of entries) {
        if (!item.layers.length || item.layers.length < (item.requiredLayerCount ?? 1)) throw Error(`${item.name} is missing a required layer.`);
        for (const place of item.occupies ?? []) { if (occupied.has(place)) throw Error(`Two selected items occupy ${place}.`); occupied.add(place); }
        if (item.conflictsWith?.some(id => ids.has(id))) throw Error(`${item.name} conflicts with another selected item.`);
        for (const [slot, required] of Object.entries(item.requires ?? {})) if (!required.includes(selections[slot]?.itemId)) throw Error(`${item.name} requires ${required.map(id => data.items[id].name).join(' or ')}.`);
    }
    return selections;
}
export function capabilities(selections, data = catalog) {
    validateSelections(selections, data);
    return Object.keys(data.animations).filter(animation => Object.entries(selections).every(([slot, selection]) => {
        const item = validateSelection(slot, selection, data);
        return !Object.hasOwn(item.unavailableAnimations??{},animation)&&item.layers.every(layer => Object.hasOwn(layer.paths, animation));
    }));
}

export function planLayers(selections, animation, data = catalog) {
    if (!Object.hasOwn(data.animations, animation) || !capabilities(selections, data).includes(animation)) throw Error('This outfit does not support that action.');
    return Object.entries(selections).flatMap(([slot, selection]) => {
        const item = validateSelection(slot, selection, data);
        return item.layers.map(layer => {
            const path = layer.paths[animation];
            if (!/^spritesheets\/[a-z0-9_/-]+\.png$/.test(path) || path.split('/').includes('..')) throw Error('Invalid catalog asset.');
            return { slot, z: layer.z, path, material: item.material, sourcePalette: item.sourcePalette ?? data.sourcePalettes[item.material], sourceColorAliases:item.sourceColorAliases??{}, palette: selection.paletteId.split('.').at(-1) };
        });
    }).sort((a, b) => a.z - b.z || ({beard:0,prop:1}[a.slot]??0)-({beard:0,prop:1}[b.slot]??0) || a.slot.localeCompare(b.slot));
}
