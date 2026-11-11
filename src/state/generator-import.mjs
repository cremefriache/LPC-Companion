import { neutralFaceForHead } from './wardrobe.mjs';
import { catalog, validateSelection } from '../catalog/catalog.mjs';
import { createDefinition } from './defaults.mjs';
import { validateDefinition } from './validate.mjs';

export class PresetImportError extends Error {
    constructor(diagnostics) {
        super(diagnostics.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
        this.name = 'PresetImportError';
        this.diagnostics = diagnostics;
    }
}
export function importGeneratorPreset(value, localId) {
    const issues = [], ignored = Object.create(null);
    const issue = (path, code, message) => {
        if (issues.length < 32) issues.push({ path, code, message });
    };
    if (value.version !== 2)
        throw new PresetImportError([{
            path: 'format',
            code: 'unsupported_format',
            message: value.schemaVersion === 1 ? 'Generator local library schemaVersion:1 is not a version:2 preset. Export one character preset or use an LPC companion package.'
                : 'Expected generator version:2 or an LPC companion package.'
        }]);
    if (!catalog.bodyTypes.includes(value.bodyType))
        issue('bodyType', 'unsupported_body', `Unsupported body type. Available: ${catalog.bodyTypes.join(', ')}.`);
    if (!value.selections || typeof value.selections !== 'object' || Array.isArray(value.selections))
        issue('selections', 'invalid_selections', 'Expected an object of named selections.');
    const definition = createDefinition(localId),
        identity = { bodyType: value.bodyType },
        outfit = {};
    for (const slot of ['body', 'head'])
        if (!Object.hasOwn(value.selections ?? {}, slot))
            issue(`selections.${slot}`, 'missing_identity', 'This identity selection is required.');
    const mapped = Object.create(null);
    let expression;
    const sourceSlots = {
        body: 'body',
        head: 'head',
        hair: 'hair',
        beard: 'beard',
        ears: 'ears',
        expression: 'expression',
        clothes: 'clothes',
        legs: 'legs',
        cape: 'cape',
        cape_trim: 'accessory',
        shield: 'prop',
        shoes: 'shoes'
    };
    const sourceChannels = Object.create(null);
    for (const [sourceSlot, selection]of Object.entries(value.selections ?? {})) {
        if (!Object.hasOwn(sourceSlots, sourceSlot)) {
            issue(
                `selections.${sourceSlot.slice(0, 80)}`,
                'unsupported_slot',
                'This generator slot is not imported. Use a verified companion package or the companion editor.'
            );
            continue;
        }
        const slot = sourceSlots[sourceSlot];
        if (sourceSlot === 'shield' && selection?.itemId !== 'shield_heater_revised_wood') {
            issue(
                'selections.shield.itemId',
                'unsupported_item',
                'Only the verified Revised Heater Shield Base is imported.'
            );
            continue;
        }
        if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
            issue(`selections.${sourceSlot}`, 'invalid_selection', 'Expected itemId and recolor.');
            continue;
        }
        if ((selection.variant != null && selection.variant !== '') || selection.subId != null) {
            issue(
                `selections.${sourceSlot}`,
                'unsupported_variant',
                'Variants/sub-items are not supported by this preset adapter; use a curated companion package.'
            );
            continue;
        }
        if (slot === 'expression') {
            expression = selection;
            continue;
        }
        const selectedId = sourceSlot === 'shield' && selection.itemId === 'shield_heater_revised_wood' ? 'shield_heater_revised_wood_recolor'
            : selection.itemId;
        const source = typeof selectedId === 'string' && Object.hasOwn(catalog.items, selectedId) ? catalog.items[selectedId]
            : null;
        const itemId = slot !== 'head' && catalog.bodyTypes.includes(value.bodyType) ? source?.counterparts?.[value.bodyType]
            ?? selectedId : selectedId;
        const item = typeof itemId === 'string' && Object.hasOwn(catalog.items, itemId) ? catalog.items[itemId]
            : null;
        if (!item || !catalog.slots[slot].includes(itemId) || !item.bodyTypes.includes(value.bodyType)) {
            issue(
                `selections.${sourceSlot}.itemId`,
                'unsupported_item',
                `Unavailable item ${typeof selection.itemId === 'string' ? selection.itemId.slice(0, 100) : '(non-string)'}. Available for this slot/body: ${catalog.slots[slot].filter(id => catalog.items[id].bodyTypes.includes(value.bodyType)).join(', ')}.`
            );
            continue;
        }
        const next = {
            itemId,
            paletteId: typeof selection.recolor === 'string' && catalog.paletteChoices[item.material].includes(selection.recolor)
                ? `${item.material}.ulpc.${selection.recolor}` : selection.recolor
        };
        try {
            validateSelection(slot, next);
        } catch {
            issue(
                `selections.${sourceSlot}.recolor`,
                'unsupported_palette',
                `Unavailable color. Choose ${item.material}.ulpc.<color> with: ${catalog.paletteChoices[item.material].join(', ')}.`
            );
            continue;
        }
        mapped[selection.itemId] = itemId;
        sourceChannels[selection.itemId] = sourceSlot;
        if (['body', 'head', 'hair', 'beard', 'ears'].includes(slot)) identity[slot] = next;
        else outfit[slot] = next;
        const extras = Object.fromEntries(Object.entries(selection).filter(([key]) => !['itemId', 'recolor', 'variant',
            'subId'].includes(key)));
        if (Object.keys(extras).length) ignored[`selections.${sourceSlot}`] = extras;
    }
    if (expression) {
        if (expression.itemId !== 'face_neutral')
            issue(
                'selections.expression.itemId',
                'unsupported_expression',
                'Only the verified neutral face overlay is supported.'
            );
        else if (identity.head) {
            const itemId = neutralFaceForHead(identity.head.itemId),
                paletteId = typeof expression.recolor === 'string' && catalog.paletteChoices.body.includes(expression.recolor)
                    ? `body.ulpc.${expression.recolor}` : expression.recolor;
            try {
                validateSelection('expression', { itemId, paletteId });
                identity.expression = { itemId, paletteId };
                mapped.face_neutral = itemId;
                sourceChannels.face_neutral = 'expression';
            } catch {
                issue(
                    'selections.expression.recolor',
                    'unsupported_palette',
                    'Choose a verified body skin color for the neutral face.'
                );
            }
        }
    }
    if (value.layers !== undefined) {
        if (!Array.isArray(value.layers) || value.layers.length > 128)
            issue('layers', 'invalid_layers', 'Expected at most 128 catalog layer descriptions.');
        else
            for (const [index, layer]of value.layers.entries()) {
                const item = typeof layer?.itemId === 'string' ? catalog.items[mapped[layer.itemId]] : null,
                    file = layer?.source?.spritePath;
                if (layer?.source?.kind !== 'catalog' || !item || typeof file !== 'string' || !item.layers.some(l => Object.values(l.paths)
                    .includes('spritesheets/' +file))) {
                    issue(
                        `layers.${index}`,
                        'unsupported_layer',
                        'A custom, unavailable or changed source layer cannot be reproduced with local artwork.'
                    );
                    continue;
                }
                if (layer.recolors && (typeof layer.recolors !== 'object' || Array.isArray(layer.recolors) || Object.entries(layer.recolors)
                    .some(([channel, color]) => channel !== sourceChannels[layer.itemId] || typeof color !== 'string'
                    || !catalog.paletteChoices[item.material].includes(color) && !catalog.paletteChoices[item.material]
                    .some(p => color === item.material +'.ulpc.' +p))))
                    issue(
                        `layers.${index}.recolors`,
                        'unsupported_channel',
                        'Additional recolor channels require explicit support.'
                    );
                const selected = Object.values({ ...identity, ...outfit }).find(v => v?.itemId === mapped[layer.itemId]);
                if (layer.recolors && selected && Object.values(layer.recolors).some(c => c !== selected.paletteId
                    && `${item.material}.ulpc.${c}` !== selected.paletteId))
                    issue(
                        `layers.${index}.recolors`,
                        'color_mismatch',
                        'Layer colors disagree with selections; choose matching colors in the generator.'
                    );
            }
    }
    if (value.selectedAnimation !== undefined && (typeof value.selectedAnimation !== 'string' || !Object.hasOwn(catalog.animations,
        value.selectedAnimation)))
        issue(
            'selectedAnimation',
            'unsupported_preview',
            'The preview animation is unavailable; choose a supported preview in the generator.'
        );
    const knownMetadata = [
        'version',
        'bodyType',
        'selections',
        'selectedAnimation',
        'layers',
        'credits',
        'url',
        'showTransparencyGrid',
        'applyTransparencyMask',
        'matchBodyColorEnabled',
        'compactDisplay',
        'enabledLicenses',
        'enabledAnimations'
    ];
    for (const [key, data]of Object.entries(value))
        if (!knownMetadata.includes(key)) ignored[key] = data;
    ignored.generator = {
        version: 2,
        previewAnimation: value.selectedAnimation ?? 'idle',
        metadataOnly: ['layers', 'credits', 'url', 'enabledAnimations'].filter(key => Object.hasOwn(value, key))
    };
    if (issues.length) throw new PresetImportError(issues);
    if (!identity.hair) identity.bald = true;
    definition.identity = identity;
    definition.outfits = [{ id: 'imported', name: 'Imported outfit', selections: outfit }];
    definition.startingPresentation.outfitId = 'imported';
    definition.startingPresentation.posture = ['idle', 'walk'].includes(value.selectedAnimation) ? value.selectedAnimation
        : 'idle';
    const provenance = JSON.stringify(ignored);
    if (provenance.length > 16384)
        throw new PresetImportError([{
            path: 'provenance',
            code: 'oversized_provenance',
            message: 'Ignored source metadata exceeds 16 KB; remove it before importing.'
        }]);
    if (provenance !== '{}')
        definition.importProvenance = { format: 'generator-v2', ignoredJson: provenance };
    try {
        return validateDefinition(definition);
    } catch (error) {
        throw new PresetImportError([{
            path: 'companion',
            code: 'incompatible_selections',
            message: `${error.message} Required capabilities: ${definition.startingPresentation.posture}.`
        }]);
    }
}

export function generatorImportReport(value, definition) {
    return [
        `Supported local selections verified. Hair: ${definition.identity.hair?'selected':'bald / no hair'}. Face: ${definition.identity.expression?'neutral overlay':'head default'}.`,
        `Starting posture: ${definition.startingPresentation.posture}. Generator preview: ${typeof value.selectedAnimation==='string'?value.selectedAnimation:'idle'}. Edit starting presentation before Apply if needed.`,
        ...(definition.outfits.some(o => o.selections.prop?.itemId === 'shield_heater_revised_wood_recolor') ? ['The Wood shield keeps its selected wood color. Cast, sitting and expressive gestures are unavailable with this shield.']
            : []),
        ...(definition.outfits.some(o => o.selections.cape) ? ['Capes support Idle, Walk and Cast. Run, Jump, sitting and expressive gestures remain unavailable while a cape is worn.']
            : []),
        ...(definition.identity.hair?.itemId === 'hair_bob' && definition.identity.hair.paletteId !== 'hair.ulpc.orange'
            ? ['Bob hair uses the chosen color throughout Walk and Cast, correcting the generator’s leftover orange fringe.']
            : []),
        'Source layers, credits and animation filters are metadata only. Rendering, capabilities and export credits use verified local artwork. Nothing is saved until Apply.'
    ].join(' ');
}
