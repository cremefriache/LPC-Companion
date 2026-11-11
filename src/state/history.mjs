import { validateContract, validateDefinition, validatePresentation } from './validate.mjs';
import { assertStateInvariants } from './invariants.mjs';
import { definitionDigest } from './definition-digest.mjs';

export const MESSAGE_KEY = 'lpc_companion_receipts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const equal = (a, b) => canonical(a) === canonical(b);

export function definitionFromSnapshot(snapshot) {
    const { chatInstanceId, sourceDefinitionRevision, ...rest } = snapshot;
    return { ...rest, kind: 'character-definition', revision: sourceDefinitionRevision };
}
export function createHistoryEngine({
    validateContract,
    validateDefinition,
    validatePresentation,
    assertStateInvariants
}) {
    function initializeState(definition, uuid) {
        const checked = validateDefinition(definition);
        const { revision, ...rest } = checked;
        return {
            schemaVersion: 1,
            kind: 'chat-state',
            snapshot: {
                ...rest,
                kind: 'chat-snapshot',
                chatInstanceId: uuid(),
                sourceDefinitionRevision: revision
            },
            presentation: structuredClone(checked.startingPresentation),
            history: [],
        };
    }
    function receipt(value) {
        if (!value || !UUID.test(value.messageId) || !UUID.test(value.swipeId) || !Array.isArray(value.entries)
            || value.entries.length > 1000 || value.entries.some(id => !UUID.test(id)))
            throw Error('Corrupt companion response receipts. Export a backup before recovery.');
        return value;
    }
    function activeReceipts(messages) {
        const active = new Map();
        for (const message of messages) {
            if (!message || message.is_user || message.is_system) continue;
            if (Number.isInteger(message.swipe_id) && (!message.swipes?.[message.swipe_id] || !message.swipe_info?.[message.swipe_id])) continue;
            const value = message.extra?.[MESSAGE_KEY];
            if (!value) continue;
            const checked = receipt(value);
            const key = `${checked.messageId}:${checked.swipeId}`;
            if (active.has(key)) throw Error('Ambiguous companion response identity.');
            active.set(key, checked.entries);
        }
        return active;
    }
    function reconstruct(state, messages) {
        validateContract(state, 'chatState');
        assertStateInvariants(state);
        let definition = validateDefinition(definitionFromSnapshot(state.snapshot));
        let presentation = structuredClone(definition.startingPresentation);
        let digest;
        const dormantChanges = [], skippedLegacyReplacements = [];
        const active = activeReceipts(messages);
        const entryIds = new Set();
        let sequence = 0;
        for (const entry of state.history) {
            if (entryIds.has(entry.entryId) || entry.sequence <= sequence) throw Error('Corrupt companion history order.');
            entryIds.add(entry.entryId);
            sequence = entry.sequence;
            // Validate even inactive entries; stored values are never trusted.
            if (entry.change.kind === 'companion-replacement') {
                validateDefinition(entry.change.definition);
                if (entry.change.definition.characterId !== state.snapshot.characterId) throw Error('History belongs to another character.');
                validatePresentation(entry.change.definition, entry.change.presentation, entry.change.presentation);
            }
            const accepted = entry.response === null || active.get(`${entry.response.messageId}:${entry.response.swipeId}`)
                ?.includes(entry.entryId);
            if (!accepted) {
                if (entry.change.kind === 'companion-replacement' && entry.change.schemaVersion === 1) skippedLegacyReplacements.push(entry.change);
                continue;
            }
            if (entry.change.kind === 'presentation-patch' && entry.change.schemaVersion !== definition.schemaVersion) {
                dormantChanges.push(entry.entryId);
                continue;
            }
            if (entry.change.kind === 'presentation-patch' && entry.change.definitionHash && entry.change.definitionHash !== (digest ??= definitionDigest(definition))) {
                dormantChanges.push(entry.entryId);
                continue;
            }
            if (entry.change.kind === 'companion-replacement') {
                definition = validateDefinition(entry.change.definition);
                presentation = structuredClone(entry.change.presentation);
                digest = undefined;
            } else {
                try {
                    presentation = validatePresentation(definition, presentation, entry.change.patch);
                } catch (error) {
                    // Older curated patches have no definition binding. Only a preceding,
                    // validated skipped replacement can explain their incompatibility.
                    // Adapter patches contain complete presentations; for old sparse patches
                    // the original inherited presentation is unknown, so also try that
                    // replacement's saved presentation. Never guess new selections.
                    const legacy = entry.change.schemaVersion === 1 && !entry.change.definitionHash && definition.schemaVersion === 1;
                    const supported = legacy && skippedLegacyReplacements.some(change => [presentation, change.presentation]
                        .some(base => {
                        try {
                            validatePresentation(change.definition, base, entry.change.patch);
                            return true;
                        } catch {
                            return false;
                        }
                    }));
                    if (!supported) throw error;
                    dormantChanges.push(entry.entryId);
                }
            }
        }
        return {
            definition,
            presentation,
            ...(dormantChanges.length ? { dormantChanges } : {})
        };
    }

    function appendChange(state, messages, change, uuid, origin = 'manual', responseIndex) {
        if (change.kind === 'presentation-patch' && (change.schemaVersion === 2 || state.snapshot.schemaVersion === 2
            || state.history.some(e => e.change.definition?.schemaVersion === 2))) {
            change = {
                ...change,
                definitionHash: definitionDigest(reconstruct(state, messages).definition)
            };
        }
        validateContract(change, change.kind === 'companion-replacement' ? 'companionReplacement' : 'presentationPatch');
        if (state.history.length >= 1000)
            throw Error('Companion history is full (1,000 entries). Export a backup and continue in a new chat; no history was discarded.');
        // Historical compatibility witnesses must not authorize a new invalid request.
        if (change.kind === 'presentation-patch' && change.schemaVersion === 1 && !change.definitionHash) {
            const accepted = reconstruct(state, messages);
            if (accepted.definition.schemaVersion === 1)
                validatePresentation(accepted.definition, accepted.presentation, change.patch);
        }
        const next = structuredClone(state);
        const chat = structuredClone(messages);
        const entryId = uuid();
        let response = null;
        const target = responseIndex === undefined ? chat.findLast(message => message && !message.is_user && !message.is_system
            && typeof message.mes === 'string' && message.mes.trim()) : chat[responseIndex];
        if (responseIndex !== undefined && (!Number.isInteger(responseIndex) || responseIndex < 0 || !target || target.is_user
            || target.is_system || typeof target.mes !== 'string' || !target.mes.trim()))
            throw Error('An explicit model response anchor must be an accepted assistant message.');
        if (target) {
            const previous = target.extra?.[MESSAGE_KEY];
            const value = previous ? structuredClone(receipt(previous)) : { messageId: uuid(), swipeId: uuid(), entries: [] };
            value.entries = [...new Set([...value.entries, entryId])];
            target.extra = { ...target.extra, [MESSAGE_KEY]: value };
            if (Number.isInteger(target.swipe_id) && Array.isArray(target.swipes)) {
                target.swipe_info ??= target.swipes.map(() => ({ extra: {} }));
                target.swipe_info[target.swipe_id] ??= { extra: {} };
                const swipe = target.swipe_info[target.swipe_id];
                swipe.extra = { ...swipe.extra, [MESSAGE_KEY]: structuredClone(value) };
            }
            response = { messageId: value.messageId, swipeId: value.swipeId };
        } else if (origin === 'model') throw Error('Model changes require an accepted assistant response.');
        next.history.push({
            entryId,
            sequence: (next.history.at(-1)?.sequence ?? 0) +1,
            origin,
            response,
            change: structuredClone(change)
        });
        const result = reconstruct(next, chat);
        next.presentation = result.presentation;
        return { state: next, messages: chat, ...result };
    }

    return { initializeState, reconstruct, appendChange };
}
const defaultHistory = createHistoryEngine({
    validateContract,
    validateDefinition,
    validatePresentation,
    assertStateInvariants
});
export const { initializeState, reconstruct, appendChange } = defaultHistory;
