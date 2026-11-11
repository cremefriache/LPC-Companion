import { sha256 } from '@noble/hashes/sha2.js';
import manifest from '../../assets/lpc/pack-manifest.json' with { type: 'json' };
import { catalog } from '../catalog/catalog.mjs';
import { scenes } from '../catalog/scenes.mjs';
import { defaultSourceReadiness } from './source-contracts.mjs';

export const PACKAGE_LIMIT = 2_000_000;
export const SOURCE_ART_PREFIX = 'full-source/';

export function registerSourceArtworkValidator(validate) {
    defaultSourceReadiness.bind({ validateArtwork: validate });
}

export const digest = bytes => Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
export function encodePng(bytes) {
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}
export function decodePng(text, width, height) {
    if (typeof text !== 'string' || text.length > 180_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw Error('Invalid or oversized PNG encoding.');
    const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    if (bytes.length < 45 || ![137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)
        || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452
        || view.getUint32(16) !== width || view.getUint32(20) !== height) throw Error('PNG dimensions or header do not match the package.');
    if (encodePng(bytes) !== text) throw Error('Noncanonical PNG encoding.');
    let offset = 8, chunks = 0, imageData = false, ended = false;
    while (offset < bytes.length) {
        if (++chunks > 128 || offset + 12 > bytes.length) throw Error('Invalid PNG chunks.');
        const length = view.getUint32(offset), end = offset + length + 12;
        if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) throw Error('PNG data is truncated or corrupt.');
        const type = view.getUint32(offset + 4);
        if (type === 0x49444154) imageData = true;
        if (type === 0x49454e44) { if (length !== 0 || end !== bytes.length) throw Error('Invalid PNG ending.'); ended = true; }
        offset = end;
    }
    if (!imageData || !ended) throw Error('Incomplete PNG.');
    return bytes;
}
const dimensions = new Map();
const backgrounds = new Map(Object.values(scenes.backgrounds).map(item=>[item.path,item]));
for (const item of Object.values(catalog.items)) for (const layer of item.layers) for (const [action, path] of Object.entries(layer.paths)) {
    const layout = catalog.animations[action];
    dimensions.set(path, [(Math.max(...layout.cycle) + 1) * layout.frameWidth, layout.directions.length * layout.frameHeight]);
}

export function createEmbeddedAssetsValidator({ readiness = defaultSourceReadiness, validateSourceArtwork } = {}) {
    return function validateEmbeddedAssets(value = {}, options = {}) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 1024
            || JSON.stringify(value).length > PACKAGE_LIMIT - 100_000) throw Error('Invalid or oversized companion artwork library.');
        if (Object.keys(value).filter(path => !path.startsWith(SOURCE_ART_PREFIX)).length > Object.keys(manifest.files).length + backgrounds.size) {
            throw Error('Invalid or oversized curated artwork library.');
        }
        const result = {};
        for (const [path, text] of Object.entries(value)) {
            if (path.startsWith(SOURCE_ART_PREFIX)) {
                const validator = options.validateSourceArtwork ?? validateSourceArtwork ?? readiness.artworkValidator();
                validator(path, text);
                result[path] = text;
                continue;
            }
            if (backgrounds.has(path)) {
                if (typeof text !== 'string' || text.length > 12000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw Error('Invalid background encoding.');
                const bytes = Uint8Array.from(atob(text), c => c.charCodeAt(0));
                if (encodePng(bytes) !== text || digest(bytes) !== backgrounds.get(path).sha256) throw Error('Background artwork verification failed. Only the exact curated vectors are supported.');
                result[path] = text; continue;
            }
            if (!Object.hasOwn(manifest.files, path) || !dimensions.has(path)) throw Error('Package contains an unknown artwork path.');
            const bytes = decodePng(text, ...dimensions.get(path));
            if (digest(bytes) !== manifest.files[path]) throw Error(`Artwork verification failed: ${path}`);
            result[path] = text;
        }
        return result;
    };
}

export const validateEmbeddedAssets = createEmbeddedAssetsValidator();
