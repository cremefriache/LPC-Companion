import { SOURCE_ART_PREFIX, decodePng, digest } from './portable-assets.mjs';

/** Exact compiled paths only. Source PNGs never share the curated path namespace. */
export function createSourceArtwork({ assets, library, document }) {
    const files = new Map(assets.map(a => [a.path, a]));
    function decode(key, text) {
        const path = typeof key === 'string' && key.startsWith(SOURCE_ART_PREFIX) ? key.slice(SOURCE_ART_PREFIX.length)
                : null,
            record = files.get(path);
        if (!record) throw Error('Unknown source artwork path.');
        const bytes = decodePng(text, record.width, record.height);
        if (digest(bytes) !== record.sha256) throw Error('Source artwork hash verification failed.');
        return bytes;
    }
    return Object.freeze({
        validate: decode,
        async loadBytes(path, sha, embedded = {}, { signal } = {}) {
            if (files.get(path)?.sha256 !== sha) throw Error('Unknown source artwork or hash.');
            const key = SOURCE_ART_PREFIX +path;
            return Object.hasOwn(embedded, key) ? decode(key, embedded[key]) : library.loadBytes(path, sha, { signal });
        },
        async loadImage(path, sha, embedded = {}, { signal } = {}) {
            if (!Object.hasOwn(embedded, SOURCE_ART_PREFIX +path)) return library.loadImage(path, sha, { signal });
            if (signal?.aborted) throw Error('Artwork loading was cancelled.');
            const bytes = decode(SOURCE_ART_PREFIX +path, embedded[SOURCE_ART_PREFIX +path]);
            if (digest(bytes) !== sha) throw Error('Source artwork hash mismatch.');
            const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
            try {
                const image = document.createElement('img');
                image.src = url;
                await image.decode();
                if (signal?.aborted) throw Error('Artwork loading was cancelled.');
                return image;
            } finally {
                URL.revokeObjectURL(url);
            }
        }
    });
}
