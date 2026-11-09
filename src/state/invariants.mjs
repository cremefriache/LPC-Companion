/** Cross-field checks AFTER schema validation; catalog validation is a separate gate. */
export function assertStateInvariants(value) {
    if (value.kind === 'chat-state') {
        assertStateInvariants(value.snapshot);
        const known = new Set(value.snapshot.outfits.map(outfit => outfit.id));
        for (const entry of value.history) if (entry.change.kind === 'companion-replacement') {
            assertStateInvariants(entry.change.definition);
            if (entry.change.definition.characterId !== value.snapshot.characterId) throw Error('History belongs to another character.');
            for (const outfit of entry.change.definition.outfits) known.add(outfit.id);
        }
        if (!known.has(value.presentation.outfitId)) throw Error('Unknown outfit ID.');
        const entries = new Set(); let sequence = 0;
        for (const entry of value.history) {
            if (entries.has(entry.entryId) || entry.sequence <= sequence) throw Error('History must have unique entries in increasing sequence order.');
            const outfit = entry.change.patch?.outfitId;
            if (outfit !== undefined && !known.has(outfit)) throw Error('Unknown history outfit ID.');
            entries.add(entry.entryId); sequence = entry.sequence;
        }
        return value;
    }
    const snapshot = value.kind === 'chat-state' ? value.snapshot : value;
    if (['character-definition', 'chat-snapshot'].includes(snapshot.kind)) {
        const ids = snapshot.outfits.map(outfit => outfit.id);
        if (new Set(ids).size !== ids.length) throw new Error('Outfit IDs must be unique.');
        const presentations = [snapshot.startingPresentation];
        if (value.kind === 'chat-state') presentations.push(value.presentation);
        for (const presentation of presentations) {
            if (!ids.includes(presentation.outfitId)) throw new Error('Unknown outfit ID.');
        }
        // Source identity/channel/order checks belong to its registered catalog contract.
        if(snapshot.schemaVersion===2)return value;
        if (snapshot.identity.body.paletteId !== snapshot.identity.head.paletteId) {
            throw new Error('Head and body skin palettes must match.');
        }
        if(snapshot.identity.beard && snapshot.identity.hair && snapshot.identity.beard.paletteId !== snapshot.identity.hair.paletteId)throw Error('Beard color must match hair color.');
        if(snapshot.identity.ears && snapshot.identity.ears.paletteId !== snapshot.identity.body.paletteId)throw Error('Ear color must match skin tone.');
        if(snapshot.identity.expression && snapshot.identity.expression.paletteId !== snapshot.identity.body.paletteId)throw Error('Neutral face color must match skin tone.');
        const history = value.history ?? [];
        const entries = new Set();
        let sequence = 0;
        for (const entry of history) {
            if (entries.has(entry.entryId) || entry.sequence <= sequence) {
                throw new Error('History must have unique entries in increasing sequence order.');
            }
            const outfit = entry.change.patch?.outfitId;
            if (outfit !== undefined && !ids.includes(outfit)) throw new Error('Unknown history outfit ID.');
            entries.add(entry.entryId);
            sequence = entry.sequence;
        }
    }
    return value;
}
