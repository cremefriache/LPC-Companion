// ST 1.19.0 / 7e8663c characters.js merges objects, then processes unset markers.
export const HOST_UNSET = '__@@UNSET@@__';
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const unsafeKey = key => ['__proto__', 'constructor', 'prototype'].includes(key);
/** Encode a single owned namespace. Never clear it in a separate save. */
export function cardNamespacePatch(previous, next) {
    function encode(old, value, exists) {
        if (value === HOST_UNSET)
            throw Error('A companion value is reserved by the host save API. Remove or rename that value before saving defaults.');
        if (!plain(value)) return structuredClone(value);
        // Arrays are replaced and are outside the host's unset walk.
        if (exists && !plain(old))
            throw Error('The host cannot safely replace this stored object type. Export a backup before recovering the companion defaults.');
        const result = Object.fromEntries(Object.entries(value).map(([key, v]) => {
            if (unsafeKey(key))
                throw Error('This metadata key is unsafe for the host merge API. Export a backup before recovering companion defaults.');
            return [key, encode(old?.[key], v, plain(old) && Object.hasOwn(old, key))];
        }));
        for (const key of Object.keys(old ?? {}))
            if (!Object.hasOwn(value, key)) {
                // The pinned host interprets these as lodash paths, not literal keys.
                if (unsafeKey(key) || /[.\[\]]/.test(key))
                    throw Error('The host cannot safely remove this metadata key. Export a backup before recovering companion defaults.');
                result[key] = HOST_UNSET;
            }
        return result;
    }
    return encode(previous, next, previous !== undefined);
}
