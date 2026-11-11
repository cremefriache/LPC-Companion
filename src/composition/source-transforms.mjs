import { preparedSourceEvidence, sourceTransformSpec } from '../catalog/source-transform-specs.mjs';

export { preparedSourceEvidence, sourceTransformSpec };

/** Immutable originals enter; a caller-owned prepared sheet leaves. No new art/files. */
export function prepareSourceImage(image, layer, createCanvas) {
    const row = sourceTransformSpec(layer);
    if (!row) return image;
    if (image.width !== row.sourceWidth || image.height !== row.sourceHeight) {
        throw Error('Prepared source dimensions changed.');
    }
    const canvas = createCanvas(row.outputWidth ?? image.width, row.outputHeight ?? image.height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    for (const copy of row.copies) {
        const from = Array.isArray(copy.from) ? copy.from : [copy.from, 0];
        const to = Array.isArray(copy.to) ? copy.to : [copy.to, 0];
        ctx.drawImage(image, from[0] * 64, from[1] * 64, 64, 64, to[0] * 64 + copy.dx, to[1] * 64 + copy.dy, 64, 64);
    }
    return canvas;
}
