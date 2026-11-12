import { readRosterContext, rosterKey, groupLocator, groupFileKey, ROSTER_KEY } from './roster-context.mjs';
import { equal, MESSAGE_KEY } from '../state/history.mjs';
import { validateRoster as defaultValidateRoster } from '../state/roster.mjs';
import { assertLoadedCompanionHeaders, captureCompanionChatSave } from './companion-headers.mjs';

/** Group chat files are global to an account; verify their unique group owner. */
export function createRosterStorage({
    getContext,
    fetch,
    host,
    primaryStorage,
    prepareData = async () => {},
    contracts
}) {
    const validateRoster = contracts?.validateRoster ?? defaultValidateRoster;
    async function request(path, body, prepare = true) {
        const response = await fetch(path, {
            method: 'POST',
            headers: getContext().getRequestHeaders(),
            cache: 'no-store',
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok)
            throw Error(`Roster storage failed (${response.status}). Reload or retry; no success was reported.`);
        const value = await response.json();
        if (prepare) await prepareData(value);
        return value;
    }
    function contextFor(active) {
        const current = readRosterContext(getContext());
        if (!current || rosterKey(current) !== rosterKey(active))
            throw Error('Companion roster context changed. Reload before updating.');
        return getContext();
    }
    async function groups() {
        const values = await request('/api/groups/all', {});
        if (!Array.isArray(values) || values.length > 2000) throw Error('Cannot verify group ownership.');
        return values;
    }
    async function listing(active, withMetadata = false) {
        if (active.kind === 'character') return primaryStorage.chats(active.ownerId);
        const all = await groups(),
            group = all.find(value => String(value.id) === active.ownerId);
        if (!group || !Array.isArray(group.chats) || group.chats.length > 2000 || !group.chats.every(groupLocator)
            || !Array.isArray(group.members) || !equal([...group.members].sort(), active.members) || group.chat_id !== active.chatLocator)
            throw Error('Group membership or active chat changed on the host. Reload before editing.');
        const ids = [...new Set([...group.chats, group.chat_id])];
        if (new Set(ids.map(groupFileKey)).size !== ids.length)
            throw Error('Group chat identifiers differ only by case or normalization. Resolve the ambiguous file ownership first.');
        for (const other of all)
            if (!groupLocator(String(other.id)) || !groupLocator(other.chat_id) || !Array.isArray(other.chats)
                || other.chats.length > 2000 || !other.chats.every(groupLocator))
                throw Error('Unsupported group chat filename. Physical file ownership cannot be safely verified.');
        if (!ids.includes(active.chatLocator)) throw Error('Group does not own this chat.');
        for (const id of ids)
            if (all.some(other => String(other.id) !== active.ownerId && [other.chat_id, ...other.chats].some(value => groupFileKey(value) === groupFileKey(id))))
                throw Error('A group chat file is claimed by multiple groups. No writes are allowed until ownership is resolved.');
        if (!withMetadata) return ids.map(file_id => ({ file_id }));
        if (ids.length > 64)
            throw Error('Group roster identity verification supports at most 64 chat files per group. Export a backup and use a smaller group; no partial listing was accepted.');
        const rows = [], started = Date.now();
        for (let i = 0; i < ids.length; i += 8) {
            if (Date.now() -started > 15000) throw Error('Group chat identity verification timed out.');
            rows.push(...await Promise.all(ids.slice(i, i +8).map(async id => {
                const disk = await request('/api/chats/group/get', { id });
                return {
                    file_id: id,
                    chat_metadata: Array.isArray(disk) ? disk[0]?.chat_metadata : undefined
                };
            })));
        }
        return rows;
    }
    async function guard(active, account, current = () => true) {
        contextFor(active);
        if (!current()) throw Error('Roster request superseded.');
        if (await primaryStorage.account() !== account) throw Error('Account changed. Reload the roster.');
        contextFor(active);
        if (active.kind === 'group') await listing(active);
        contextFor(active);
        if (!current()) throw Error('Roster request superseded.');
    }
    async function waitForHostSave() {
        const started = Date.now();
        while (host.isChatSaving && Date.now() -started < 10000) await new Promise(resolve => setTimeout(resolve,
            15));
    }
    const readChat = async (active, { prepare = true } = {}) => {
        if (host.isChatSaving) await waitForHostSave();
        return active.kind === 'group' ? request('/api/chats/group/get', { id: active.chatLocator }, prepare)
            : primaryStorage.readChat(active.ownerId, active.chatLocator, { prepare });
    };
    async function read(active, { metadata = false, prepare = true } = {}) {
        contextFor(active);
        const rows = await listing(active, metadata);
        if (!rows.some(row => row.file_id === active.chatLocator))
            throw Error('The roster chat file is missing. Wait for host saving, then retry.');
        const disk = await readChat(active, { prepare });
        if (!Array.isArray(disk) || disk[0]?.chat_metadata?.integrity !== active.integrity)
            throw Error('The roster chat is not fully saved on disk. Wait for the host, then reload.');
        return { disk, rows };
    }
    async function save(active, account, roster, messages, expected, current = () => true) {
        validateRoster(roster);
        if (roster.ownerKind !== active.kind || roster.ownerId !== active.ownerId || roster.ownerChat !== active.chatLocator) throw Error('Roster save target does not own this data.');
        const snapshot = captureCompanionChatSave(contextFor(active), messages),
            beforeMessages = snapshot.beforeMessages,
            beforeMetadata = snapshot.beforeMetadata;
        messages = snapshot.messages;
        await guard(active, account, current);
        if (host.isChatSaving) await waitForHostSave();
        if (host.isGenerating() || host.isChatSaving)
            throw Error('Wait for generation and host saving before editing companions.');
        const { disk } = await read(active);
        validateRoster(roster, disk[0].chat_metadata.lpc_companion?.state);
        assertLoadedCompanionHeaders(disk[0].chat_metadata, beforeMetadata);
        if (Object.hasOwn(disk[0].chat_metadata, ROSTER_KEY) !== (expected !== null) || !equal(disk[0].chat_metadata[ROSTER_KEY]
            ?? null, expected)) throw Error('Roster changed elsewhere. Reload before saving.');
        await guard(active, account, current);
        if (host.isChatSaving) await waitForHostSave();
        const latest = contextFor(active);
        if (host.isGenerating() || host.isChatSaving || !equal(latest.chat, beforeMessages) || !equal(latest.chatMetadata,
            beforeMetadata)) throw Error('Chat changed while preparing the roster save.');
        host.cancelDebouncedChatSave();
        const metadata = { ...beforeMetadata, [ROSTER_KEY]: roster };
        let failure;
        try {
            await request(active.kind === 'group' ? '/api/chats/group/save' : '/api/chats/save', active.kind === 'group'
                ? {
                id: active.chatLocator,
                chat: [
                    { chat_metadata: metadata, user_name: 'unused', character_name: 'unused' },
                    ...messages
                ]
            } : {
                avatar_url: active.ownerId,
                file_name: active.chatLocator,
                chat: [
                    { chat_metadata: metadata, user_name: 'unused', character_name: 'unused' },
                    ...messages
                ]
            });
        } catch (error) {
            failure = error;
        }
        const stored = await readChat(active).catch (() => null);
        if (!Array.isArray(stored) || !equal(stored[0]?.chat_metadata, metadata) || !equal(stored.slice(1), messages))
            throw failure ?? Error('Roster save could not be confirmed. Reload to recover.');
        const now = readRosterContext(getContext());
        if (now && rosterKey(now) === rosterKey(active) && await primaryStorage.account() === account) {
            const context = contextFor(active);
            if (!equal(context.chat, beforeMessages) || !equal(context.chatMetadata, beforeMetadata))
                throw Error('Chat changed during the roster save. Reload to reconcile.');
            context.chatMetadata[ROSTER_KEY] = structuredClone(roster);
            for (let i = 0; i < context.chat.length; i++) {
                const receipt = messages[i]?.extra?.[MESSAGE_KEY];
                if (!receipt) continue;
                if (!context.chat[i].extra || typeof context.chat[i].extra !== 'object') context.chat[i].extra = {};
                context.chat[i].extra[MESSAGE_KEY] = structuredClone(receipt);
                const index = context.chat[i].swipe_id,
                    swipe = context.chat[i].swipe_info?.[index],
                    value = messages[i]?.swipe_info?.[index]?.extra?.[MESSAGE_KEY];
                if (swipe && value) {
                    if (!swipe.extra || typeof swipe.extra !== 'object') swipe.extra = {};
                    swipe.extra[MESSAGE_KEY] = structuredClone(value);
                }
            }
        }
        return roster;
    }
    return {
        contextFor,
        guard,
        listing,
        read,
        readChat,
        save,
        account: primaryStorage.account,
        cards: primaryStorage.cards,
        readCard: primaryStorage.readCard
    };
}
