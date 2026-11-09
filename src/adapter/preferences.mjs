const KEY = 'lpc-companion:preferences:v1';
export const TOOL_SCOPES = ['off', 'character', 'scene'];
export const DOCK_POSITIONS = ['left', 'right', 'inline'];

function attachScope(base, preferredScope, preferredDock) {
    Object.defineProperties(base, {
        toolScope: { value: base.toolCalling ? preferredScope : 'off', enumerable: false },
        preferredToolScope: { value: preferredScope, enumerable: false },
        dock: { value: preferredDock, enumerable: false },
    });
    return Object.freeze(base);
}

/** Global device UI and tool-calling preferences persisted in browser storage. */
export function createPreferences({ storage }) {
    let preferredScope = 'character';
    let preferredDock = 'left';
    let state = { enabled: true, toolCalling: false, shareContext: true };
    const listeners = new Set();
    try {
        const raw = storage?.getItem(KEY);
        if (raw && raw.length <= 1024) {
            const saved = JSON.parse(raw);
            if (saved?.schemaVersion === 1 && typeof saved.enabled === 'boolean'
                && typeof saved.shareContext === 'boolean'
                && (saved.toolCalling === undefined || typeof saved.toolCalling === 'boolean')) {
                if (saved.toolScope === 'scene' || saved.toolScope === 'character') preferredScope = saved.toolScope;
                if (DOCK_POSITIONS.includes(saved.dock)) preferredDock = saved.dock;
                const toolCalling = saved.enabled ? Boolean(saved.toolCalling) : false;
                state = { ...state, enabled: saved.enabled, toolCalling, shareContext: saved.shareContext };
            }
        }
    } catch { /* Unavailable browser storage leaves page-local preferences usable. */ }
    state = attachScope(state, preferredScope, preferredDock);
    return {
        get: () => state,
        set(patch) {
            if (!patch || typeof patch !== 'object' || Array.isArray(patch)
                || Object.entries(patch).some(([key, value]) =>
                    key === 'toolScope' ? !TOOL_SCOPES.includes(value)
                    : key === 'dock' ? !DOCK_POSITIONS.includes(value)
                    : !['enabled', 'toolCalling', 'shareContext'].includes(key) || typeof value !== 'boolean')) {
                throw Error('Use valid companion preferences.');
            }
            const previous = state, previousScope = state.toolScope, previousDock = state.dock;
            const next = { enabled: state.enabled, toolCalling: state.toolCalling, shareContext: state.shareContext };
            for (const key of ['enabled', 'toolCalling', 'shareContext']) if (Object.hasOwn(patch, key)) next[key] = patch[key];
            if (Object.hasOwn(patch, 'toolScope')) {
                if (patch.toolScope === 'off') next.toolCalling = false;
                else { preferredScope = patch.toolScope; next.toolCalling = true; }
            }
            if (Object.hasOwn(patch, 'dock')) preferredDock = patch.dock;
            if (!next.enabled) next.toolCalling = false;
            const nextState = attachScope(next, preferredScope, preferredDock);
            if (Object.keys(next).every(key => next[key] === state[key]) && nextState.toolScope === previousScope && nextState.dock === previousDock) return state;
            state = nextState;
            try {
                const payload = { schemaVersion: 1, enabled: state.enabled, toolCalling: state.toolCalling, shareContext: state.shareContext };
                if (preferredScope !== 'character') payload.toolScope = preferredScope;
                if (preferredDock !== 'left') payload.dock = preferredDock;
                storage?.setItem(KEY, JSON.stringify(payload));
            } catch { /* The current page still honors the chosen permissions. */ }
            for (const listener of [...listeners]) listener(state, previous);
            return state;
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
}
