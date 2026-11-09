export function createDefinition(uuid) {
    const selection = (itemId, material, color) => ({ itemId, paletteId: `${material}.ulpc.${color}` });
    return {
        schemaVersion: 1, kind: 'character-definition', characterId: uuid,
        revision: 1, catalogVersion: 'lpc-curated-v1',
        identity: { bodyType: 'male', body: selection('body', 'body', 'light'), head: selection('heads_human_male', 'body', 'light'), hair: selection('hair_plain', 'hair', 'dark_brown') },
        outfits: [
            { id: 'everyday', name: 'Everyday', selections: { clothes: selection('torso_clothes_tshirt', 'cloth', 'teal'), legs: selection('legs_pants', 'cloth', 'navy') } },
            { id: 'evening', name: 'Evening', selections: { clothes: selection('torso_clothes_longsleeve', 'cloth', 'maroon'), legs: selection('legs_pants', 'cloth', 'charcoal') } },
            { id: 'summer', name: 'Summer', selections: { clothes: selection('torso_clothes_tshirt', 'cloth', 'yellow'), legs: selection('legs_shorts', 'cloth', 'forest') } },
        ],
        startingPresentation: { outfitId: 'everyday', posture: 'idle', facing: 'south', scene: { backgroundId: 'plain', x: 0.5, y: 1, scale: 1 } },
    };
}
