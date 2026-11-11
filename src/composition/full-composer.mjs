import { prepareSourceImage, sourceTransformSpec } from './source-transforms.mjs';
import { ImageCache } from './cache.mjs';

/** Whole-source auditing/composition engine. A complete canvas is returned only after every required layer succeeds. */
export function createFullComposer({ catalog, loadImage, recolor, createCanvas, applyMask, cacheBytes }) {
    const decoded = new ImageCache(cacheBytes), colored = new ImageCache(cacheBytes);
    let disposed = false;
    const check = signal => {
        if (disposed) throw Error('Renderer is closed.');
        if (signal?.aborted) throw Error('Composition was cancelled.');
    };
    return {
        async compose(recipe, action, { signal } = {}) {
            check(signal);
            const plan = catalog.plan(recipe, action),
                canvas = createCanvas(plan.width, plan.height),
                context = canvas.getContext('2d');
            context.imageSmoothingEnabled = false;
            // Sequential drawing bounds retained source images independently of outfit size.
            for (const layer of plan.layers) {
                check(signal);
                let image = await decoded.get(
                    layer.sha256,
                    loadSignal => loadImage(layer.path, layer.sha256, { signal: loadSignal }),
                    { signal }
                );
                check(signal);
                if (image.width !== layer.sourceWidth || image.height !== layer.sourceHeight) throw Error('Pinned source image dimensions changed.');
                if (layer.palettes.length || layer.sourceTransformId) {
                    const raw = image,
                        key = layer.sha256 +'|' +JSON.stringify([layer.palettes, layer.sourceTransformId ?? null]);
                    image = await colored.get(
                        key,
                        async () => {
                            const prepared = prepareSourceImage(raw, layer, createCanvas);
                            if (!layer.palettes.length) return prepared;
                            try {
                                const result = await recolor(prepared, layer.palettes.map(({ source, target }) => ({ source,
                                target })));
                                if (prepared !== raw && result !== prepared) prepared.width = 0;
                                return result;
                            } catch (error) {
                                if (prepared !== raw) prepared.width = 0;
                                throw error;
                            }
                        },
                        { signal }
                    );
                    check(signal);
                    const spec = sourceTransformSpec(layer);
                    if (image.width !== (spec?.outputWidth ?? layer.sourceWidth) || image.height !== (spec?.outputHeight
                        ?? layer.sourceHeight)) throw Error('Prepared source changed its geometry.');
                }
                for (const f of layer.frames)
                    context.drawImage(image, f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
            }
            if (plan.applyMask) {
                if (typeof applyMask !== 'function') throw Error('Transparency-mask support is unavailable.');
                applyMask(canvas, context);
            }
            check(signal);
            return { canvas, layout: plan.layout, layers: plan.layers, plan };
        },
        stats: () => ({
            decodedBytes: decoded.bytes,
            recoloredBytes: colored.bytes,
            maxBytesPerCache: decoded.maxBytes,
            pendingLoads: decoded.pending.size +colored.pending.size
        }),
        dispose() {
            disposed = true;
            decoded.dispose();
            colored.dispose();
        },
    };
}
