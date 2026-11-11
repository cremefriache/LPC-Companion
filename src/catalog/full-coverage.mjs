import { preparedSourceEvidence } from './source-transform-specs.mjs';
// Prepared source visibility (including exact reviewed standing-frame copies),
// before recolor, masking or outfit occlusion. This is evidence,
// not an automatic decision that intentional rear-view omissions are defects.
export function inspectSourceVisibility(plan, lookup) {
    const items = new Map();
    for (const layer of plan.layers) {
        if (layer.isMask) continue;
        const group = items.get(layer.itemId) ?? [];
        group.push(layer);
        items.set(layer.itemId, group);
    }
    const size = plan.layout.frameWidth;
    return [...items].map(([itemId, layers]) => {
        const frames = [];
        for (let row = 0; row < plan.layout.directions.length; row++)
            for (const column of new Set(plan.layout.cycle)) {
                let nonblankPixelSum = 0, measurable = true;
                for (const layer of layers) {
                    const art = preparedSourceEvidence(layer, lookup(layer.sha256));
                    if (!art || art.width % 64 || art.height % 64 || !art.physical64CellNonblankPixels?.length) {
                        measurable = false;
                        continue;
                    }
                    const target = { x: column * size, y: row * size, w: size, h: size };
                    for (const draw of layer.frames) {
                        const x = Math.max(target.x, draw.dx),
                            y = Math.max(target.y, draw.dy),
                            right = Math.min(target.x +size, draw.dx +draw.dw),
                            bottom = Math.min(target.y +size, draw.dy +draw.dh);
                        if (right <= x || bottom <= y) continue;
                        if (draw.sw !== draw.dw || draw.sh !== draw.dh) {
                            measurable = false;
                            continue;
                        }
                        const sx = draw.sx +x -draw.dx,
                            sy = draw.sy +y -draw.dy,
                            w = right -x,
                            h = bottom -y;
                        if ([sx, sy, w, h].some(v => v % 64)) {
                            measurable = false;
                            continue;
                        }
                        for (let cy = sy; cy < sy +h; cy += 64)
                            for (let cx = sx; cx < sx +w; cx += 64)
                                nonblankPixelSum += art.physical64CellNonblankPixels[cy / 64 * (art.width / 64) +cx / 64];
                    }
                }
                frames.push({
                    direction: plan.layout.directions[row],
                    column,
                    measurable,
                    nonblankPixelSum,
                    blank: measurable && nonblankPixelSum === 0
                });
            }
        return {
            itemId,
            frames,
            unmeasurable: frames.some(f => !f.measurable),
            fullyBlank: frames.every(f => f.blank),
            blankFrames: frames.filter(f => f.blank),
            fullyBlankDirections: plan.layout.directions.filter(d => frames.filter(f => f.direction === d).every(f => f.blank))
        };
    });
}
