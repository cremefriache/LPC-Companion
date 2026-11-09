import { createLifecycle } from './adapter/lifecycle.mjs';
import { createHostStorage } from './adapter/storage.mjs';
import { createContinuity } from './adapter/continuity.mjs';
import { revealSettings } from './adapter/settings.mjs';
import { readChatContext } from './adapter/context.mjs';
import { sessionKey } from './adapter/session.mjs';
import { readRosterContext, rosterKey } from './adapter/roster-context.mjs';
import { createRosterStorage } from './adapter/roster-storage.mjs';
import { createRosterContinuity } from './adapter/roster-continuity.mjs';
import { createRosterWorkspace } from './presentation/roster-workspace.mjs';
import { createToolHub } from './adapter/tool-hub.mjs';
import { createWorkQueue } from './adapter/work-queue.mjs';
import {createFullRuntime} from './presentation/full-runtime.mjs';
import { createNoChatSettings } from './presentation/no-chat-settings.mjs';
import { createPreferences } from './adapter/preferences.mjs';
import { createCompanionSettings } from './presentation/companion-settings.mjs';

let lifecycle;
let sessions, initialization;
let enabled = false;
let hostGenerating = () => false;
let rosters,toolHub,queue;
let fullRuntime;
let preferences, settingsUI, unsubscribePreferences;

export async function onActivate() {
    enabled = true;
    if (typeof globalThis.SillyTavern?.getContext !== 'function') return;
    if (!preferences) {
        let storage;
        try { storage = window.localStorage; } catch { /* Restricted storage is optional. */ }
        preferences = createPreferences({ storage });
    }
    initialization ??= (async () => {
        const host = await import(new URL('/script.js', location.href).href);
        hostGenerating = host.isGenerating;
        const getContext = () => globalThis.SillyTavern.getContext();
        fullRuntime=createFullRuntime({baseUrl:new URL('.',import.meta.url),document});
        const storage = createHostStorage({ getContext, fetch: (...args) => fetch(...args), host,
            prepareData:fullRuntime.prepareData,
            synchronizeCard(avatar) {
                const context = getContext(); const card = context.characters[context.characterId];
                const editor = document.getElementById('character_json_data');
                if (card?.avatar === avatar && typeof card.json_data === 'string' && editor) editor.value = card.json_data;
            },
        });
        queue=createWorkQueue();
        sessions = createContinuity({ storage, getContext, crypto: window.crypto, isGenerating: host.isGenerating,queue });
        rosters=createRosterContinuity({storage:createRosterStorage({getContext,fetch:(...args)=>fetch(...args),host,primaryStorage:storage,prepareData:fullRuntime.prepareData}),getContext,crypto:window.crypto,isGenerating:host.isGenerating,queue});
        toolHub=createToolHub({getContext,toolPolicy:preferences});
    })();
    await initialization;
    if (!enabled) return;
    settingsUI ??= createCompanionSettings({ document, preferences });
    if (!settingsUI) return;
    toolHub.start();
    lifecycle ??= createLifecycle({
        getContext: () => globalThis.SillyTavern.getContext(),
        createView: active => createRosterWorkspace({ document, window, active, primarySessions:sessions,rosters,toolHub,fullRuntime,preferences,settingsDrawer:settingsUI, isGenerating: () => hostGenerating(), baseUrl: new URL('.', import.meta.url), revealSettings: () => revealSettings(document) }),
        createInactiveView: () => createNoChatSettings({ document, baseUrl: new URL('.', import.meta.url), settingsContainer:settingsUI.content,disabled:!preferences.get().enabled }),
        inactiveKey: () => preferences.get().enabled ? 'no-chat' : 'disabled',
        window,
        isGenerating: () => hostGenerating(),
        readContext:context=>preferences.get().enabled?(readChatContext(context)??readRosterContext(context)):null,contextKey:active=>active.kind==='group'?rosterKey(active):sessionKey(active),
        continuity: {whenIdle:queue.whenIdle,beginGeneration(type){if(enabled&&preferences.get().enabled){sessions.beginGeneration(type);rosters.beginGeneration(type);}},noteRename(kind,...args){if(enabled&&preferences.get().enabled){sessions.noteRename(kind,...args);rosters.noteRename(kind,...args);}}},
    });
    unsubscribePreferences ??= preferences.subscribe(() => { if (enabled) lifecycle.refresh(); });
    lifecycle.start();
}

export function onEnable() { return onActivate(); }
export function onDisable() { enabled = false; preferences?.set({toolCalling:false}); unsubscribePreferences?.();unsubscribePreferences=null;lifecycle?.stop(); toolHub?.stop();settingsUI?.remove();settingsUI=null; }
export function onDelete() { onDisable(); }
