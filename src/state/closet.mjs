import { SOURCE_IDENTITY_SLOTS } from './full-state.mjs';
import { sourceDraft } from './source-draft.mjs';
import { MAX_OUTFITS, nextOutfitId } from './wardrobe.mjs';

const STORAGE_PREFIX = 'lpc-companion:closet:v1:';
const MAX_CLOSET_ITEMS = 96;
const identitySet = new Set(SOURCE_IDENTITY_SLOTS);
const listeners = new Set();

function storageKey(characterId) {
    return `${STORAGE_PREFIX}${characterId || 'default'}`;
}

export function closetKeyForSelection(slot, selection) {
    if (!selection || typeof selection.itemId !== 'string') return '';
    const variant = selection.variant ?? '';
    const colors = Object.entries(selection.colors ?? {})
        .filter(([, v]) => typeof v === 'string' && v.length > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(',');
    return `${slot}:${selection.itemId}:${variant}:${colors}`;
}

export function normalizeClosetEntry(raw, catalog, bodyType) {
    if (!raw || typeof raw !== 'object') return null;
    const slot = raw.slot;
    if (typeof slot !== 'string' || identitySet.has(slot)) return null;
    let item;
    try {
        item = catalog.item(raw.itemId);
    } catch {
        return null;
    }
    if (!item || item.type_name !== slot || (bodyType && !item.required.includes(bodyType))) return null;
    const variant = item.variants.length
        ? (item.variants.includes(raw.variant) ? raw.variant : item.variants[0])
        : null;
    const colors = {};
    if (raw.colors && typeof raw.colors === 'object') {
        for (const [channel, color] of Object.entries(raw.colors)) {
            if (!color) continue;
            try {
                colors[channel] = catalog.validateColor(item.id, channel, color);
            } catch {
                // Skip invalid color channel
            }
        }
    }
    const selection = { itemId: item.id, variant, colors };
    return {
        key: closetKeyForSelection(slot, selection),
        slot,
        itemId: item.id,
        variant,
        colors,
    };
}

function toStoredClosetEntry(entry) {
    return {
        slot: entry.slot,
        itemId: entry.itemId,
        variant: entry.variant ?? null,
        colors: structuredClone(entry.colors ?? {}),
    };
}

function readLegacyStoredCloset(characterId, storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    const k = storageKey(characterId);
    try {
        const raw = storage.getItem(k);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function baseClosetSource(definition, storage) {
    if (Array.isArray(definition?.closet)) return definition.closet;
    return readLegacyStoredCloset(definition?.characterId, storage);
}

function notifyClosetListeners(characterId, list) {
    for (const fn of [...listeners]) {
        try { fn(characterId, list); } catch {}
    }
}

export function seedClosetFromDefinition(definition, catalog, storage = globalThis.localStorage) {
    if (!definition || definition.schemaVersion !== 2 || !catalog) return [];
    const bodyType = definition.identity?.bodyType;
    const current = [];
    const seen = new Set();
    const push = raw => {
        const norm = normalizeClosetEntry(raw, catalog, bodyType);
        if (!norm || seen.has(norm.key)) return;
        seen.add(norm.key);
        current.push(norm);
    };
    for (const raw of baseClosetSource(definition, storage)) push(raw);
    for (const outfit of definition.outfits ?? []) {
        for (const [slot, sel] of Object.entries(outfit.selections ?? {})) {
            push({ slot, itemId: sel.itemId, variant: sel.variant, colors: sel.colors });
        }
    }
    const bounded = current.slice(0, MAX_CLOSET_ITEMS);
    definition.closet = bounded.map(toStoredClosetEntry);
    return bounded;
}

export function readCloset(definition, catalog, storage = globalThis.localStorage, options = {}) {
    if (!definition || definition.schemaVersion !== 2 || !catalog) return [];
    const bodyType = definition.identity?.bodyType;
    const stored = baseClosetSource(definition, storage);
    const seen = new Set();
    const result = [];

    const pushEntry = raw => {
        const norm = normalizeClosetEntry(raw, catalog, bodyType);
        if (!norm || seen.has(norm.key)) return;
        seen.add(norm.key);
        result.push(norm);
    };

    for (const raw of stored) pushEntry(raw);
    if (options.includeOutfits !== false) {
        for (const outfit of definition.outfits ?? []) {
            for (const [slot, sel] of Object.entries(outfit.selections ?? {})) {
                pushEntry({ slot, itemId: sel.itemId, variant: sel.variant, colors: sel.colors });
            }
        }
    }
    return result.slice(0, MAX_CLOSET_ITEMS);
}

export function addClosetEntry(definition, rawEntry, catalog, storage = globalThis.localStorage) {
    if (!definition || !catalog) return null;
    const norm = normalizeClosetEntry(rawEntry, catalog, definition.identity?.bodyType);
    if (!norm) return null;
    const current = baseClosetSource(definition, storage)
        .map(r => normalizeClosetEntry(r, catalog, definition.identity?.bodyType))
        .filter(Boolean);
    const seen = new Set();
    const deduped = [];
    for (const entry of current) {
        if (seen.has(entry.key)) continue;
        seen.add(entry.key);
        deduped.push(entry);
    }
    const idx = deduped.findIndex(e => e.key === norm.key);
    if (idx === -1) {
        deduped.unshift(norm);
    } else {
        deduped[idx] = norm;
    }
    const bounded = deduped.slice(0, MAX_CLOSET_ITEMS);
    definition.closet = bounded.map(toStoredClosetEntry);
    notifyClosetListeners(definition.characterId, definition.closet);
    return norm;
}

export function removeClosetEntry(definition, key, catalog, storage = globalThis.localStorage) {
    if (!definition) return;
    const current = baseClosetSource(definition, storage)
        .map(r => catalog ? normalizeClosetEntry(r, catalog, definition.identity?.bodyType) : r)
        .filter(e => e && (e.key ?? closetKeyForSelection(e.slot, e)) !== key);
    const seen = new Set();
    const deduped = [];
    for (const entry of current) {
        const entryKey = entry.key ?? closetKeyForSelection(entry.slot, entry);
        if (seen.has(entryKey)) continue;
        seen.add(entryKey);
        deduped.push(entry);
    }
    definition.closet = deduped.slice(0, MAX_CLOSET_ITEMS).map(toStoredClosetEntry);
    notifyClosetListeners(definition.characterId, definition.closet);
}

export function isEntryInCloset(definition, rawEntry, catalog, storage = globalThis.localStorage) {
    const norm = normalizeClosetEntry(rawEntry, catalog, definition?.identity?.bodyType);
    if (!norm) return false;
    return readCloset(definition, catalog, storage).some(e => e.key === norm.key);
}

export function isEntryWorn(outfit, entry) {
    if (!outfit?.selections || !entry) return false;
    const current = outfit.selections[entry.slot];
    if (!current) return false;
    return closetKeyForSelection(entry.slot, current) === entry.key;
}

function resolveDependenciesOnEquip(selections, identitySelections, newSlot, newItem, closetEntries, catalog) {
    const next = structuredClone(selections);
    const newTags = new Set(newItem.tags ?? []);
    const newExcluded = new Set(newItem.excluded_tags ?? []);

    for (const [slot, sel] of Object.entries(next)) {
        if (slot === newSlot) continue;
        const item = catalog.item(sel.itemId);
        const itemTags = item.tags ?? [];
        const itemExcluded = item.excluded_tags ?? [];
        if (itemTags.some(t => newExcluded.has(t)) || itemExcluded.some(t => newTags.has(t))) {
            delete next[slot];
        }
    }

    const activeTags = () => {
        const tags = new Set();
        for (const sel of Object.values({ ...identitySelections, ...next })) {
            for (const t of catalog.item(sel.itemId).tags ?? []) tags.add(t);
        }
        return tags;
    };

    for (const reqTag of newItem.required_tags ?? []) {
        if (activeTags().has(reqTag)) continue;
        const provider = closetEntries.find(e => {
            const candidate = catalog.item(e.itemId);
            return (candidate.tags ?? []).includes(reqTag);
        });
        if (provider && !next[provider.slot]) {
            next[provider.slot] = {
                itemId: provider.itemId,
                variant: provider.variant ?? null,
                colors: structuredClone(provider.colors ?? {}),
            };
        }
    }

    return pruneUnsatisfiedDependents(next, identitySelections, catalog);
}

function pruneUnsatisfiedDependents(selections, identitySelections, catalog) {
    const next = structuredClone(selections);
    let changed = true;
    while (changed) {
        changed = false;
        const tags = new Set();
        for (const sel of Object.values({ ...identitySelections, ...next })) {
            for (const t of catalog.item(sel.itemId).tags ?? []) tags.add(t);
        }
        for (const [slot, sel] of Object.entries(next)) {
            const item = catalog.item(sel.itemId);
            if ((item.required_tags ?? []).some(t => !tags.has(t))) {
                delete next[slot];
                changed = true;
            }
        }
    }
    return next;
}

export function toggleClosetLayer(definition, outfitId, rawEntry, catalog, storage = globalThis.localStorage) {
    const entry = normalizeClosetEntry(rawEntry, catalog, definition.identity.bodyType);
    if (!entry) throw Error('Unavailable closet item for this body profile.');
    const clone = structuredClone(definition);
    const outfit = clone.outfits.find(o => o.id === outfitId);
    if (!outfit) throw Error('Unknown outfit.');

    addClosetEntry(clone, entry, catalog, storage);

    const currentlyWorn = isEntryWorn(outfit, entry);
    if (currentlyWorn) {
        delete outfit.selections[entry.slot];
        outfit.selections = pruneUnsatisfiedDependents(outfit.selections, clone.identity.selections, catalog);
    } else {
        const previous = outfit.selections[entry.slot];
        if (previous) {
            addClosetEntry(clone, { slot: entry.slot, ...previous }, catalog, storage);
        }
        outfit.selections[entry.slot] = {
            itemId: entry.itemId,
            variant: entry.variant ?? null,
            colors: structuredClone(entry.colors ?? {}),
        };
        const closetList = readCloset(clone, catalog, storage);
        outfit.selections = resolveDependenciesOnEquip(
            outfit.selections,
            clone.identity.selections,
            entry.slot,
            catalog.item(entry.itemId),
            closetList,
            catalog,
        );
    }

    const draft = sourceDraft(clone, catalog);
    draft.select(outfitId);
    draft.reconcileRestActions(outfitId);
    return draft.canonicalize();
}

export function unequipOutfitSlot(definition, outfitId, slot, catalog, storage = globalThis.localStorage) {
    const clone = structuredClone(definition);
    const outfit = clone.outfits.find(o => o.id === outfitId);
    if (!outfit || !outfit.selections[slot]) return definition;
    addClosetEntry(clone, { slot, ...outfit.selections[slot] }, catalog, storage);
    delete outfit.selections[slot];
    outfit.selections = pruneUnsatisfiedDependents(outfit.selections, clone.identity.selections, catalog);
    const draft = sourceDraft(clone, catalog);
    draft.select(outfitId);
    draft.reconcileRestActions(outfitId);
    return draft.canonicalize();
}

export function saveWornAsOutfit(definition, sourceOutfitId, customName, catalog) {
    if (definition.outfits.length >= MAX_OUTFITS) {
        throw Error('At most 99 outfits are allowed.');
    }
    const draft = sourceDraft(definition, catalog);
    draft.select(sourceOutfitId);
    const newId = nextOutfitId(definition.outfits);
    draft.duplicate(newId);
    const cleanName = (customName ?? '').trim() || `Outfit ${newId}`;
    draft.rename(cleanName.slice(0, 80));
    return {
        definition: draft.canonicalize(),
        outfitId: newId,
    };
}

export function subscribeCloset(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function closetIdForIndex(index) {
    return `c${String(index + 1).padStart(2, '0')}`;
}

function primaryColorLabel(catalog, item, selection) {
    const recolorChannels = catalog.colorOptions?.(item.id) ?? [];
    if (recolorChannels.length) {
        const primary = recolorChannels[0];
        const value = selection?.colors?.[primary.channel] ?? '';
        const baseColor = item.recolors?.[0]?.base ?? '';
        const raw = value || baseColor || '';
        return raw ? raw.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()) : '';
    }
    if (item.variants?.length) {
        const raw = selection?.variant || item.variants[0] || '';
        return raw ? raw.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()) : '';
    }
    return '';
}

export function describeClosetForModel(definition, outfitId, catalog, storage = globalThis.localStorage) {
    if (!definition || definition.schemaVersion !== 2 || !catalog) return { worn: [], closet: [] };
    const outfit = definition.outfits.find(o => o.id === outfitId) ?? definition.outfits[0];
    if (!outfit) return { worn: [], closet: [] };
    const entries = readCloset(definition, catalog, storage);
    const closet = entries.map((entry, index) => {
        const item = catalog.item(entry.itemId);
        const color = primaryColorLabel(catalog, item, entry);
        const worn = isEntryWorn(outfit, entry);
        return {
            id: closetIdForIndex(index),
            slot: entry.slot,
            itemId: entry.itemId,
            name: item.name,
            ...(color ? { color } : {}),
            worn,
            entry,
        };
    });
    const worn = closet
        .filter(c => c.worn)
        .map(({ id, slot, name, color }) => ({
            id,
            slot,
            name,
            ...(color ? { color } : {}),
        }));
    return { worn, closet };
}

export function applyModelClosetChanges(definition, outfitId, { wear = [], remove = [] } = {}, catalog, storage = globalThis.localStorage) {
    if (!definition || definition.schemaVersion !== 2 || !catalog) {
        throw Error('Character closet layers require a full-source v2 companion.');
    }
    const clone = structuredClone(definition);
    const outfit = clone.outfits.find(o => o.id === outfitId);
    if (!outfit) throw Error('Unknown outfit.');
    const { closet } = describeClosetForModel(clone, outfitId, catalog, storage);
    const closetEntries = closet.map(c => c.entry);

    const resolveRemoveSlot = rawToken => {
        const token = String(rawToken ?? '').trim();
        const lower = token.toLowerCase();
        if (!lower) throw Error('Empty remove layer token.');
        const directSlot = Object.keys(outfit.selections).find(s => s.toLowerCase() === lower);
        if (directSlot) return directSlot;
        const byClosetId = closet.find(c => c.id.toLowerCase() === lower);
        if (byClosetId) {
            if (!isEntryWorn(outfit, byClosetId.entry)) throw Error(`Closet item ${JSON.stringify(token)} is not currently worn.`);
            return byClosetId.slot;
        }
        throw Error(`Unknown worn layer or closet item to remove: ${JSON.stringify(rawToken)}.`);
    };

    const resolveWearEntry = rawToken => {
        const token = String(rawToken ?? '').trim();
        const lower = token.toLowerCase();
        if (!lower) throw Error('Empty wear layer token.');
        const byId = closet.find(c => c.id.toLowerCase() === lower);
        if (byId) return byId.entry;
        throw Error(`Unknown closet item to wear: ${JSON.stringify(rawToken)}. Choose a listed closet id (e.g. "c01").`);
    };

    if (remove.length) {
        for (const rawToken of remove) {
            const slot = resolveRemoveSlot(rawToken);
            delete outfit.selections[slot];
        }
        outfit.selections = pruneUnsatisfiedDependents(outfit.selections, clone.identity.selections, catalog);
    }

    if (wear.length) {
        for (const rawToken of wear) {
            const entry = resolveWearEntry(rawToken);
            outfit.selections[entry.slot] = {
                itemId: entry.itemId,
                variant: entry.variant ?? null,
                colors: structuredClone(entry.colors ?? {}),
            };
            outfit.selections = resolveDependenciesOnEquip(
                outfit.selections,
                clone.identity.selections,
                entry.slot,
                catalog.item(entry.itemId),
                closetEntries,
                catalog,
            );
        }
    }

    const draft = sourceDraft(clone, catalog);
    draft.select(outfitId);
    draft.reconcileRestActions(outfitId);
    return draft.canonicalize();
}
