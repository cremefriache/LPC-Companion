/** Volatile, account-page-lifetime workspace. Locators here are NOT persistence IDs. */
export function sessionKey(context) {
    return JSON.stringify([context.characterAvatar, context.chatLocator, context.integrity]);
}
export function createSessionStore(limit = 32) {
    const entries = new Map();
    let currentDock = 'left';
    return {
        get(context) { return entries.get(sessionKey(context)); },
        create(context) {
            const key = sessionKey(context);
            if (!entries.has(key)) {
                if (entries.size >= limit) throw Error('This session has 32 chat previews. Reload clears previews; durable saving arrives in the continuity milestone.');
                const entry = { definition: null, presentation: null, paused: false };
                Object.defineProperty(entry, 'dock', {
                    get: () => currentDock,
                    set: value => { if (['left', 'right', 'inline'].includes(value)) currentDock = value; },
                    enumerable: true,
                    configurable: true,
                });
                entries.set(key, entry);
            }
            return entries.get(key);
        },
    };
}
