import { sha256 } from '@noble/hashes/sha256';
import { createCoalescedQueue } from './cache.mjs';

export const sha256Hex = bytes => Array.from(sha256(bytes), v => v.toString(16).padStart(2, '0')).join('');

/** Byte-bounded original PNG bank reader. Caller supplies only trusted compiled index data. */
export function createFullArtStore({
    index,
    readPack,
    maxBytes = 8 * 1024 * 1024,
    maxConcurrentPacks = 4,
    maxQueuedPacks = 256,
}) {
    if (
        index?.kind !== 'lpc-full-art-library'
        || index.schemaVersion !== 1
        || !Number.isSafeInteger(maxBytes)
        || maxBytes < index.packByteLimit
        || index.packByteLimit !== 256 * 1024
        || !Number.isSafeInteger(maxConcurrentPacks)
        || maxConcurrentPacks < 1
        || !Number.isSafeInteger(maxQueuedPacks)
        || maxQueuedPacks < 0
    ) {
        throw Error('Invalid full artwork library configuration.');
    }

    const cache = new Map();
    const evidence = new Map();
    const queue = createCoalescedQueue({
        concurrency: maxConcurrentPacks,
        maxWaiters: maxQueuedPacks,
        busyMessage: 'Artwork library is busy. Retry after current loads finish.',
        cancelMessage: 'Artwork loading was cancelled.',
        closedMessage: 'Artwork library is closed.',
    });
    let bytes = 0;
    let disposed = false;
    let loads = 0;
    let bytesRead = 0;

    const check = signal => {
        if (disposed) throw Error('Artwork library is closed.');
        if (signal?.aborted) throw Error('Artwork loading was cancelled.');
    };

    async function pack(number, signal) {
        check(signal);
        if (cache.has(number)) {
            const hit = cache.get(number);
            cache.delete(number);
            cache.set(number, hit);
            return hit;
        }
        const descriptor = index.packs[number];
        if (!descriptor || !/^art-\d{4}\.bin$/.test(descriptor.file) || descriptor.bytes > index.packByteLimit) {
            throw Error('Invalid compiled artwork bank.');
        }
        return queue.execute(number, async loadSignal => {
            check(loadSignal);
            if (cache.has(number)) {
                const hit = cache.get(number);
                cache.delete(number);
                cache.set(number, hit);
                return hit;
            }
            loads++;
            const value = await readPack(descriptor, loadSignal);
            check();
            if (!(value instanceof Uint8Array) || value.byteLength !== descriptor.bytes || sha256Hex(value) !== descriptor.sha256) {
                throw Error('Local artwork bank failed verification. Reinstall the full asset library.');
            }
            bytesRead += value.byteLength;
            if (!cache.has(number)) {
                while (bytes + value.byteLength > maxBytes && cache.size) {
                    const oldest = cache.keys().next().value;
                    bytes -= cache.get(oldest).byteLength;
                    cache.delete(oldest);
                }
                cache.set(number, value);
                bytes += value.byteLength;
            }
            return value;
        }, { signal });
    }

    return Object.freeze({
        async loadBytes(path, expectedSha256, { signal } = {}) {
            check(signal);
            const hash = Object.hasOwn(index.paths, path) ? index.paths[path] : null;
            const record = hash && index.blobs[hash];
            if (!record || hash !== expectedSha256) throw Error('Unknown or changed compiled artwork path.');
            const data = await pack(record.pack, signal);
            check(signal);
            if (
                !Number.isSafeInteger(record.offset)
                || !Number.isSafeInteger(record.length)
                || record.offset < 0
                || record.length < 8
                || record.offset + record.length > data.byteLength
            ) {
                throw Error('Invalid compiled PNG extent.');
            }
            const png = data.subarray(record.offset, record.offset + record.length);
            if (sha256Hex(png) !== hash) throw Error('Local PNG failed verification.');
            return png;
        },
        assets: () => Object.entries(index.paths).map(([path, sha256]) => {
            const b = index.blobs[sha256];
            return { path, sha256, width: b.width, height: b.height };
        }),
        evidenceFor(sha) {
            if (evidence.has(sha)) {
                const hit = evidence.get(sha);
                evidence.delete(sha);
                evidence.set(sha, hit);
                return hit;
            }
            if (!Object.hasOwn(index.blobs, sha)) throw Error('Unknown compiled pixel evidence.');
            const b = index.blobs[sha];
            if (typeof b.alpha64 !== 'string' || typeof b.rgb !== 'string') {
                throw Error('Pixel evidence is missing from the installed full library.');
            }
            const bits = Uint8Array.from(atob(b.alpha64), c => c.charCodeAt(0));
            const count = b.width % 64 || b.height % 64 ? 0 : (b.width / 64) * (b.height / 64);
            if (bits.length !== Math.ceil(count / 8)) throw Error('Invalid compiled alpha evidence.');
            const result = {
                width: b.width,
                height: b.height,
                physical64CellNonblankPixels: Array.from({ length: count }, (_, n) => (bits[n >> 3] >> (n % 8)) & 1),
                colors: b.rgb ? b.rgb.split(',') : [],
            };
            if (evidence.size >= 32) evidence.delete(evidence.keys().next().value);
            evidence.set(sha, result);
            return result;
        },
        stats: () => {
            const q = queue.stats();
            return {
                bytes,
                maxBytes,
                pending: q.pending,
                active: q.active,
                queued: q.queued,
                packs: cache.size,
                loads,
                bytesRead,
            };
        },
        dispose() {
            disposed = true;
            queue.dispose();
            cache.clear();
            evidence.clear();
            bytes = 0;
        },
    });
}
