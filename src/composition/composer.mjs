import { ImageCache } from './cache.mjs';
import { planLayers } from '../catalog/catalog.mjs';

/** Environment functions are injected; this module has no host or DOM globals. */
export function createComposer({ catalog, loadImage, recolor, createCanvas, cacheBytes }) {
    const decoded = new ImageCache(cacheBytes);
    const colored = new ImageCache(cacheBytes);
    let disposed = false;
    return {
        async compose(selections, animation) {
            if (disposed) throw Error('Renderer is closed.');
            const layers = planLayers(selections, animation, catalog);
            const layout = catalog.animations[animation];
            const width = (Math.max(...layout.cycle) + 1) * layout.frameWidth;
            const height = layout.directions.length * layout.frameHeight;
            const images = await Promise.all(layers.map(async layer => {
                const image = await decoded.get(layer.path, () => loadImage(layer.path));
                if (disposed) throw Error('Renderer is closed.');
                if (image.width !== width || image.height !== height) throw Error('Asset layout does not match its animation.');
                if (layer.material === 'original') return image;
                const source=[...catalog.palettes[layer.material][layer.sourcePalette]],target=[...catalog.palettes[layer.material][layer.palette]];
                for(const [alias,canonical]of Object.entries(layer.sourceColorAliases)){const index=source.indexOf(canonical);if(index<0)throw Error('Unknown source color alias.');source.push(alias);target.push(target[index]);}
                return colored.get(`${layer.path}|${layer.material}|${layer.sourcePalette}|${layer.palette}|${JSON.stringify(layer.sourceColorAliases)}`,()=>recolor(image,source,target));
            }));
            if (disposed) throw Error('Renderer is closed.');
            const canvas = createCanvas(width, height);
            const context = canvas.getContext('2d');
            context.imageSmoothingEnabled = false;
            for (const image of images) context.drawImage(image, 0, 0);
            return { canvas, layout, layers };
        },
        stats: () => ({ decodedBytes: decoded.bytes, recoloredBytes: colored.bytes, maxBytesPerCache: decoded.maxBytes }),
        dispose() { disposed = true; decoded.clear(); colored.clear(); },
    };
}
