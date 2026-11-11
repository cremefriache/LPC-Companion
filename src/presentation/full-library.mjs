import provenance from '../../vendor/lpc/full-catalog/library-provenance.json' with { type: 'json' };
import { SOURCE_CERTIFICATE_FILES, SOURCE_CERTIFICATE_LIMITS, registerSourceCertificates } from '../catalog/source-certificates.mjs';
import { createFullArtStore, sha256Hex } from '../composition/full-art-store.mjs';

async function readBounded(response, limit, signal) {
    if (!response.ok)
        throw Error('The local full asset library is unavailable. Reinstall the complete extension.');
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
        for (;;) {
            if (signal.aborted) throw Error('Artwork loading was cancelled.');
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) throw Error('Local artwork exceeds its compiled size.');
            chunks.push(value);
        }
    } finally {
        await reader.cancel().catch (() => {});
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
    }
    return bytes;
}

async function readVerifiedInput(descriptor, maxDecoded, { baseUrl, fetchFile, signal }) {
    const bytes = await readBounded(
        await fetchFile(new URL('assets/lpc/full-source/' +descriptor.file, baseUrl), { signal }),
        descriptor.bytes,
        signal
    );
    if (bytes.length !== descriptor.bytes || sha256Hex(bytes) !== descriptor.sha256) throw Error('Full library manifest failed verification.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
        decoded = await readBounded(new Response(stream), maxDecoded, signal);
    if (sha256Hex(decoded) !== descriptor.decodedSha256) throw Error('Full library decoded input failed verification.');
    return JSON.parse(new TextDecoder().decode(decoded));
}

/** Lazy bank-only opening for verified sprite decoding without loading catalog/certificate tables. */
export async function openFullArtBank({
    baseUrl,
    fetchFile = globalThis.fetch,
    document = globalThis.document,
    signal
}) {
    let store;
    const controller = new AbortController(),
        abort = () => {
            controller.abort();
            store?.dispose();
        };
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const read = async (descriptor, loadSignal = controller.signal) => readBounded(
        await fetchFile(new URL('assets/lpc/full-source/' +descriptor.file, baseUrl), { signal: loadSignal }),
        descriptor.bytes,
        loadSignal
    );
    try {
        const index = await readVerifiedInput(provenance.index, 40 * 1024 * 1024, { baseUrl, fetchFile, signal: controller.signal });
        if (controller.signal.aborted) throw Error('Artwork loading was cancelled.');
        if (index.sourceCommit !== provenance.sourceCommit) throw Error('Full library source mismatch.');
        store = createFullArtStore({ index, readPack: read });
        return {
            assets: store.assets(),
            evidenceFor: store.evidenceFor,
            loadBytes: store.loadBytes,
            async loadImage(path, sha256, { signal } = {}) {
                const bytes = await store.loadBytes(path, sha256, { signal });
                if (controller.signal.aborted) throw Error('Artwork library is closed.');
                if (signal?.aborted) throw Error('Artwork loading was cancelled.');
                const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
                try {
                    const image = document.createElement('img');
                    image.src = url;
                    await image.decode();
                    if (controller.signal.aborted) throw Error('Artwork library is closed.');
                    if (signal?.aborted) throw Error('Artwork loading was cancelled.');
                    return image;
                } finally {
                    URL.revokeObjectURL(url);
                }
            },
            stats: store.stats,
            dispose() {
                controller.abort();
                signal?.removeEventListener('abort', abort);
                store.dispose();
            },
        };
    } catch (error) {
        controller.abort();
        signal?.removeEventListener('abort', abort);
        store?.dispose();
        throw error;
    }
}

/** Lazy library opening. No reference checkout, network service or WebCrypto requirement. */
export async function openFullLibrary({
    baseUrl,
    fetchFile = globalThis.fetch,
    document = globalThis.document,
    signal,
    bank = null
}) {
    const ownsBank = !bank;
    const controller = new AbortController(),
        abort = () => {
            controller.abort();
            if (ownsBank) openedBank?.dispose();
        };
    let openedBank = bank;
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
        if (!openedBank)
            openedBank = await openFullArtBank({ baseUrl, fetchFile, document, signal: controller.signal });
        const [metadata, repairs, ...certList] = await Promise.all([
            readVerifiedInput(
                provenance.inputs['metadata.json'],
                6 * 1024 * 1024,
                { baseUrl, fetchFile, signal: controller.signal }
            ),
            readVerifiedInput(
                provenance.inputs['repairs.json'],
                64 * 1024,
                { baseUrl, fetchFile, signal: controller.signal }
            ),
            ...SOURCE_CERTIFICATE_FILES.map(name => readVerifiedInput(
                provenance.inputs[name],
                SOURCE_CERTIFICATE_LIMITS[name],
                { baseUrl, fetchFile, signal: controller.signal }
            )),
        ]);
        if (controller.signal.aborted) throw Error('Artwork loading was cancelled.');
        if (metadata.commit !== provenance.sourceCommit || repairs.commit !== provenance.sourceCommit) throw Error('Full library source mismatch.');
        const certificates = Object.create(null);
        for (let i = 0; i < SOURCE_CERTIFICATE_FILES.length; i++) {
            const name = SOURCE_CERTIFICATE_FILES[i],
                cert = certList[i],
                commit = cert.sourceCommit ?? cert.commit;
            if (commit !== undefined && commit !== provenance.sourceCommit) throw Error('Full library certificate source mismatch.');
            certificates[name] = cert;
        }
        registerSourceCertificates(certificates);
        signal?.removeEventListener('abort', abort);
        return { ...openedBank, metadata, repairs, certificates };
    } catch (error) {
        controller.abort();
        signal?.removeEventListener('abort', abort);
        if (ownsBank) openedBank?.dispose();
        throw error;
    }
}
