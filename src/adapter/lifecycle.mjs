import { readChatContext } from './context.mjs';
import { sessionKey } from './session.mjs';

/** No settings, card, message or metadata mutation belongs in this lifecycle. */
export function createLifecycle({ getContext, createView, createInactiveView, inactiveKey=()=>null, window, continuity, isGenerating=()=>false, readContext=readChatContext, contextKey=sessionKey }) {
    let running = false;
    let view = null;
    let key = null;
    let epoch = 0;
    const subscriptions = [];
    function activeKey() {
        try { const active = readContext(getContext()); return active ? contextKey(active) : null; }
        catch { return null; }
    }

    function refresh() {
        if (!running) return;
        let active = null;
        try {
            active = readContext(getContext());
        } catch {
            // A host transition or unsupported context must remain inert.
        }
        const nextKey = active ? contextKey(active) : inactiveKey();
        if (nextKey !== key) {
            epoch++;
            view?.remove();
            view = null;
            key = nextKey;
        }
        view ??= active ? createView(active) : createInactiveView?.();
    }

    function stop() {
        epoch++;
        running = false;
        for (const [source, event, handler] of subscriptions.splice(0)) {
            source.removeListener(event, handler);
        }
        window.removeEventListener('pagehide', stop);
        view?.remove();
        view = null;
        key = null;
    }

    function start() {
        if (running) return;
        let context;
        try { context = getContext(); } catch { return; }
        const source = context?.eventSource;
        const types = context?.eventTypes;
        if (typeof source?.on !== 'function' || typeof source?.removeListener !== 'function'
            || !types?.APP_READY || !types?.CHAT_CHANGED) return;

        running = true;
        // Record before subscribing: APP_READY is a sticky event in the host emitter.
        for (const event of new Set([types.APP_READY, types.CHAT_CHANGED])) {
            subscriptions.push([source, event, refresh]);
            source.on(event, refresh);
        }
        for(const name of ['GROUP_UPDATED','GROUP_CHAT_CREATED','GROUP_CHAT_DELETED'])if(types[name]){subscriptions.push([source,types[name],refresh]);source.on(types[name],refresh);}
        if(types.MESSAGE_SENT){const dismissSpeech=()=>view?.clearSpeech?.();subscriptions.push([source,types.MESSAGE_SENT,dismissSpeech]);source.on(types.MESSAGE_SENT,dismissSpeech);}
        if (continuity) {
            const listen = (event, handler) => { if (event) { subscriptions.push([source, event, handler]); source.on(event, handler); } };
            listen(types.GENERATION_STARTED, async (type, _options, dryRun) => {
                if(dryRun)return;
                const generationKey=activeKey(),generationEpoch=epoch;if(generationKey===null||generationKey!==key)return;
                view?.cancelActions?.();await continuity.whenIdle();
                if(running&&epoch===generationEpoch&&key===generationKey&&activeKey()===generationKey)continuity.beginGeneration(type);
            });
            for (const name of ['MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_SWIPE_DELETED', 'MESSAGE_EDITED', 'GENERATION_ENDED', 'GENERATION_STOPPED']) {
                listen(types[name], async () => {
                    if (name === 'MESSAGE_DELETED' && isGenerating()) return;
                    view?.cancelActions?.(); await continuity.whenIdle(); await view?.refresh?.();
                });
            }
            listen(types.CHARACTER_RENAMED, async (oldAvatar, newAvatar) => { continuity.noteRename('card', oldAvatar, newAvatar); await view?.refresh?.(); });
            listen(types.CHAT_RENAMED, async data => {
                continuity.noteRename('chat', String(data.groupId??data.avatarId), data.oldFileName.replace(/\.jsonl$/, ''), data.newFileName.replace(/\.jsonl$/, ''));
                await view?.refresh?.();
            });
        }
        window.addEventListener('pagehide', stop);
        refresh();
    }

    return Object.freeze({ start, stop, refresh });
}
