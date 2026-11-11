import { FULL_SOURCE_COMMIT } from '../catalog/full-catalog.mjs';
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v),
    own = (v, k) => Object.hasOwn(v, k);
export class SourceImportError extends Error {
    constructor(diagnostics) {
        super(diagnostics.map(i => i.path +': ' +i.message).join('\n'));
        this.name = 'SourceImportError';
        this.diagnostics = diagnostics;
    }
}

/** No mutation, persistence, remote URLs, supplied credit trust or inferred missing selections. */
export function importFullGenerator(text, catalog) {
    const issues = [],
        warnings = [],
        issue = (path, code, message) => {
            if (issues.length < 32) issues.push({ path, code, message });
        };
    let value;
    if (typeof text !== 'string' || text.length > 2_000_000)
        throw new SourceImportError([{
            path: 'format',
            code: 'input_limit',
            message: 'Generator import exceeds the 2 MB limit.'
        }]);
    try {
        value = JSON.parse(text);
    } catch {
        throw new SourceImportError([{
            path: 'format',
            code: 'invalid_json',
            message: 'Expected a JSON character export.'
        }]);
    }
    const pending = [[value, 0]];
    let nodes = 0;
    while (pending.length) {
        const [item, depth] = pending.pop();
        if (item && typeof item === 'object') {
            const children = Object.values(item);
            nodes += children.length;
            if (depth > 32 || nodes > 100000)
                throw new SourceImportError([{
                    path: 'format',
                    code: 'input_limit',
                    message: 'Generator data is too deeply nested or contains too many fields.'
                }]);
            for (const child of children)
                if (child && typeof child === 'object') pending.push([child, depth +1]);
        }
    }
    if (!plain(value) || value.version !== 2)
        throw new SourceImportError([{
            path: 'format',
            code: 'unsupported_format',
            message: 'Expected an official generator version:2 character export, not a preset library or companion package.'
        }]);
    if (!catalog.bodies().includes(value.bodyType))
        issue('bodyType', 'unsupported_body', 'Choose one of the six pinned source profiles.');
    if (!plain(value.selections) || !Object.keys(value.selections).length || Object.keys(value.selections).length > 128)
        issue('selections', 'invalid_selections', 'Expected 1–128 physical/color selections.');
    for (const field of ['matchBodyColorEnabled', 'applyTransparencyMask'])
        if (value[field] !== undefined && typeof value[field] !== 'boolean') issue(field, 'invalid_option', 'Expected a boolean.');
    const raw = Object.create(null),
        selections = Object.create(null),
        secondaries = [];
    for (const [slot, input]of Object.entries(plain(value.selections) ? value.selections : {})) {
        const at = 'selections.' +slot.slice(0, 64);
        if (!plain(input) || typeof input.itemId !== 'string' || input.itemId.length > 128) {
            issue(at, 'invalid_selection', 'Expected an available item ID.');
            continue;
        }
        let item;
        try {
            item = catalog.item(input.itemId);
        } catch {
            issue(at +'.itemId', 'unknown_item', 'This item is absent from the pinned source catalog.');
            continue;
        }
        const subId = input.subId ?? null,
            channel = subId === null ? item.recolors.find(c => !c.type_name) : Number.isInteger(subId) && subId >= 0
                ? item.recolors[subId] : null;
        if (subId !== null && (!channel?.type_name || channel.type_name !== slot)) {
            issue(
                at +'.subId',
                'invalid_channel',
                'This secondary color does not match its exact source channel/index.'
            );
            continue;
        }
        if (subId === null && slot !== item.type_name) {
            issue(at, 'wrong_slot', 'The physical item does not belong to this source slot.');
            continue;
        }
        const variant = item.variants.length ? input.variant : (input.variant === '' || input.variant === undefined
            ? null : input.variant);
        if (item.variants.length ? !item.variants.includes(variant) : variant !== null) {
            issue(at +'.variant', 'invalid_variant', 'Choose an exact offered fixed variant.');
            continue;
        }
        if (!item.required.includes(value.bodyType)) {
            issue(at, 'incompatible_body', 'This item does not support the selected source profile.');
            continue;
        }
        if (input.recolor !== undefined && input.recolor !== null && input.recolor !== '' && !channel) {
            issue(at +'.recolor', 'invalid_channel', 'This fixed-color item has no matching recolor channel.');
            continue;
        }
        let recolor = input.recolor ?? '';
        if (input.recolor !== undefined && input.recolor !== null && input.recolor !== '')
            try {
                recolor = catalog.generatorNativeColor(item.id, channel.type_name ?? item.type_name, input.recolor);
            } catch {
                issue(
                    at +'.recolor',
                    'invalid_palette',
                    'This color/family is not offered by the selected source channel.'
                );
                continue;
            }
        const knownSelection = ['itemId', 'variant', 'recolor', 'subId', 'name'];
        if (Object.keys(input).some(k => !knownSelection.includes(k))) {
            issue(
                at,
                'unknown_selection_field',
                'Selection fields outside the pinned generator contract require explicit support.'
            );
            continue;
        }
        raw[slot] = { itemId: item.id, name: item.name, variant, recolor, subId };
        if (subId !== null)
            secondaries.push({ slot, itemId: item.id, parentSlot: item.type_name });
        else selections[slot] = { itemId: item.id, variant, colors: {} };
    }
    for (const s of secondaries)
        if (selections[s.parentSlot]?.itemId !== s.itemId)
            issue(
                'selections.' +s.slot,
                'orphan_color',
                'The secondary color requires its matching selected physical parent.'
            );
    if (issues.length) throw new SourceImportError(issues);
    const matchBodyColor = value.matchBodyColorEnabled ?? true;
    for (const [slot, selection]of Object.entries(selections))
        try {
            const result = catalog.generatorColorResult(selection.itemId, raw, matchBodyColor);
            selection.colors = result.colors;
            warnings.push(...result.warnings);
            if (!Object.keys(selection.colors).length && catalog.item(selection.itemId).recolors.length)
                warnings.push({
                    code: 'source_uncolored',
                    itemId: selection.itemId,
                    message: 'No target color was selected; the original pinned source colors will be previewed.'
                });
        } catch (error) {
            issue('selections.' +slot, 'incompatible_effective_color', error.message);
        }
    let recipe;
    try {
        recipe = catalog.validateRecipe({
            schemaVersion: 2,
            sourceCommit: FULL_SOURCE_COMMIT,
            bodyType: value.bodyType,
            selections,
            matchBodyColor,
            applyMask: value.applyTransparencyMask ?? false
        });
    } catch (error) {
        issue('selections', error.code ?? 'invalid_recipe', error.message);
    }
    if (issues.length) throw new SourceImportError(issues);
    const claims = new Map();
    if (value.layers !== undefined) {
        if (!Array.isArray(value.layers) || value.layers.length > 256)
            issue('layers', 'invalid_layers', 'Expected at most 256 catalog layer descriptions.');
        else
            for (const [n, layer]of value.layers.entries()) {
                const at = 'layers.' +n;
                if (!plain(layer) || layer.source?.kind !== 'catalog' || typeof layer.source.spritePath !== 'string'
                    || !Object.values(selections).some(s => s.itemId === layer.itemId) || !Number.isInteger(layer.layerNum)) {
                    issue(at, 'unavailable_layer', 'Custom/unselected artwork is not represented by this pinned recipe.');
                    continue;
                }
                if (!claims.has(layer.itemId))
                    claims.set(layer.itemId, catalog.sourcesFor(recipe, layer.itemId));
                const paths = claims.get(layer.itemId),
                    path = 'spritesheets/' +layer.source.spritePath;
                if (!paths.some(p => p.path === path && p.layer === layer.layerNum && p.z === layer.zPos)) {
                    issue(
                        at +'.source',
                        'changed_source',
                        'Layer path, number or order differs from the pinned local artwork.'
                    );
                    continue;
                }
                const selection = Object.values(recipe.selections).find(s => s.itemId === layer.itemId);
                if ((layer.variant === '' || layer.variant === undefined ? null : layer.variant) !== selection.variant)
                    issue(at +'.variant', 'variant_mismatch', 'Layer and selection variants disagree.');
                if (layer.recolors !== undefined && layer.recolors !== null) {
                    if (!plain(layer.recolors))
                        issue(at +'.recolors', 'invalid_channels', 'Expected named source colors.');
                    else
                        for (const [channel, color]of Object.entries(layer.recolors))
                            try {
                                if (catalog.validateColor(layer.itemId, channel, color) !== selection.colors[channel])
                                    issue(at +'.recolors', 'color_mismatch', 'Layer colors disagree with effective selections.');
                            } catch {
                                issue(at +'.recolors', 'invalid_palette', 'Layer contains an unavailable source color channel.');
                            }
                }
            }
    }
    if (value.selectedAnimation !== undefined && (typeof value.selectedAnimation !== 'string' || !catalog.actionIds()
        .includes(value.selectedAnimation)))
        issue(
            'selectedAnimation',
            'unknown_preview',
            'The source preview animation is unknown; no fallback was selected.'
        );
    const known = [
            'version',
            'bodyType',
            'selections',
            'selectedAnimation',
            'showTransparencyGrid',
            'applyTransparencyMask',
            'matchBodyColorEnabled',
            'compactDisplay',
            'enabledLicenses',
            'enabledAnimations',
            'url',
            'layers',
            'credits'
        ],
        ignored = Object.fromEntries(Object.entries(value).filter(([k]) => !known.includes(k)));
    if (JSON.stringify(ignored).length > 16384)
        issue('provenance', 'input_limit', 'Unknown inert metadata exceeds 16 KB.');
    if (issues.length) throw new SourceImportError(issues);
    const previewAnimation = value.selectedAnimation ?? null;
    if (previewAnimation)
        try {
            const plan = catalog.plan(recipe, previewAnimation);
            warnings.push(...plan.warnings);
        } catch (error) {
            warnings.push({
                code: 'unavailable_preview',
                message: error.message,
                details: error.details
            });
        }
    return {
        recipe,
        previewAnimation,
        warnings,
        provenance: {
            format: 'official-generator-v2',
            sourceCommit: FULL_SOURCE_COMMIT,
            metadataOnly: ['layers', 'credits', 'url', 'enabledAnimations', 'enabledLicenses'].filter(k => own(value,
                k)),
            ignoredJson: JSON.stringify(ignored)
        }
    };
}
