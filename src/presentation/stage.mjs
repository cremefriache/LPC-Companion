import { scenes, validateScene } from '../catalog/scenes.mjs';
import { drawSourceFrame } from './source-frames.mjs';
import { createIcon } from './molecules.mjs';

export function drawScenePreview(target, sheet, presentation, prepared) {
    const context = target.getContext('2d'),
        { width, height } = target,
        scene = validateScene(presentation.scene);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.save();
    context.filter = lightFilter(scene.lightId);
    context.fillStyle = '#304b4c';
    context.fillRect(0, 0, width, height);
    if (prepared.image) {
        const image = prepared.image,
            factor = Math.max(width / image.width, height / image.height);
        context.drawImage(
            image,
            (width -image.width * factor) / 2,
            (height -image.height * factor) / 2,
            image.width * factor,
            image.height * factor
        );
    } else {
        context.fillStyle = '#53634c';
        context.fillRect(0, height * 0.8, width, height * 0.2);
    }
    context.restore();
    if (sheet.layout.sourceBounds) {
        // Draw the sprite separately so clearing its canvas never erases the backdrop.
        const sprite = target.ownerDocument.createElement('canvas');
        sprite.width = width;
        sprite.height = height;
        drawSourceFrame(sprite, sheet, presentation.facing, 0, { placement: scene });
        context.drawImage(sprite, 0, 0);
        sprite.width = 0;
        return;
    }
    const { layout, canvas } = sheet, row = layout.directions.indexOf(presentation.facing);
    if (row < 0) throw Error('Facing is unavailable for this scene preview.');
    const size = Math.min(width * 192 / 274, height * 192 / 256) * scene.scale;
    context.drawImage(
        canvas,
        layout.cycle[0] * layout.frameWidth,
        row * layout.frameHeight,
        layout.frameWidth,
        layout.frameHeight,
        (width -size) * scene.x,
        (height -size) * scene.y,
        size,
        size
    );
}
const lightFilter = id => ({
    day: 'none',
    dusk: 'brightness(0.82) saturate(0.85)',
    night: 'brightness(0.48) saturate(0.7)'
}[id ?? 'day']);

/** Owns at most three decoded backgrounds and one short crossfade. Never filters sprites. */
export function createStage({ document, window, baseUrl, element, getEmbeddedAssets = () => ({}) }) {
    const cache = new Map(), pending = new Map();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false,
        animation = null,
        latest = null;
    const backdrop = document.createElement('div');
    backdrop.className = 'lpc-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    element?.prepend(backdrop);
    function cancelTransition() {
        animation?.cancel();
        animation = null;
        for (const child of [...backdrop.children])
            if (child !== latest) child.remove();
        if (latest) latest.style.opacity = '1';
    }
    async function prepare(scene, embeddedAssets = getEmbeddedAssets()) {
        validateScene(scene);
        if (disposed) throw Error('Stage closed.');
        const item = scenes.backgrounds[scene.backgroundId];
        if (!item) return { scene: structuredClone(scene), image: null };
        if (!cache.has(item.path) && !pending.has(item.path)) {
            let cancel;
            const promise = new Promise((resolve, reject) => {
                const image = new window.Image();
                const timer = window.setTimeout(() => done(Error('Background load timed out. Retry or choose Plain stage.')),
                    10000);
                const done = error => {
                    window.clearTimeout(timer);
                    image.onload = image.onerror = null;
                    if (error) {
                        image.src = '';
                        reject(error);
                    } else if (image.naturalWidth !== item.width || image.naturalHeight !== item.height)
                        reject(Error('Background dimensions do not match the curated scene.'));
                    else {
                        cache.set(item.path, image);
                        resolve(image);
                    }
                };
                cancel = () => done(Error('Stage closed.'));
                image.onload = () => done();
                image.onerror = () => done(Error('Background unavailable. Retry or explicitly choose Plain stage; no fallback was applied.'));
                const embedded = embeddedAssets[item.path];
                image.src = embedded ? `data:image/svg+xml;base64,${embedded}` : new URL(`assets/lpc/${item.path}`,
                    baseUrl).href;
            });
            pending.set(item.path, { promise, cancel });
            promise.finally(() => pending.delete (item.path)).catch (() => {});
        }
        const image = cache.get(item.path) ?? await pending.get(item.path).promise;
        if (disposed) throw Error('Stage closed.');
        return { scene: structuredClone(scene), image };
    }
    function publish(prepared, { transition = true } = {}) {
        if (disposed || !element) return;
        const scene = validateScene(prepared.scene),
            changed = element.dataset.background !== scene.backgroundId || element.dataset.light !== (scene.lightId
                ?? 'day');
        cancelTransition();
        if (changed || !latest) {
            const old = latest, layer = document.createElement('div');
            layer.className = 'lpc-background-layer';
            layer.style.filter = lightFilter(scene.lightId);
            if (prepared.image) {
                const canvas = document.createElement('canvas');
                canvas.width = 320;
                canvas.height = 240;
                canvas.getContext('2d').drawImage(prepared.image, 0, 0);
                layer.append(canvas);
            } else
                layer.style.background = 'linear-gradient(0deg,#53634c 0 18%,#6f7a59 18% 20%,transparent 20%),radial-gradient(ellipse at 30% 30%,#6b8c87,#344f50 60%,#263a40)';
            // Plain stage retains its existing local CSS artwork.
            backdrop.append(layer);
            latest = layer;
            if (old && transition && !motion.matches && !document.hidden) {
                animation = layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
                const current = animation;
                current.finished.then(() => {
                    if (animation === current) {
                        animation = null;
                        old.remove();
                    }
                }).catch (() => {});
            } else old?.remove();
        }
        element.dataset.background = scene.backgroundId;
        element.dataset.light = scene.lightId ?? 'day';
        element.style.setProperty('--lpc-size', `${192*scene.scale}px`);
        element.style.setProperty('--lpc-x', `${scene.x*100}%`);
        element.style.setProperty('--lpc-y', `${scene.y*100}%`);
        element.style.setProperty('--lpc-shift-x', `${-scene.x*100}%`);
        element.style.setProperty('--lpc-shift-y', `${-scene.y*100}%`);
        const caption = element.querySelector('.lpc-stage-caption');
        if (caption) {
            const captionText = `${scenes.backgrounds[scene.backgroundId]?.name??'Plain stage'} · visual backdrop`;
            caption.textContent = captionText;
            caption.title = captionText;
            caption.prepend(createIcon(document, 'trees'));
        }
    }
    const suspend = () => {
        if (document.hidden || motion.matches) cancelTransition();
    };
    document.addEventListener('visibilitychange', suspend);
    motion.addEventListener('change', suspend);
    return {
        prepare,
        publish,
        cancelTransition,
        stats: () => ({
            decodedBackgrounds: cache.size,
            decodedBytes: [...cache.values()].reduce((n, img) => n +img.naturalWidth * img.naturalHeight * 4, 0),
            pending: pending.size,
            transitionActive: Boolean(animation)
        }),
        dispose() {
            if (disposed) return;
            disposed = true;
            cancelTransition();
            for (const value of pending.values()) value.cancel();
            pending.clear();
            cache.clear();
            latest = null;
            backdrop.remove();
            document.removeEventListener('visibilitychange', suspend);
            motion.removeEventListener('change', suspend);
        }
    };
}
