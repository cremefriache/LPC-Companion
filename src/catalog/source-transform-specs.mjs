import layoutPolicy from '../../vendor/lpc/full-catalog/layout-preparation.json' with { type: 'json' };
import { getSourceCertificate } from './source-certificates.mjs';

let cachedNative = null;
let cachedHurt = null;
let transforms = null;

function getTransforms() {
    const nativePolicy = getSourceCertificate('native-repairs.json');
    const policy = getSourceCertificate('hurt-phases.json');
    if (nativePolicy === cachedNative && policy === cachedHurt) return transforms;
    if (layoutPolicy.schemaVersion !== 1 || layoutPolicy.sourceCommit !== policy.sourceCommit) {
        throw Error('Unreviewed source-layout preparation.');
    }
    if (
        nativePolicy.schemaVersion !== 1
        || nativePolicy.sourceCommit !== policy.sourceCommit
        || policy.schemaVersion !== 1
        || policy.sourceCommit !== '86160e7507d6841259cff624a51a63c1d4847ee3'
    ) {
        throw Error('Unreviewed source preparation.');
    }
    cachedNative = nativePolicy;
    cachedHurt = policy;
    transforms = new Map(
        [...policy.transforms, ...nativePolicy.transforms, ...layoutPolicy.transforms].map(row => [row.id, row]),
    );
    return transforms;
}

export function sourceTransformSpec(layer) {
    if (!layer.sourceTransformId) return null;
    const row = getTransforms().get(layer.sourceTransformId);
    if (
        !row
        || row.itemId !== layer.itemId
        || row.path !== layer.path
        || row.sha256 !== layer.sha256
        || row.sourceWidth !== layer.sourceWidth
        || row.sourceHeight !== layer.sourceHeight
    ) {
        throw Error('Unreviewed source-frame preparation.');
    }
    return row;
}

export function preparedSourceEvidence(layer, evidence) {
    const row = sourceTransformSpec(layer);
    if (!row) return evidence;
    if (row.kind === 'transparent_padding') {
        if (
            !evidence
            || evidence.width !== row.sourceWidth
            || evidence.height !== row.sourceHeight
            || evidence.physical64CellNonblankPixels?.length !== 0
        ) {
            throw Error('Prepared source coverage does not match its verified original.');
        }
        return {
            ...evidence,
            width: row.outputWidth,
            height: row.outputHeight,
            physical64CellNonblankPixels: row.cells,
        };
    }
    if (
        !evidence
        || evidence.width !== row.sourceWidth
        || evidence.height !== row.sourceHeight
        || evidence.physical64CellNonblankPixels?.length !== row.rawCells.length
        || evidence.physical64CellNonblankPixels.some((n, i) => Boolean(n) !== Boolean(row.rawCells[i]))
    ) {
        throw Error('Prepared source coverage does not match its verified original.');
    }
    return { ...evidence, physical64CellNonblankPixels: row.cells };
}
