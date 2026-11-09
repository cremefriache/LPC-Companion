// Curated choices, pinned extraction inputs and deliberately limited animation coverage.
export const WARDROBE_ASSETS = {
    cape_solid: { file: 'torso/cape/cape_solid.json', slot: 'cape', requiredLayerCount: 2, name: 'Solid cape', animations: ['idle', 'walk', 'spellcast'], occupies: ['back'], requires: {}, conflictsWith: [] },
    cape_tattered: { file: 'torso/cape/cape_tattered.json', slot: 'cape', requiredLayerCount: 2, name: 'Tattered cape', animations: ['idle', 'walk', 'spellcast'], occupies: ['back'], requires: {}, conflictsWith: ['cape_trim'] },
    cape_trim: { file: 'torso/cape/cape_trim.json', slot: 'accessory', requiredLayerCount: 1, name: 'Cape trim', animations: ['idle', 'walk', 'spellcast'], occupies: ['cape_edge'], requires: { cape: ['cape_solid'] }, conflictsWith: ['cape_tattered'] },
    shield_heater_revised_wood: { file: 'weapons/shields/heater/shield_heater_revised_wood.json', slot: 'prop', requiredLayerCount: 2, name: 'Wooden heater shield', animations: ['idle', 'walk', 'run', 'jump', 'spellcast'], occupies: ['left_hand'], requires: {}, conflictsWith: [], variant: 'brown', original: true, unavailableAnimations: { spellcast: 'Shield Cast has no south-facing pixels. Remove the shield or choose another action.' } },
};
export const PINNED_LPC = '7736d762aa2113f29342dad869ef4931218aa7ae';
