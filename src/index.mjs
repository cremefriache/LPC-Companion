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
import { createModelControl } from './adapter/model-control.mjs';
import { createWorkQueue } from './adapter/work-queue.mjs';
import { createFullRuntime } from './presentation/full-runtime.mjs';
import { createNoChatSettings } from './presentation/no-chat-settings.mjs';
import { createPreferences } from './adapter/preferences.mjs';
import { createCompanionSettings } from './presentation/companion-settings.mjs';
import { createStateEngine } from './state/state-engine.mjs';
import { createDebugLog } from './adapter/debug-log.mjs';
import { EXTENSION_VERSION } from './catalog/release-info.mjs';

let lifecycle;
let sessions, initialization;
let enabled = false;
let hostGenerating = () => false;
let rosters, toolHub, queue, stateEngine;
let fullRuntime;
let preferences, settingsUI, unsubscribePreferences;
let currentUiConfig = {};
const SESSION_UI_CONFIG_KEY = 'lpc-companion:session-ui-config:v1';

const diagnostics = createDebugLog({
    getSnapshot: () => {
        const ctx = globalThis.SillyTavern?.getContext?.();
        return {
            preferences: preferences?.get?.() ?? null,
            fullLibraryLoaded: Boolean(stateEngine?.readiness?.isReady?.()),
            viewport: typeof window !== 'undefined' ? {
                width: window.innerWidth,
                height: window.innerHeight,
                dpr: window.devicePixelRatio ?? 1,
                reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
            } : null,
            context: ctx ? {
                activeKind: ctx.groupId ? 'group' : ctx.characterId != null ? 'chat' : 'inactive',
                toolCallingSupported: Boolean(ctx.isToolCallingSupported?.()),
                registeredTools: toolHub?.registeredTools?.() ?? [],
            } : null,
            companions: toolHub?.inspectOwners?.() ?? [],
        };
    },
});

export function sanitizeUiConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const key of ['tamagotchiLauncher', 'tamagotchiInteractive', 'autoOpenDesktop', 'autoMinimizeDesktop', 'studioOwnsPanelState']) {
        if (typeof raw[key] === 'boolean') out[key] = raw[key];
    }
    if (raw.defaultSetupMode === 'studio' || raw.defaultSetupMode === 'curated') {
        out.defaultSetupMode = raw.defaultSetupMode;
    }
    return out;
}

export async function onActivate(nextUiConfig) {
    let uiConfigChanged = false;
    if (nextUiConfig && typeof nextUiConfig === 'object' && !Array.isArray(nextUiConfig)) {
        const nextClean = sanitizeUiConfig(nextUiConfig);
        uiConfigChanged = JSON.stringify(nextClean) !== JSON.stringify(currentUiConfig);
        currentUiConfig = nextClean;
        try {
            if (Object.keys(nextClean).length) window.sessionStorage?.setItem(SESSION_UI_CONFIG_KEY, JSON.stringify(nextClean));
            else window.sessionStorage?.removeItem(SESSION_UI_CONFIG_KEY);
        } catch { /* Restricted session storage is optional. */ }
    } else if (!Object.keys(currentUiConfig).length) {
        try {
            const stored = window.sessionStorage?.getItem(SESSION_UI_CONFIG_KEY);
            if (stored && stored.length <= 512) currentUiConfig = sanitizeUiConfig(JSON.parse(stored));
        } catch { /* Restricted or malformed session storage falls back to defaults. */ }
    }
    enabled = true;
    if (typeof globalThis.SillyTavern?.getContext !== 'function') return;
    if (uiConfigChanged) lifecycle?.stop();
    if (!preferences) {
        let storage;
        try { storage = window.localStorage; } catch { /* Restricted storage is optional. */ }
        preferences = createPreferences({ storage });
    }
    initialization ??= (async () => {
        const host = await import(new URL('/script.js', location.href).href);
        hostGenerating = host.isGenerating;
        const getContext = () => globalThis.SillyTavern.getContext();
        stateEngine = createStateEngine();
        fullRuntime = createFullRuntime({
            baseUrl: new URL('.', import.meta.url),
            document,
            onReady: ({ state, artwork }) => {
                stateEngine.readiness.bind({ state, validateArtwork: artwork.validate });
                diagnostics.info('runtime', 'full-library-ready', { schemaVersion: 2 });
            },
        });
        const storage = createHostStorage({
            getContext,
            fetch: (...args) => fetch(...args),
            host,
            prepareData: fullRuntime.prepareData,
            contracts: stateEngine,
            synchronizeCard(avatar) {
                const context = getContext(); const card = context.characters[context.characterId];
                const editor = document.getElementById('character_json_data');
                if (card?.avatar === avatar && typeof card.json_data === 'string' && editor) editor.value = card.json_data;
            },
        });
        queue = createWorkQueue();
        sessions = createContinuity({ storage, getContext, crypto: window.crypto, isGenerating: host.isGenerating, queue, contracts: stateEngine });
        rosters = createRosterContinuity({
            storage: createRosterStorage({ getContext, fetch: (...args) => fetch(...args), host, primaryStorage: storage, prepareData: fullRuntime.prepareData, contracts: stateEngine }),
            getContext,
            crypto: window.crypto,
            isGenerating: host.isGenerating,
            queue,
            contracts: stateEngine,
        });
        toolHub = createToolHub({
            getContext,
            toolPolicy: preferences,
            onDiagnostic: (level, category, event, detail) => diagnostics.record(level, category, event, detail),
        });
    })();
    await initialization;
    if (!enabled) return;
    settingsUI ??= createCompanionSettings({ document, preferences, diagnostics });
    if (!settingsUI) return;
    diagnostics.info('lifecycle', 'extension-activated', { version: EXTENSION_VERSION });
    toolHub.start();
    lifecycle ??= createLifecycle({
        getContext: () => globalThis.SillyTavern.getContext(),
        createView: active => {
            diagnostics.info('lifecycle', 'context-active', { kind: active.kind ?? 'chat' });
            return createRosterWorkspace({
                document,
                window,
                active,
                primarySessions: sessions,
                rosters,
                toolHub,
                fullRuntime,
                preferences,
                settingsDrawer: settingsUI,
                uiConfig: currentUiConfig,
                isGenerating: () => hostGenerating(),
                baseUrl: new URL('.', import.meta.url),
                revealSettings: () => revealSettings(document),
                readChatContext,
                sessionKey,
                readRosterContext,
                rosterKey,
                createModelControl,
            });
        },
        createInactiveView: () => {
            diagnostics.info('lifecycle', 'context-inactive', { enabled: preferences.get().enabled });
            return createNoChatSettings({ document, baseUrl: new URL('.', import.meta.url), settingsContainer: settingsUI.content, disabled: !preferences.get().enabled });
        },
        inactiveKey: () => preferences.get().enabled ? 'no-chat' : 'disabled',
        window,
        isGenerating: () => hostGenerating(),
        readContext: context => preferences.get().enabled ? (readChatContext(context) ?? readRosterContext(context)) : null,
        contextKey: active => active.kind === 'group' ? rosterKey(active) : sessionKey(active),
        continuity: {
            whenIdle: queue.whenIdle,
            beginGeneration(type) {
                if (enabled && preferences.get().enabled) {
                    diagnostics.info('continuity', 'generation-started', { generationType: String(type ?? 'normal') });
                    sessions.beginGeneration(type);
                    rosters.beginGeneration(type);
                }
            },
            noteRename(kind, ...args) {
                if (enabled && preferences.get().enabled) {
                    diagnostics.info('continuity', 'identity-renamed', { kind: String(kind ?? 'unknown') });
                    sessions.noteRename(kind, ...args);
                    rosters.noteRename(kind, ...args);
                }
            },
        },
    });
    unsubscribePreferences ??= preferences.subscribe(() => {
        diagnostics.info('preferences', 'updated', preferences.get());
        if (enabled) lifecycle.refresh();
    });
    lifecycle.start();
}

export function onEnable() { return onActivate(); }
export function onDisable() {
    diagnostics.info('lifecycle', 'extension-disabled');
    enabled = false;
    preferences?.set({ toolCalling: false });
    unsubscribePreferences?.();
    unsubscribePreferences = null;
    lifecycle?.stop();
    toolHub?.stop();
    settingsUI?.remove();
    settingsUI = null;
}
export function onDelete() { onDisable(); }
