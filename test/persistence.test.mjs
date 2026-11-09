import {mockCardMerge} from '../tools/mock-card-merge.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefinition } from '../src/state/defaults.mjs';
import { initializeState, appendChange, reconstruct, MESSAGE_KEY } from '../src/state/history.mjs';
import { createHostStorage } from '../src/adapter/storage.mjs';
import { createContinuity } from '../src/adapter/continuity.mjs';
import { exportCompanion, importCompanion } from '../src/state/packages.mjs';
import { readFile } from 'node:fs/promises';

let counter = 0;
const uuid = () => `${(++counter).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const definition = createDefinition(uuid());
const patch = outfitId => ({ schemaVersion: 1, kind: 'presentation-patch', patch: { outfitId } });
const messages = () => [{ is_user: false, mes: 'First', swipe_id: 0, swipes: ['First', 'Alternative'], swipe_info: [{ extra: {} }, { extra: {} }], extra: {} }];

test('history reconstructs active swipe/delete/branch and preserves separately ordered manual overrides', () => {
    const baseline = initializeState(definition, uuid);
    const evening = appendChange(baseline, messages(), patch('evening'), uuid);
    assert.equal(reconstruct(evening.state, evening.messages).presentation.outfitId, 'evening');
    const alternative = structuredClone(evening.messages);
    alternative[0].swipe_id = 1; alternative[0].extra = alternative[0].swipe_info[1].extra;
    assert.equal(reconstruct(evening.state, alternative).presentation.outfitId, 'everyday');
    const summer = appendChange(evening.state, alternative, patch('summer'), uuid);
    assert.equal(reconstruct(summer.state, summer.messages).presentation.outfitId, 'summer');
    summer.messages[0].swipe_id = 0; summer.messages[0].extra = summer.messages[0].swipe_info[0].extra;
    assert.equal(reconstruct(summer.state, summer.messages).presentation.outfitId, 'evening');
    assert.equal(reconstruct(summer.state, []).presentation.outfitId, 'everyday');
    const changed = structuredClone(definition); changed.identity.hair.paletteId = 'hair.ulpc.blue';
    const replacement = appendChange(summer.state, summer.messages, { schemaVersion: 1, kind: 'companion-replacement', definition: changed, presentation: changed.startingPresentation }, uuid);
    assert.equal(reconstruct(replacement.state, replacement.messages).definition.identity.hair.paletteId, 'hair.ulpc.blue');
    assert.equal(reconstruct(replacement.state, []).definition.identity.hair.paletteId, definition.identity.hair.paletteId);
    const nullAnchor = appendChange(baseline, [], patch('summer'), uuid);
    assert.equal(reconstruct(nullAnchor.state, []).presentation.outfitId, 'summer');
});

test('pending swipes, discarded generation and malformed/oversized histories do not establish accepted changes', () => {
    const applied = appendChange(initializeState(definition, uuid), messages(), patch('evening'), uuid);
    const pending = structuredClone(applied.messages); pending[0].swipe_id = 2;
    assert.equal(reconstruct(applied.state, pending).presentation.outfitId, 'everyday');
    const corrupt = structuredClone(applied.state); corrupt.schemaVersion = 99;
    assert.throws(() => reconstruct(corrupt, applied.messages));
    const full = initializeState(definition, uuid);
    full.history = Array.from({ length: 1000 }, (_, index) => ({ entryId: uuid(), sequence: index + 1, origin: 'manual', response: null, change: patch('everyday') }));
    assert.throws(() => appendChange(full, [], patch('summer'), uuid), /history is full/);
    assert.equal(full.history.length, 1000);
});

function environment() {
    const integrity = uuid();
    const active = { characterAvatar: 'Card.png', characterIndex: 0, chatLocator: 'A', integrity };
    let context = { characterId: 0, groupId: null, characters: [{ avatar: 'Card.png' }], chatId: 'A', getCurrentChatId: () => context.chatId,
        chatMetadata: { integrity }, chat: messages(), getRequestHeaders: () => ({}), getOneCharacter: async () => {} };
    let binding = null;
    const disk = new Map([['A', [{ chat_metadata: { integrity } }, ...structuredClone(context.chat)]]]);
    const extraCards = new Map();
    let fail = false, writes = [], intercept = null, requestHook = null, account = 'user', readbackFailure = false, acknowledgementFailure = false;
    const fetch = async (path, options) => {
        const body = options.body && JSON.parse(options.body);
        if (requestHook) await requestHook(path, body);
        let value;
        if (path === '/api/users/me') value = { handle: account };
        else if (path === '/api/characters/get') value = extraCards.get(body.avatar_url) ?? { avatar: body.avatar_url, data: { extensions: binding ? { lpc_companion: binding } : {} } };
        else if (path === '/api/characters/all') value = [{ avatar: 'Card.png', data: { extensions: binding ? { lpc_companion: binding } : {} } }, ...extraCards.values()];
        else if (path === '/api/characters/chats') value = [...disk].map(([id, rows]) => ({ file_id: id, chat_metadata: rows[0].chat_metadata }));
        else if (path === '/api/chats/get') {
            if (readbackFailure && writes.length) return new Response('unavailable', { status: 500 });
            value = disk.get(body.file_name) ?? [];
        }
        else if (path === '/api/characters/merge-attributes' || path === '/api/chats/save') {
            writes.push({ path, body }); if (intercept) await intercept(path, body);
            if (fail) return new Response('failed', { status: 500 });
            if (path.includes('merge-attributes')) {
                if (extraCards.has(body.avatar)) extraCards.get(body.avatar).data.extensions.lpc_companion = mockCardMerge(extraCards.get(body.avatar).data.extensions.lpc_companion??{},body.data.extensions.lpc_companion);
                else binding = mockCardMerge(binding??{},body.data.extensions.lpc_companion);
            }
            else disk.set(body.file_name, structuredClone(body.chat));
            if (acknowledgementFailure) return new Response('lost acknowledgement', { status: 500 });
            value = { ok: true };
        } else throw Error(path);
        return new Response(JSON.stringify(value), { status: 200 });
    };
    const host = { isGenerating: () => false, isChatSaving: false, cancelDebouncedChatSave() {} };
    const storage = createHostStorage({ getContext: () => context, fetch, host });
    return { active, storage, disk, extraCards, host, getContext: () => context, getBinding: () => binding,
        setContext: value => { context = value; }, setFail: value => { fail = value; }, setIntercept: value => { intercept = value; }, setRequestHook: value => { requestHook = value; }, setAccount: value => { account = value; },
        setReadbackFailure: value => { readbackFailure = value; }, setAcknowledgementFailure: value => { acknowledgementFailure = value; }, writes };
}

test('a completed host edit during the initial save guard cannot be overwritten by an older payload', async () => {
    const env = environment();
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: initializeState(definition, uuid) };
    let entered, release;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    env.setRequestHook(async path => {
        if (path !== '/api/users/me') return;
        env.setRequestHook(null); entered(); await gate;
    });
    // Passing the live array must not let later mutations alter the captured payload.
    const pending = env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null);
    await started;
    env.getContext().chat[0].mes = 'Completed host edit';
    env.disk.get('A')[1].mes = 'Completed host edit';
    release();
    await assert.rejects(pending, /Chat changed/);
    assert.equal(env.writes.length, 0);
    assert.equal(env.disk.get('A')[1].mes, 'Completed host edit');
    assert.equal(env.getContext().chatMetadata.lpc_companion, undefined);
});

test('save payloads reject stale prose and unrelated message/swipe edits but allow owned receipts', async () => {
    for (const change of [
        messages => { messages[0].mes = 'Stale prose'; },
        messages => { messages[0].extra.otherExtension = { lost: true }; },
        messages => { messages[0].swipe_info[0].extra.otherExtension = { lost: true }; },
    ]) {
        const env = environment(), state = initializeState(definition, uuid);
        const result = appendChange(state, env.getContext().chat, patch('summer'), uuid);
        const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: result.state };
        change(result.messages);
        await assert.rejects(env.storage.saveChat(env.active, 'user', record, result.messages, null), /Chat changed before/);
        assert.equal(env.writes.length, 0);
    }
    const env = environment();
    env.getContext().chat[0].extra.otherExtension = { keep: true };
    env.getContext().chat[0].swipe_info[0].extra.otherExtension = { keep: true };
    const result = appendChange(initializeState(definition, uuid), env.getContext().chat, patch('summer'), uuid);
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: result.state };
    await env.storage.saveChat(env.active, 'user', record, result.messages, null);
    assert.deepEqual(env.disk.get('A').slice(1), result.messages);
    assert.deepEqual(env.getContext().chat, result.messages);
    assert.equal(reconstruct(result.state, env.getContext().chat).presentation.outfitId, 'summer');
});

test('acknowledged storage leaves memory and previous disk state intact on rejected writes', async () => {
    const env = environment();
    const state = initializeState(definition, uuid);
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state };
    env.setFail(true);
    await assert.rejects(env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null), /500/);
    assert.equal(env.getContext().chatMetadata.lpc_companion, undefined);
    assert.equal(env.disk.get('A')[0].chat_metadata.lpc_companion, undefined);
    env.setFail(false);
    await env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null);
    assert.deepEqual(env.getContext().chatMetadata.lpc_companion, record);
});

test('captured save targets cannot be redirected by switching between chats of the same character', async () => {
    const env = environment(); let release, started;
    const entered = new Promise(resolve => { started = resolve; });
    env.setIntercept(async path => { if (path === '/api/chats/save') { started(); await new Promise(resolve => { release = resolve; }); } });
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: initializeState(definition, uuid) };
    const saving = env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null);
    await entered;
    const second = { ...env.getContext(), chatId: 'B', getCurrentChatId: () => 'B', chatMetadata: { integrity: uuid() }, chat: [] };
    env.setContext(second); release(); await saving;
    assert.equal(env.writes.at(-1).body.file_name, 'A');
    assert.equal(second.chatMetadata.lpc_companion, undefined);
    assert.ok(env.disk.get('A')[0].chat_metadata.lpc_companion);
    const before = env.writes.length;
    await assert.rejects(env.storage.saveChat(env.active, 'user', record, [], record), /Chat changed/);
    assert.equal(env.writes.length, before);
});

test('defaults are snapshotted once; later defaults do not rewrite an existing chat', async () => {
    const env = environment();
    const continuity = createContinuity({ storage: env.storage, getContext: env.getContext, crypto, isGenerating: () => false });
    await continuity.load(env.active);
    await continuity.commit(env.active, { definition, presentation: definition.startingPresentation, mode: 'replacement' });
    const first = structuredClone(env.getContext().chatMetadata.lpc_companion.state.snapshot);
    const future = structuredClone(definition); future.startingPresentation.outfitId = 'summer';
    await continuity.commit(env.active, { definition: future, presentation: future.startingPresentation, mode: 'defaults' });
    const restored = await continuity.load(env.active);
    assert.deepEqual(restored.state.snapshot, first);
    assert.equal(restored.presentation.outfitId, 'everyday');
    assert.equal(env.getBinding().definition.startingPresentation.outfitId, 'summer');
    const a = env.getContext();
    env.disk.set('B', [{ chat_metadata: { integrity: uuid() } }, ...messages()]);
    const b = { ...a, chatId: 'B', getCurrentChatId: () => 'B', chatMetadata: structuredClone(env.disk.get('B')[0].chat_metadata), chat: messages() };
    env.setContext(b);
    const activeB = { ...env.active, chatLocator: 'B', integrity: b.chatMetadata.integrity };
    const initialized = await continuity.load(activeB);
    assert.equal(initialized.presentation.outfitId, 'summer');
    assert.notEqual(initialized.state.snapshot.chatInstanceId, first.chatInstanceId);
});

test('an unvisited chat copy forks without rotating its source identity', async () => {
    const env = environment();
    const continuity = createContinuity({ storage: env.storage, getContext: env.getContext, crypto });
    await continuity.load(env.active);
    await continuity.commit(env.active, { definition, presentation: definition.startingPresentation, mode: 'replacement' });
    const original = env.getContext().chatMetadata.lpc_companion.state.snapshot.chatInstanceId;
    env.disk.set('Copy', structuredClone(env.disk.get('A')));
    const source = await continuity.load(env.active);
    assert.equal(source.state.snapshot.chatInstanceId, original);
    assert.equal(source.conflict, null);
    const context = env.getContext();
    env.setContext({ ...context, chatId: 'Copy', getCurrentChatId: () => 'Copy', chatMetadata: structuredClone(env.disk.get('Copy')[0].chat_metadata), chat: structuredClone(context.chat) });
    const copy = await continuity.load({ ...env.active, chatLocator: 'Copy' });
    assert.notEqual(copy.state.snapshot.chatInstanceId, original);
    assert.equal(copy.conflict, null);
});

test('copied cards block only the copy; original ownership remains intact', async () => {
    const env = environment(); const continuity = createContinuity({ storage: env.storage, getContext: env.getContext, crypto });
    await continuity.load(env.active);
    await continuity.commit(env.active, { definition, presentation: definition.startingPresentation, mode: 'replacement' });
    const binding = structuredClone(env.getBinding());
    env.extraCards.set('Copy.png', { avatar: 'Copy.png', data: { extensions: { lpc_companion: binding } } });
    assert.equal((await continuity.load(env.active)).conflict, null);
    const integrity = uuid(); env.disk.set('Copy', [{ chat_metadata: { integrity } }, ...messages()]);
    env.setContext({ ...env.getContext(), characters: [{ avatar: 'Copy.png' }], chatId: 'Copy', getCurrentChatId: () => 'Copy', chatMetadata: { integrity }, chat: messages() });
    const active = { ...env.active, characterAvatar: 'Copy.png', chatLocator: 'Copy', integrity };
    const copy = await continuity.load(active);
    assert.match(copy.conflict, /independent companion/);
    const writes = env.writes.length;
    await assert.rejects(continuity.commit(active, { definition, presentation: definition.startingPresentation, mode: 'replacement' }));
    assert.equal(env.writes.length, writes);
    assert.equal(env.getBinding().definition.characterId, binding.definition.characterId);
});

test('explicit null and unknown stored versions are not treated as uninitialized chats', async () => {
    for (const value of [null, { schemaVersion: 99, kind: 'chat-record' }]) {
        const env = environment(); env.disk.get('A')[0].chat_metadata.lpc_companion = value;
        const continuity = createContinuity({ storage: env.storage, getContext: env.getContext, crypto });
        await assert.rejects(continuity.load(env.active), /Unsupported or corrupt/);
        assert.equal(env.writes.length, 0);
        assert.deepEqual(env.disk.get('A')[0].chat_metadata.lpc_companion, value);
    }
});

test('account changes block writes', async () => {
    const env = environment();
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: initializeState(definition, uuid) };
    env.setAccount('other-user');
    await assert.rejects(env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null), /Account changed/);
    assert.equal(env.writes.length, 0);
});

test('active generation rejects manual mutations without creating a default or history entry', async () => {
    const env = environment();
    const continuity = createContinuity({ storage: env.storage, getContext: env.getContext, crypto, isGenerating: () => true });
    await continuity.load(env.active);
    await assert.rejects(continuity.commit(env.active, { definition, presentation: definition.startingPresentation, mode: 'replacement' }), /generation/);
    assert.equal(env.writes.length, 0);
    assert.equal(env.getContext().chatMetadata.lpc_companion, undefined);
});

test('read-back verifies an uncertain acknowledgement, while unavailable verification never reports success', async () => {
    const env = environment();
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: initializeState(definition, uuid) };
    env.setAcknowledgementFailure(true);
    await env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null);
    assert.deepEqual(env.getContext().chatMetadata.lpc_companion, record);
    const unknown = environment(); unknown.setReadbackFailure(true);
    await assert.rejects(unknown.storage.saveChat(unknown.active, 'user', record, unknown.getContext().chat, null), /could not be confirmed/);
    assert.equal(unknown.getContext().chatMetadata.lpc_companion, undefined);
    assert.ok(unknown.disk.get('A')[0].chat_metadata.lpc_companion);
});

test('network rejection before a write preserves the last state and permits an explicit retry', async () => {
    const env = environment();
    const record = { schemaVersion: 1, kind: 'chat-record', ownerAvatar: 'Card.png', ownerChat: 'A', state: initializeState(definition, uuid) };
    env.setIntercept(async () => { throw new TypeError('Network request failed'); });
    await assert.rejects(env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null), /Network/);
    assert.equal(env.disk.get('A')[0].chat_metadata.lpc_companion, undefined);
    assert.equal(env.getContext().chatMetadata.lpc_companion, undefined);
    env.setIntercept(null);
    await env.storage.saveChat(env.active, 'user', record, env.getContext().chat, null);
    assert.ok(env.getContext().chatMetadata.lpc_companion);
});

test('configuration packages validate and rebind locally; generator version-2 import stays distinct', () => {
    const localId = uuid();
    const exported = exportCompanion(definition);
    assert.ok(exported.attribution.items.body.length);
    assert.equal(importCompanion(JSON.stringify(exported), localId).characterId, localId);
    assert.throws(() => importCompanion(JSON.stringify({ ...exported, requiredCatalog: 'unknown' }), localId));
    assert.throws(() => importCompanion('{"schemaVersion":1,"kind":"character"}', localId));
    assert.throws(() => importCompanion('x'.repeat(512001), localId));
});

test('accepted model entries reconcile through swipes and deletion while later manual overrides keep ordering', () => {
    const baseline = initializeState(definition, uuid);
    const model = appendChange(baseline, messages(), patch('summer'), uuid, 'model');
    assert.equal(model.state.history.at(-1).origin, 'model'); assert.ok(model.state.history.at(-1).response);
    const override = appendChange(model.state, model.messages, patch('evening'), uuid);
    assert.equal(reconstruct(override.state, override.messages).presentation.outfitId, 'evening');
    const alternate = structuredClone(override.messages); alternate[0].swipe_id = 1; alternate[0].extra = alternate[0].swipe_info[1].extra;
    assert.equal(reconstruct(override.state, alternate).presentation.outfitId, 'everyday');
    assert.equal(reconstruct(override.state, []).presentation.outfitId, 'everyday');
    assert.throws(() => appendChange(baseline, [], patch('summer'), uuid, 'model'), /accepted assistant response/);
});

test('invalid identity/presentation cannot attach artwork; valid libraries survive defaults and explicit card forks without entering chat history', async () => {
    const env = environment(), continuity = createContinuity({storage:env.storage,getContext:env.getContext,crypto});
    const loaded = await continuity.load(env.active);
    assert.equal(loaded.dock, 'left');
    loaded.dock = 'right';
    assert.equal((await continuity.load(env.active)).dock, 'right');
    loaded.dock = 'left';
    await continuity.commit(env.active,{definition,presentation:definition.startingPresentation,mode:'replacement'});
    const path = 'spritesheets/body/bodies/male/idle.png';
    const embeddedAssets = {[path]:(await readFile(new URL(`../assets/lpc/${path}`,import.meta.url))).toString('base64')};
    const writes = env.writes.length;
    const foreign = {...definition,characterId:uuid()};
    await assert.rejects(continuity.commit(env.active,{definition:foreign,presentation:foreign.startingPresentation,mode:'replacement',embeddedAssets}),/identity differs/);
    await assert.rejects(continuity.commit(env.active,{definition,presentation:{...definition.startingPresentation,moodId:'imaginary'},mode:'replacement',embeddedAssets}),/Invalid presentation/);
    assert.equal(env.writes.length,writes);
    await continuity.commit(env.active,{definition,presentation:definition.startingPresentation,mode:'replacement',embeddedAssets});
    assert.deepEqual(env.getBinding().embeddedAssets,embeddedAssets);
    assert.ok(!JSON.stringify(env.getContext().chatMetadata.lpc_companion).includes('embeddedAssets'));
    await continuity.commit(env.active,{definition,presentation:definition.startingPresentation,mode:'defaults'});
    assert.deepEqual(env.getBinding().embeddedAssets,embeddedAssets);
    const duplicate = structuredClone(env.getBinding()); duplicate.ownerAvatar='Original.png';
    // The selected copied card is intentionally forked; artwork is immutable and retained.
    env.extraCards.set('Original.png',{avatar:'Original.png',data:{extensions:{lpc_companion:duplicate}}});
    env.getBinding().ownerAvatar='Original.png';
    await continuity.load(env.active); await continuity.resolve(env.active,'fork');
    assert.deepEqual(env.getBinding().embeddedAssets,embeddedAssets);
    assert.notEqual(env.getBinding().definition.characterId,definition.characterId);
});
