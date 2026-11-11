export const SOURCE_CERTIFICATE_FILES = Object.freeze([
    'pose-phases.json',
    'orientation-phases.json',
    'prop-phases.json',
    'hurt-phases.json',
    'shield-phases.json',
    'native-repairs.json',
    'color-policy.json',
    'provenance.json',
    'package-notices.json',
]);

export const SOURCE_CERTIFICATE_LIMITS = Object.freeze({
    'pose-phases.json': 4 * 1024 * 1024,
    'orientation-phases.json': 4 * 1024 * 1024,
    'prop-phases.json': 2 * 1024 * 1024,
    'hurt-phases.json': 2 * 1024 * 1024,
    'shield-phases.json': 1024 * 1024,
    'native-repairs.json': 1024 * 1024,
    'color-policy.json': 512 * 1024,
    'provenance.json': 512 * 1024,
    'package-notices.json': 512 * 1024,
});

let activeCertificates = null;

function loadNodeCertificates() {
    const getBuiltin = globalThis.process?.getBuiltinModule;
    if (typeof getBuiltin !== 'function') {
        throw Error('Full source certificates must be loaded via openFullLibrary before planning.');
    }
    const fs = getBuiltin('node:fs');
    const zlib = getBuiltin('node:zlib');
    const loaded = Object.create(null);
    for (const name of SOURCE_CERTIFICATE_FILES) {
        const gzUrl = new URL(`../../assets/lpc/full-source/${name}.gz`, import.meta.url);
        if (fs.existsSync(gzUrl)) {
            loaded[name] = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzUrl)).toString('utf8'));
        } else {
            const rawUrl = new URL(`../../vendor/lpc/full-catalog/${name}`, import.meta.url);
            loaded[name] = JSON.parse(fs.readFileSync(rawUrl, 'utf8'));
        }
    }
    return Object.freeze(loaded);
}

export function registerSourceCertificates(certificates) {
    if (!certificates || typeof certificates !== 'object') {
        throw Error('Expected verified source certificates.');
    }
    const next = Object.create(null);
    for (const name of SOURCE_CERTIFICATE_FILES) {
        if (!certificates[name] || typeof certificates[name] !== 'object') {
            throw Error(`Missing verified source certificate: ${name}`);
        }
        next[name] = certificates[name];
    }
    activeCertificates = Object.freeze(next);
    return activeCertificates;
}

export function getSourceCertificate(name) {
    if (!activeCertificates) activeCertificates = loadNodeCertificates();
    const policy = activeCertificates[name];
    if (!policy) throw Error(`Unknown source certificate: ${name}`);
    return policy;
}

export function hasSourceCertificates() {
    return activeCertificates !== null;
}
