import { matchesResponse } from '../state/model-contract.mjs';
import { STATE_KEY, readChatContext } from './context.mjs';
import { sessionKey } from './session.mjs';
import { makeUuid } from '../state/uuid.mjs';
import {
    validateContract as defaultValidateContract,
    validateDefinition as defaultValidateDefinition,
    validatePresentation as defaultValidatePresentation
} from '../state/validate.mjs';
import {
    appendChange as defaultAppendChange,
    definitionFromSnapshot,
    equal,
    initializeState as defaultInitializeState,
    reconstruct as defaultReconstruct
} from '../state/history.mjs';
import { validateEmbeddedAssets as defaultValidateEmbeddedAssets } from '../state/portable-assets.mjs';
import { createWorkQueue } from './work-queue.mjs';
import { assertLoadedCompanionHeaders } from './companion-headers.mjs';
import { validateRoster as defaultValidateRoster } from '../state/roster.mjs';

export function createContinuity({
    storage,
    getContext,
    crypto,
    isGenerating = () => false,
    queue = createWorkQueue(),
    contracts
}) {
    const validateContract = contracts?.validateContract ?? defaultValidateContract;
    const validateDefinition = contracts?.validateDefinition ?? defaultValidateDefinition;
    const validatePresentation = contracts?.validatePresentation ?? defaultValidatePresentation;
    const validateEmbeddedAssets = contracts?.validateEmbeddedAssets ?? defaultValidateEmbeddedAssets;
    const validateRoster = contracts?.validateRoster ?? defaultValidateRoster;
    const initializeState = contracts?.initializeState ?? defaultInitializeState;
    const reconstruct = contracts?.reconstruct ?? defaultReconstruct;
    const appendChange = contracts?.appendChange ?? defaultAppendChange;
    const records = new Map();
    const renames = new Set();
    let cachedAccount = null, currentDock = 'left';
    const uuid = () => makeUuid(crypto);
    const key = active => sessionKey(active);
    const wrap = (active, state) => ({
        schemaVersion: 1,
        kind: 'chat-record',
        ownerAvatar: active.characterAvatar,
        ownerChat: active.chatLocator,
        state
    });
    const lock = task => queue.run(task);
    function load(active, options = {}) {
        return lock(() => loadImpl(active, options));
    }
    async function loadImpl(active, options = {}) {
        const account = await storage.account();
        if (cachedAccount !== account) {
            records.clear();
            renames.clear();
            cachedAccount = account;
        }
        storage.contextFor(active);
        const card = await storage.readCard(active.characterAvatar);
        const hasBinding = Object.hasOwn(card.data?.extensions ?? {}, STATE_KEY);
        let binding = hasBinding ? card.data.extensions[STATE_KEY] : null;
        if (hasBinding) validateContract(binding, 'characterBinding');
        const expectedBinding = structuredClone(binding);
        const rows = await storage.chats(active.characterAvatar);
        if (!rows.some(row => row.file_id === active.chatLocator))
            throw Error('The active chat file is missing. Wait for the host to save it before initializing a companion.');
        const disk = await storage.readChat(active.characterAvatar, active.chatLocator);
        if (!Array.isArray(disk) || disk[0]?.chat_metadata?.integrity !== active.integrity)
            throw Error('Chat is not ready on disk. Wait for the host to finish saving, then retry.');
        const hasRecord = Object.hasOwn(disk[0].chat_metadata, STATE_KEY);
        let raw = hasRecord ? disk[0].chat_metadata[STATE_KEY] : null;
        if (hasRecord) validateContract(raw, 'chatRecord');
        if (Object.hasOwn(disk[0].chat_metadata, 'lpc_companion_roster'))
            validateRoster(disk[0].chat_metadata.lpc_companion_roster, disk[0].chat_metadata[STATE_KEY]?.state);
        assertLoadedCompanionHeaders(disk[0].chat_metadata, getContext().chatMetadata);
        let conflict = null;
        if (binding) {
            validateContract(binding, 'characterBinding');
            validateDefinition(binding.definition);
            const all = await storage.cards();
            const collisions = all.filter(value => value.avatar !== active.characterAvatar && value.data?.extensions?.[STATE_KEY]
                ?.definition?.characterId === binding.definition.characterId);
            const ownsIdentity = binding.ownerAvatar === active.characterAvatar || renames.has(`card:${binding.ownerAvatar}:${active.characterAvatar}`);
            const knownOwners = new Set([binding.ownerAvatar, ...binding.previousAvatars]);
            const independentlyOwnedCollision = collisions.some(card => {
                const other = card.data.extensions[STATE_KEY];
                return !knownOwners.has(other.ownerAvatar) || other.ownerAvatar === card.avatar;
            });
            if (collisions.length && (!ownsIdentity || independentlyOwnedCollision))
                conflict = 'This card shares a companion identity with another card. Create an independent companion for this copy.';
            else if (binding.ownerAvatar !== active.characterAvatar) {
                if (!renames.has(`card:${binding.ownerAvatar}:${active.characterAvatar}`))
                    conflict = 'This card moved without a verified rename event. Confirm whether to retain its companion identity.';
                else
                    binding = {
                        ...binding,
                        ownerAvatar: active.characterAvatar,
                        previousAvatars: [...new Set([...binding.previousAvatars, binding.ownerAvatar])].slice(-32)
                    };
            }
        }
        let state = raw?.state ?? null;
        let needsSave = false;
        if (raw) {
            validateContract(raw, 'chatRecord');
            if (!binding || raw.state.snapshot.characterId !== binding.definition.characterId)
                conflict ??= 'This chat belongs to another companion identity. Start an independent chat snapshot before editing.';
            if (binding && raw.ownerAvatar !== active.characterAvatar && !binding.previousAvatars.includes(raw.ownerAvatar)
                && !renames.has(`card:${raw.ownerAvatar}:${active.characterAvatar}`))
                conflict ??= 'Chat character ownership is ambiguous. Confirm the character rename before editing.';
            if (raw.ownerChat !== active.chatLocator) {
                const original = rows.find(row => row.file_id === raw.ownerChat);
                if (original) {
                    state = structuredClone(state);
                    state.snapshot.chatInstanceId = uuid();
                    needsSave = true;
                } else if (renames.has(`chat:${active.characterAvatar}:${raw.ownerChat}:${active.chatLocator}`)) needsSave = true;
                else
                    conflict ??= 'This chat moved without a verified rename event. Confirm whether to retain its snapshot.';
            }
            // The source retains its ID while an unvisited copy still names it as owner.
            if (rows.some(row => row.file_id !== active.chatLocator && row.chat_metadata?.[STATE_KEY]?.state?.snapshot?.chatInstanceId === state.snapshot.chatInstanceId
                && row.chat_metadata?.[STATE_KEY]?.ownerChat === row.file_id)) {
                conflict ??= 'Two independently owned chats share one companion identity. Export a backup before explicit recovery.';
            }
        } else if (binding && !conflict) {
            state = initializeState(binding.definition, uuid);
            needsSave = true;
        }
        let definition = null,
            presentation = null,
            dormantChanges = [];
        await storage.guard(active, account);
        if (state && !conflict) {
            const result = reconstruct(state, getContext().chat);
            definition = result.definition;
            presentation = result.presentation;
            dormantChanges = result.dormantChanges ?? [];
            needsSave ||= !equal(state.presentation, presentation);
            state = { ...state, presentation };
            needsSave ||= raw?.ownerAvatar !== active.characterAvatar || raw?.ownerChat !== active.chatLocator;
        }
        const previous = records.get(key(active));
        const record = {
            account,
            binding,
            expectedBinding,
            raw,
            state,
            definition,
            presentation,
            defaults: binding?.definition ?? null,
            initial: state ? definitionFromSnapshot(state.snapshot) : null,
            conflict,
            needsSave,
            dormantChanges,
            paused: previous?.paused ?? false,
            minimized: previous?.minimized
        };
        Object.defineProperty(
            record,
            'dock',
            {
                get: () => currentDock,
                set: value => {
                    if (['left', 'right', 'inline'].includes(value)) currentDock = value;
                },
                enumerable: true,
                configurable: true,
            }
        );
        records.delete (key(active));
        records.set(key(active), record);
        while (records.size > 64) records.delete (records.keys().next().value);
        return record;
    }
    async function commit(active, candidate, current = () => true) {
        return lock(async () => {
            const record = records.get(key(active));
            if (!record) throw Error('Reload companion state before saving.');
            if (record.conflict) throw Error(record.conflict);
            if (isGenerating() && candidate.mode !== 'restore' && candidate.mode !== 'preview')
                throw Error('Wait for generation to finish before changing the companion.');
            await storage.guard(active, record.account, current);
            const definition = validateDefinition(candidate.definition);
            candidate = {
                ...candidate,
                presentation: validatePresentation(definition, definition.startingPresentation, candidate.presentation)
            };
            const mode = candidate.mode ?? 'presentation';
            if (mode === 'preview') return { definition, presentation: candidate.presentation };
            const chat = getContext().chat;
            if (candidate.origin === 'model' && (mode !== 'presentation' || !matchesResponse(chat, candidate.response)
                || !equal(record.definition, candidate.expectedDefinition ?? definition) || !equal(record.definition.identity,
                definition.identity) || record.definition.characterId !== definition.characterId))
                throw Error('The accepted model response or companion definition changed.');
            const pendingSwipe = chat.some(message => Number.isInteger(message.swipe_id) && (!message.swipes?.[message.swipe_id]
                || !message.swipe_info?.[message.swipe_id]));
            if (mode === 'restore' && (isGenerating() || pendingSwipe)) return { definition, presentation: candidate.presentation };
            let binding = record.binding;
            if (binding && mode !== 'defaults' && mode !== 'both' && definition.characterId !== binding.definition.characterId) throw Error('Companion identity differs from this card.');
            const suppliedAssets = candidate.embeddedAssets === undefined ? {} : validateEmbeddedAssets(candidate.embeddedAssets);
            const embeddedAssets = validateEmbeddedAssets({ ...binding?.embeddedAssets, ...suppliedAssets });
            const addingArtwork = !equal(embeddedAssets, binding?.embeddedAssets ?? {});
            const creatingDefaults = !binding;
            if (binding && !equal(binding, record.expectedBinding)) {
                await storage.saveCard(active, record.account, binding, record.expectedBinding, current);
                record.expectedBinding = structuredClone(binding);
            }
            if (!binding && mode === 'presentation') throw Error('Apply companion setup before saving wardrobe changes.');
            if (!binding || mode === 'defaults' || mode === 'both' || !equal(embeddedAssets, binding.embeddedAssets
                ?? {})) {
                const assetsOnly = binding && mode !== 'defaults' && mode !== 'both';
                if (binding && !assetsOnly) {
                    definition.characterId = binding.definition.characterId;
                    definition.revision = binding.definition.revision +1;
                }
                binding = {
                    schemaVersion: 1,
                    kind: 'character-binding',
                    ownerAvatar: active.characterAvatar,
                    previousAvatars: binding?.previousAvatars ?? [],
                    definition: assetsOnly ? binding.definition : validateDefinition(definition),
                    ...(Object.keys(embeddedAssets).length ? { embeddedAssets } : {})
                };
                await storage.saveCard(active, record.account, binding, record.expectedBinding, current);
                record.binding = record.expectedBinding = structuredClone(binding);
                record.defaults = binding.definition;
                if (mode === 'defaults')
                    return {
                        definition: record.definition,
                        presentation: record.presentation,
                        defaultsOnly: true
                    };
            }
            if (definition.characterId !== binding.definition.characterId) throw Error('Companion identity differs from this card.');
            let state = record.state ?? initializeState(definition, uuid);
            let messages = structuredClone(getContext().chat);
            let result = reconstruct(state, messages);
            if (mode === 'replacement' || mode === 'both' || !equal(result.definition, definition)) {
                result = appendChange(
                    state,
                    messages,
                    {
                        schemaVersion: definition.schemaVersion,
                        kind: 'companion-replacement',
                        definition,
                        presentation: candidate.presentation
                    },
                    uuid,
                    candidate.origin === 'model' ? 'model' : 'manual'
                );
                state = result.state;
                messages = result.messages;
            } else if (mode !== 'restore' && !equal(result.presentation, candidate.presentation)) {
                result = appendChange(
                    state,
                    messages,
                    {
                        schemaVersion: definition.schemaVersion,
                        kind: 'presentation-patch',
                        patch: candidate.presentation
                    },
                    uuid,
                    candidate.origin === 'model' ? 'model' : 'manual'
                );
                state = result.state;
                messages = result.messages;
            }
            state = { ...state, presentation: result.presentation };
            const next = wrap(active, state);
            try {
                if (!equal(next, record.raw) || !equal(messages, getContext().chat))
                    await storage.saveChat(active, record.account, next, messages, record.raw, current);
            } catch (error) {
                if (creatingDefaults)
                    throw Error(`Character defaults were saved, but chat initialization was not confirmed. Reload companion state to recover. ${error.message}`);
                if (addingArtwork)
                    throw Error(`Artwork was saved on the character card, but the chat appearance was not confirmed. Retry or reload companion state. ${error.message}`);
                throw error;
            }
            record.raw = next;
            record.state = state;
            record.definition = result.definition;
            record.presentation = result.presentation;
            record.needsSave = false;
            record.dormantChanges = result.dormantChanges ?? [];
            return result;
        });
    }
    async function resolve(active, choice) {
        return lock(
            async () => {
                const record = records.get(key(active));
                if (!record?.conflict) return;
                await storage.guard(active, record.account);
                if (choice === 'fork') {
                    const definition = validateDefinition(record.defaults);
                    const keepCardIdentity = record.binding.ownerAvatar === active.characterAvatar && record.conflict.startsWith('This chat belongs to another companion');
                    if (!keepCardIdentity) {
                        definition.characterId = uuid();
                        definition.revision = 1;
                    }
                    const binding = {
                        schemaVersion: 1,
                        kind: 'character-binding',
                        ownerAvatar: active.characterAvatar,
                        previousAvatars: [],
                        definition,
                        ...(record.binding.embeddedAssets ? { embeddedAssets: record.binding.embeddedAssets }
                            : {})
                    };
                    if (!keepCardIdentity)
                        await storage.saveCard(active, record.account, binding, record.expectedBinding);
                    // Keep previous chat data intact; explicit adoption uses a replacement snapshot.
                    const state = initializeState(definition, uuid);
                    const next = wrap(active, state);
                    await storage.saveChat(active, record.account, next, getContext().chat, record.raw);
                } else if (choice === 'rename') {
                    if (record.binding.ownerAvatar !== active.characterAvatar) {
                        const all = await storage.cards();
                        if (all.some(card => card.avatar === record.binding.ownerAvatar))
                            throw Error('The original card still exists. Use an independent companion for this copy.');
                        const binding = {
                            ...record.binding,
                            ownerAvatar: active.characterAvatar,
                            previousAvatars: [...new Set([...record.binding.previousAvatars, record.binding.ownerAvatar])]
                                .slice(-32)
                        };
                        await storage.saveCard(active, record.account, binding, record.expectedBinding);
                    }
                    if (record.raw) {
                        const rows = await storage.chats(active.characterAvatar);
                        if (record.raw.ownerChat !== active.chatLocator && rows.some(row => row.file_id === record.raw.ownerChat))
                            throw Error('The source chat still exists. Reopen the copy to fork it.');
                        await storage.saveChat(
                            active,
                            record.account,
                            wrap(active, record.raw.state),
                            getContext().chat,
                            record.raw
                        );
                    }
                } else throw Error('Unknown identity recovery choice.');
            }
        );
    }
    return {
        get: active => records.get(key(active)),
        create: async active => {
            const account = await storage.account();
            const cached = records.get(key(active));
            return cached?.account === account ? cached : load(active);
        },
        load,
        commit,
        resolve,
        whenIdle: queue.whenIdle,
        beginGeneration(type) {
            if (type !== 'swipe' || !readChatContext(getContext())) return;
            const message = getContext().chat.at(-1);
            if (message?.extra && Number.isInteger(message.swipe_id) && !message.swipe_info?.[message.swipe_id]) delete message.extra.lpc_companion_receipts;
        },
        async backup(active) {
            const handle = await storage.account();
            storage.contextFor(active);
            const card = await storage.readCard(active.characterAvatar, { prepare: false });
            const chat = await storage.readChat(active.characterAvatar, active.chatLocator, { prepare: false });
            await storage.guard(active, handle);
            return {
                schemaVersion: 1,
                kind: 'companion-backup',
                character: card.data?.extensions?.[STATE_KEY] ?? null,
                chat: chat[0]?.chat_metadata?.[STATE_KEY] ?? null
            };
        },
        noteRename(kind, ...values) {
            renames.add(`${kind}:${values.join(':')}`);
        },
    };
}
