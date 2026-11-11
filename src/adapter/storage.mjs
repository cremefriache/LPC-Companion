import { readChatContext, STATE_KEY } from './context.mjs';
import { sessionKey } from './session.mjs';
import { equal, MESSAGE_KEY } from '../state/history.mjs';
import { validateContract as defaultValidateContract } from '../state/validate.mjs';
import { assertLoadedCompanionHeaders, captureCompanionChatSave } from './companion-headers.mjs';
import { validateRoster as defaultValidateRoster } from '../state/roster.mjs';
import {cardNamespacePatch} from './card-namespace-patch.mjs';

const locator = value => typeof value === 'string' && value.length > 0 && value.length <= 255 && value !== '.' && value !== '..' && !/[\\/\0]/.test(value);

/** Explicit captured targets, acknowledged writes and read-back. Never force-save. */
export function createHostStorage({ getContext, fetch, host, synchronizeCard = () => {}, prepareData=async()=>{}, contracts }) {
    const validateContract = contracts?.validateContract ?? defaultValidateContract;
    const validateRoster = contracts?.validateRoster ?? defaultValidateRoster;
    async function request(path, body, method = 'POST', prepare = true) {
        const context = getContext();
        const response = await fetch(path, { method, headers: context.getRequestHeaders(), cache: 'no-store',
            ...(method === 'GET' ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error(`Companion storage request failed (${response.status}). Retry after checking the connection.`);
        const text = await response.text();
        let parsed;try { parsed=JSON.parse(text); } catch { return text; }
        if(prepare)await prepareData(parsed);return parsed;
    }
    async function account() {
        const user = await request('/api/users/me', undefined, 'GET');
        if (!user || typeof user.handle !== 'string' || !user.handle) throw Error('Authenticated account is unavailable.');
        return user.handle;
    }
    function contextFor(active) {
        const current = readChatContext(getContext());
        if (!current || sessionKey(current) !== sessionKey(active)) throw Error('Chat changed before the companion update. Return to the original chat and retry.');
        if (!locator(active.characterAvatar) || !locator(active.chatLocator)) throw Error('Unsupported host locator. No companion data was written.');
        return getContext();
    }
    async function guard(active, handle, current = () => true) {
        contextFor(active);
        if (!current()) throw Error('Companion update was superseded.');
        if (await account() !== handle) throw Error('Account changed. Reload before updating the companion.');
        contextFor(active);
        if (!current()) throw Error('Companion update was superseded.');
    }
    async function waitForHostSave() {
        const started = Date.now();
        while (host.isChatSaving && Date.now() - started < 10000) {
            await new Promise(resolve => setTimeout(resolve, 15));
        }
    }
    const readCard = (avatar,{prepare=true}={}) => request('/api/characters/get', { avatar_url: avatar },'POST',prepare);
    const readChat = async (avatar, chat,{prepare=true}={}) => {
        if (host.isChatSaving) await waitForHostSave();
        return request('/api/chats/get', { avatar_url: avatar, file_name: chat },'POST',prepare);
    };
    async function cards() {
        const rows = await request('/api/characters/all', {},'POST',false);
        if (!Array.isArray(rows) || rows.length > 2000) throw Error('Cannot safely verify character identity in this account.');
        const result = [];
        const started = Date.now();
        for (let i = 0; i < rows.length; i += 8) {
            if (Date.now() - started > 15000) throw Error('Character identity verification timed out. Retry when the host is responsive.');
            const batch = rows.slice(i, i + 8);
            if (batch.some(row => !locator(row.avatar))) throw Error('Unsupported character locator.');
            result.push(...await Promise.all(batch.map(row => row.shallow ? readCard(row.avatar,{prepare:false}) : row)));
        }
        return result;
    }
    async function chats(avatar) {
        if (host.isChatSaving) await waitForHostSave();
        const rows = await request('/api/characters/chats', { avatar_url: avatar, metadata: true });
        if (!Array.isArray(rows) || rows.length > 2000) throw Error('Cannot safely verify chat identity.');
        return rows;
    }
    async function saveCard(active, handle, binding, expected, current) {
        validateContract(binding, 'characterBinding');
        await guard(active, handle, current);
        const loadedChat=await readChat(active.characterAvatar,active.chatLocator);
        if(!Array.isArray(loadedChat)||loadedChat[0]?.chat_metadata?.integrity!==active.integrity)throw Error('Reload the host chat before changing companion defaults.');
        if(Object.hasOwn(loadedChat[0].chat_metadata,'lpc_companion_roster'))validateRoster(loadedChat[0].chat_metadata.lpc_companion_roster,loadedChat[0].chat_metadata[STATE_KEY]?.state);
        assertLoadedCompanionHeaders(loadedChat[0].chat_metadata,contextFor(active).chatMetadata);
        const before = await readCard(active.characterAvatar);
        if (Object.hasOwn(before.data?.extensions ?? {}, STATE_KEY) !== (expected !== null)
            || !equal(before.data?.extensions?.[STATE_KEY] ?? null, expected ?? null)) throw Error('Character defaults changed elsewhere. Reload before saving.');
        await guard(active, handle, current);
        const patch=cardNamespacePatch(before.data?.extensions?.[STATE_KEY],binding);
        let failure;
        try { await request('/api/characters/merge-attributes', { avatar: active.characterAvatar, data: { extensions: { [STATE_KEY]: patch } } }); }
        catch (error) { failure = error; }
        const stored = await readCard(active.characterAvatar).catch(() => null);
        if (!equal(stored?.data?.extensions?.[STATE_KEY], binding)) throw failure ?? Error('Character save could not be confirmed. Reload or retry; no success was reported.');
        // Refresh the host's card cache/hidden editor only after durable confirmation.
        if (readChatContext(getContext())?.characterAvatar === active.characterAvatar && await account() === handle) {
            await getContext().getOneCharacter?.(active.characterAvatar);
            synchronizeCard(active.characterAvatar);
        }
        return binding;
    }
    async function saveChat(active, handle, record, messages, expected, current) {
        validateContract(record, 'chatRecord');
        // Capture the exact source/payload before the first asynchronous guard.
        const snapshot = captureCompanionChatSave(contextFor(active), messages);
        const beforeMemory = snapshot.beforeMessages, beforeMetadata = snapshot.beforeMetadata;
        messages = snapshot.messages;
        await guard(active, handle, current);
        if (host.isChatSaving) await waitForHostSave();
        if (host.isGenerating() || host.isChatSaving) throw Error('Wait for generation/chat saving to finish, then retry the companion update.');
        const listing = await chats(active.characterAvatar);
        if (!listing.some(row => row.file_id === active.chatLocator)) throw Error('The active chat file is missing. No companion save was attempted.');
        const disk = await readChat(active.characterAvatar, active.chatLocator);
        if (!Array.isArray(disk) || !disk[0]?.chat_metadata || disk[0].chat_metadata.integrity !== active.integrity) throw Error('The loaded chat could not be verified on disk. Retry after the host finishes saving it.');
        if(Object.hasOwn(disk[0].chat_metadata,'lpc_companion_roster'))validateRoster(disk[0].chat_metadata.lpc_companion_roster,disk[0].chat_metadata[STATE_KEY]?.state);
        assertLoadedCompanionHeaders(disk[0].chat_metadata,beforeMetadata);
        if (Object.hasOwn(disk[0].chat_metadata, STATE_KEY) !== (expected !== null)
            || !equal(disk[0].chat_metadata[STATE_KEY] ?? null, expected ?? null)) throw Error('Companion chat state changed elsewhere. Reload before saving.');
        await guard(active, handle, current);
        if (host.isChatSaving) await waitForHostSave();
        const latest = contextFor(active);
        if (host.isGenerating() || host.isChatSaving || !equal(latest.chat, beforeMemory) || !equal(latest.chatMetadata, beforeMetadata)) throw Error('Chat changed while preparing the save. Retry the companion update.');
        host.cancelDebouncedChatSave();
        const metadata = { ...beforeMetadata, [STATE_KEY]: record };
        let failure;
        try { await request('/api/chats/save', { avatar_url: active.characterAvatar, file_name: active.chatLocator,
            chat: [{ chat_metadata: metadata, user_name: 'unused', character_name: 'unused' }, ...messages] }); }
        catch (error) { failure = error; }
        const stored = await readChat(active.characterAvatar, active.chatLocator).catch(() => null);
        if (!Array.isArray(stored) || !equal(stored[0]?.chat_metadata?.[STATE_KEY], record)
            || !equal(stored.slice(1), messages)) throw failure ?? Error('Chat save could not be confirmed. Reload to verify its status before another update.');
        const same = readChatContext(getContext());
        if (same && sessionKey(same) === sessionKey(active) && await account() === handle) {
            const now = getContext();
            if (!equal(now.chat, beforeMemory) || !equal(now.chatMetadata, beforeMetadata)) throw Error('Chat changed during the save. Reload to reconcile before another update.');
            now.chatMetadata[STATE_KEY] = structuredClone(record);
            // Only this namespace is changed in host messages; never replace live prose.
            for (let i = 0; i < now.chat.length; i++) {
                const value = messages[i]?.extra?.[MESSAGE_KEY];
                if (value) {
                    now.chat[i].extra = { ...now.chat[i].extra, [MESSAGE_KEY]: structuredClone(value) };
                    const swipe = now.chat[i].swipe_info?.[now.chat[i].swipe_id];
                    const receipt = messages[i].swipe_info?.[messages[i].swipe_id]?.extra?.[MESSAGE_KEY];
                    if (swipe && receipt) swipe.extra = { ...swipe.extra, [MESSAGE_KEY]: structuredClone(receipt) };
                }
            }
        }
        return record;
    }
    return { account, contextFor, cards, chats, readCard, readChat, saveCard, saveChat, guard };
}
