import { equal, MESSAGE_KEY } from '../state/history.mjs';

/** The save payload may add owned receipts, never replace newer host prose. */
export function captureCompanionChatSave(context, messages) {
    const beforeMessages = structuredClone(context.chat);
    const beforeMetadata = structuredClone(context.chatMetadata);
    const payload = structuredClone(messages);
    function withoutReceipts(values) {
        const cleanExtra = value => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
            const { [MESSAGE_KEY]: _receipt, ...extra } = value;
            return Object.keys(extra).length ? extra : undefined;
        };
        const clean = value => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
            const result = { ...value };
            if (Object.hasOwn(result, 'extra')) {
                result.extra = cleanExtra(result.extra);
                if (result.extra === undefined) delete result.extra;
            }
            return result;
        };
        return values.map(message => {
            const result = clean(message);
            if (Array.isArray(result?.swipe_info)) {
                result.swipe_info = result.swipe_info.map(clean);
                // appendChange can create empty swipe containers solely to hold receipts.
                if (result.swipe_info.every(value => value && typeof value === 'object'
                    && !Array.isArray(value) && !Object.keys(value).length)) delete result.swipe_info;
            }
            return result;
        });
    }
    if (!equal(withoutReceipts(payload), withoutReceipts(beforeMessages))) {
        throw Error('Chat changed before the companion save. Retry the companion update.');
    }
    return { beforeMessages, beforeMetadata, messages: payload };
}

/** A writer must not clobber another LPC namespace after an uncertain save. */
export function assertLoadedCompanionHeaders(disk,live){
    for(const key of ['lpc_companion','lpc_companion_roster'])if(Object.hasOwn(disk,key)!==Object.hasOwn(live,key)||!equal(disk[key],live[key]))throw Error('Companion data changed elsewhere or is newer on disk. Reload the host chat before editing; no update was attempted.');
}
