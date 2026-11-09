import { recolorImageCPU } from '../../vendor/lpc/lpc-core.js';
import { catalog } from '../catalog/catalog.mjs';
import { createComposer } from '../composition/composer.mjs';
import { EXTRA_ANIMATION_LAYOUTS } from '../state/animation-program.mjs';
import { MOOD_EXPRESSIONS } from '../state/presence.mjs';
import { openFullLibrary } from './full-library.mjs';

const runtimeCatalog = (() => {
    const data = structuredClone(catalog);
    Object.assign(data.animations, EXTRA_ANIMATION_LAYOUTS, {
        hurt: { ...EXTRA_ANIMATION_LAYOUTS.hurt, directions: ['south'] },
    });
    for (const [itemId, item] of Object.entries(data.items)) {
        if (!Object.hasOwn(item.unavailableAnimations ?? {}, 'emote') && item.layers.every(l => l.paths.emote)) {
            for (const layer of item.layers) {
                for (const anim of ['thrust', 'slash', 'shoot', 'combat_idle']) {
                    layer.paths[anim] = layer.paths.emote.replace(/\/emote\.png$/, `/${anim}.png`);
                }
                if (!itemId.startsWith('face_')) {
                    layer.paths.hurt = layer.paths.emote.replace(/\/emote\.png$/, '/hurt.png');
                }
            }
        }
    }
    for (const [moodId, info] of Object.entries(MOOD_EXPRESSIONS)) {
        if (!info.faceDir || info.faceDir === 'neutral') continue;
        for (const [suffix, baseId] of [['', 'face_neutral'], ['_female', 'face_neutral_female'], ['_elder', 'face_neutral_elder']]) {
            const itemId = `face_${moodId}${suffix}`, cloned = structuredClone(data.items[baseId]);
            cloned.name = `${info.label} face`;
            cloned.counterparts = suffix === '_elder' ? {} : { male: `face_${moodId}`, female: `face_${moodId}_female` };
            for (const layer of cloned.layers) {
                for (const [anim, p] of Object.entries(layer.paths)) layer.paths[anim] = p.replace('/neutral/', `/${info.faceDir}/`);
            }
            data.items[itemId] = cloned;
            data.slots.expression.push(itemId);
        }
    }
    return data;
})();

const isBankPath = path => /\/(thrust|slash|shoot|combat_idle|hurt)\.png$/.test(path) || /^spritesheets\/head\/faces\/(male|female|elderly)\/(?!neutral\/)[a-z_]+\//.test(path);

const HEAD_SLOTS = new Set(['head', 'expression', 'hair', 'beard', 'ears']);

const MOTION_KEYFRAMES = {
    nod: [
        [0, 0, 0, 0, null, null],
        [0, 1, 0, 0, 'closed', null],
        [0, 2, 0, 1, 'closed', null],
        [0, 1, 0, 0, null, null],
        [0, 0, 0, 0, null, null],
        [0, 2, 0, 1, 'closed', null],
        [0, 1, 0, 0, null, null],
        [0, 0, 0, 0, null, null],
    ],
    laugh: [
        [0, -1, 0, -1, 'cheerful', null],
        [0, -2, 0, -1, 'cheerful', null],
        [0, 0, 0, 0, 'cheerful', null],
        [0, -2, 0, -1, 'cheerful', null],
        [0, 0, 0, 0, 'cheerful', null],
        [0, -2, 0, -1, 'cheerful', null],
        [0, -1, 0, 0, 'cheerful', null],
        [0, 0, 0, 0, null, null],
    ],
    sigh: [
        [0, -1, 0, -1, 'closed', null],
        [0, -2, 0, -1, 'closed', null],
        [0, -2, 0, -1, 'closed', null],
        [0, 0, 0, 0, 'closed', null],
        [0, 2, 0, 1, 'closed', null],
        [0, 2, 0, 1, 'concerned', null],
        [0, 2, 0, 1, 'concerned', null],
        [0, 1, 0, 0, 'concerned', null],
        [0, 0, 0, 0, null, null],
    ],
    bounce: [
        [0, -3, 0, -3, 'cheerful', null],
        [0, -5, 0, -5, 'cheerful', null],
        [0, -3, 0, -2, 'cheerful', null],
        [0, 1, 0, 0, 'cheerful', null],
        [0, -3, 0, -3, 'cheerful', null],
        [0, -4, 0, -3, 'cheerful', null],
        [0, -1, 0, 0, 'cheerful', null],
        [0, 0, 0, 0, null, null],
    ],
    startle: [
        [0, -5, 0, -4, 'shock', '!'],
        [0, -6, 0, -5, 'shock', '!'],
        [0, -3, 0, -2, 'shock', '!'],
        [0, 1, 0, 0, 'shock', null],
        [0, 0, 0, 0, 'shock', null],
        [0, 0, 0, 0, 'shock', null],
        [0, 0, 0, 0, null, null],
    ],
    shiver: [
        [-1, 1, -1, 0, 'blush', null],
        [1, 1, 1, 0, 'blush', null],
        [-1, 1, -1, 0, 'blush', null],
        [1, 1, 1, 0, 'blush', null],
        [-1, 1, -1, 0, 'blush', null],
        [1, 1, 1, 0, 'blush', null],
        [-1, 0, 0, 0, 'blush', null],
        [0, 0, 0, 0, null, null],
    ],
    shrug: [
        [0, 0, 0, -1, 'thoughtful', null],
        [1, 1, 0, -2, 'eyeroll', null],
        [1, 1, 0, -2, 'eyeroll', null],
        [1, 1, 0, -2, 'eyeroll', null],
        [1, 1, 0, -2, 'eyeroll', null],
        [1, 1, 0, -1, 'thoughtful', null],
        [0, 0, 0, -1, 'thoughtful', null],
        [0, 0, 0, 0, null, null],
    ],
    polite_bow: [
        [0, 1, 0, 0, 'closed', null],
        [0, 2, 0, 1, 'closed', null],
        [0, 3, 0, 1, 'closed', null],
        [0, 3, 0, 1, 'closed', null],
        [0, 3, 0, 1, 'closed', null],
        [0, 2, 0, 1, 'closed', null],
        [0, 1, 0, 0, 'closed', null],
        [0, 0, 0, 0, null, null],
    ],
};

function withMoodSelections(selections, moodId) {
    if (!moodId || moodId === 'none' || !MOOD_EXPRESSIONS[moodId]?.faceDir) return selections;
    const headId = selections?.head?.itemId;
    const suffix = headId === 'heads_human_female' ? '_female' : (headId === 'heads_human_male_elderly' || headId === 'heads_human_female_elderly') ? '_elder' : headId === 'heads_human_male' ? '' : null;
    if (suffix === null) return selections;
    const itemId = moodId === 'calm' ? `face_neutral${suffix}` : `face_${moodId}${suffix}`;
    if (!runtimeCatalog.items[itemId]) return selections;
    const paletteId = selections.expression?.paletteId ?? selections.head?.paletteId ?? selections.body?.paletteId ?? 'body.ulpc.light';
    return { ...selections, expression: { itemId, paletteId } };
}

export function createBrowserComposer(document, baseUrl, getEmbeddedAssets = () => ({})) {
    const pending = new Set();
    let libraryPromise = null, disposed = false;
    function getBankLibrary() {
        if (!libraryPromise) {
            libraryPromise = openFullLibrary({ baseUrl, document }).then(lib => {
                if (disposed) { lib.dispose(); throw Error('Renderer closed.'); }
                const byPath = new Map(lib.assets.map(a => [a.path, a.sha256]));
                return { lib, byPath };
            });
        }
        return libraryPromise;
    }
    const composer = createComposer({
        catalog: runtimeCatalog,
        createCanvas(width, height) {
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
        },
        loadImage(path) {
            const embedded = getEmbeddedAssets()[path];
            if (!embedded && isBankPath(path)) {
                return getBankLibrary().then(({ lib, byPath }) => {
                    const sha = byPath.get(path);
                    if (!sha) throw Error('A local sprite could not load. Retry or reinstall the complete asset pack.');
                    return lib.loadImage(path, sha);
                });
            }
            return new Promise((resolve, reject) => {
                const image = new Image();
                const timeout = setTimeout(() => done(Error('Asset load timed out. Retry when local assets are available.')), 10000);
                const cancel = () => done(Error('Renderer closed.'));
                function done(error) {
                    clearTimeout(timeout); pending.delete(cancel); image.onload = null; image.onerror = null;
                    if (error) { image.src = ''; reject(error); } else resolve(image);
                }
                pending.add(cancel);
                image.onload = () => done();
                image.onerror = () => done(Error('A local sprite could not load. Retry or reinstall the complete asset pack.'));
                image.src = embedded ? `data:image/png;base64,${embedded}` : new URL(`assets/lpc/${path}`, baseUrl).href;
            });
        },
        recolor: (image, source, target) => recolorImageCPU(image, [{ source, target }]),
    });

    function createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    function drawBadge(ctx, badge, cellX, cellY, offsetY = 0) {
        if (!badge || !ctx.fillText) return;
        ctx.save();
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(badge, cellX + 41, cellY + 17 + offsetY);
        ctx.fillStyle = badge === '!' ? '#facc15' : '#bae6fd';
        ctx.fillText(badge, cellX + 40, cellY + 16 + offsetY);
        ctx.restore();
    }

    async function composeRaw(selections, animation, moodId = null) {
        if (animation === 'hurt') {
            const withoutExpression = Object.fromEntries(Object.entries(selections).filter(([slot]) => slot !== 'expression'));
            const single = await composer.compose(withoutExpression, 'hurt');
            const expanded = createCanvas(single.canvas.width, 256);
            const ctx = expanded.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let row = 0; row < 4; row++) ctx.drawImage(single.canvas, 0, row * 64);
            }
            return {
                canvas: expanded,
                layout: { ...EXTRA_ANIMATION_LAYOUTS.hurt },
            };
        }
        return composer.compose(withMoodSelections(selections, moodId), animation);
    }

    async function attachBlink(sheet, selections, animation, moodId) {
        if (moodId === 'closed' || animation === 'hurt' || animation === 'run' || animation === 'jump') return sheet;
        try {
            const blink = await composer.compose(withMoodSelections(selections, 'closed'), animation);
            return { ...sheet, blinkCanvas: blink.canvas };
        } catch {
            return sheet;
        }
    }

    async function composePuppetParts(selections, animation, moodIds) {
        const bodySelections = Object.fromEntries(Object.entries(selections).filter(([slot]) => !HEAD_SLOTS.has(slot)));
        const headSelections = Object.fromEntries(Object.entries(selections).filter(([slot]) => HEAD_SLOTS.has(slot)));
        const bodySheet = await composer.compose(bodySelections, animation);
        const heads = {};
        for (const m of new Set(moodIds)) {
            try {
                heads[m ?? 'base'] = (await composer.compose(withMoodSelections(headSelections, m), animation)).canvas;
            } catch {
                heads[m ?? 'base'] = (await composer.compose(headSelections, animation)).canvas;
            }
        }
        return { bodyCanvas: bodySheet.canvas, heads, layout: bodySheet.layout };
    }

    async function composeMotionAction(selections, behavior, moodId = null) {
        const frames = MOTION_KEYFRAMES[behavior.motion];
        if (!frames) return composeRaw(selections, behavior.animationId, moodId);
        const moodsNeeded = frames.map(f => f[4] ?? moodId);
        const { bodyCanvas, heads } = await composePuppetParts(selections, 'idle', moodsNeeded);
        const cols = frames.length;
        const out = createCanvas(cols * 64, 256);
        const ctx = out.getContext('2d');
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            for (let col = 0; col < cols; col++) {
                const [hDx, hDy, bDx, bDy, frameMood, badge] = frames[col];
                const headCanvas = heads[frameMood ?? moodId ?? 'base'] ?? heads.base;
                for (let row = 0; row < 4; row++) {
                    const y = row * 64;
                    ctx.drawImage(bodyCanvas, 0, y, 64, 64, col * 64 + bDx, y + bDy, 64, 64);
                    ctx.drawImage(headCanvas, 0, y, 64, 64, col * 64 + hDx, y + hDy, 64, 64);
                    if (badge) drawBadge(ctx, badge, col * 64, y);
                }
            }
        }
        return {
            canvas: out,
            layout: {
                frameWidth: 64,
                frameHeight: 64,
                directions: ['north', 'west', 'south', 'east'],
                cycle: frames.map((_, i) => i),
                frameMs: behavior.frameMs ?? 115,
            },
        };
    }

    async function composeActivityEffect(selections, behavior, moodId = null) {
        const effect = behavior.effect;
        if (effect === 'dozing') {
            const { bodyCanvas, heads } = await composePuppetParts(selections, 'sit', ['closed', moodId]);
            const steps = [
                [0, 'closed', 'z', 0],
                [0, 'closed', 'z', 0],
                [1, 'closed', 'z..', -1],
                [1, 'closed', 'z..', -1],
                [2, 'closed', 'Zzz', -2],
                [2, 'closed', 'Zzz', -3],
                [0, moodId, null, 0],
                [1, 'closed', 'z', 0],
            ];
            const out = createCanvas(steps.length * 64, 256);
            const ctx = out.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let col = 0; col < steps.length; col++) {
                    const [hDy, m, badge, bOff] = steps[col];
                    const headCanvas = heads[m ?? 'base'] ?? heads.closed;
                    for (let row = 0; row < 4; row++) {
                        const y = row * 64;
                        ctx.drawImage(bodyCanvas, 0, y, 64, 64, col * 64, y, 64, 64);
                        ctx.drawImage(headCanvas, 0, y, 64, 64, col * 64, y + hDy, 64, 64);
                        if (badge) drawBadge(ctx, badge, col * 64, y + 6, bOff);
                    }
                }
            }
            return {
                canvas: out,
                layout: {
                    frameWidth: 64,
                    frameHeight: 64,
                    directions: ['north', 'west', 'south', 'east'],
                    cycle: steps.map((_, i) => i),
                    frameMs: 480,
                },
            };
        }
        if (effect === 'sleeping') {
            const hurtSheet = await composeRaw(selections, 'hurt', moodId);
            const out = createCanvas(128, 256);
            const ctx = out.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let row = 0; row < 4; row++) {
                    const y = row * 64;
                    ctx.drawImage(hurtSheet.canvas, 5 * 64, y, 64, 64, 0, y, 64, 64);
                    drawBadge(ctx, 'z..', 0, y + 18, 0);
                    ctx.drawImage(hurtSheet.canvas, 5 * 64, y, 64, 64, 64, y, 64, 64);
                    drawBadge(ctx, 'Zzz', 64, y + 18, -2);
                }
            }
            return {
                canvas: out,
                layout: {
                    frameWidth: 64,
                    frameHeight: 64,
                    directions: ['north', 'west', 'south', 'east'],
                    cycle: [0, 1],
                    frameMs: 650,
                },
            };
        }
        if (effect === 'looking_around') {
            const { bodyCanvas, heads } = await composePuppetParts(selections, 'idle', [moodId, 'thoughtful', 'look_right', 'closed']);
            const order = [moodId, 'thoughtful', 'look_right', 'closed'];
            const out = createCanvas(order.length * 64, 256);
            const ctx = out.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let col = 0; col < order.length; col++) {
                    const headCanvas = heads[order[col] ?? 'base'] ?? heads.base;
                    for (let row = 0; row < 4; row++) {
                        const y = row * 64;
                        ctx.drawImage(bodyCanvas, 0, y, 64, 64, col * 64, y, 64, 64);
                        ctx.drawImage(headCanvas, 0, y, 64, 64, col * 64, y, 64, 64);
                    }
                }
            }
            return {
                canvas: out,
                layout: {
                    frameWidth: 64,
                    frameHeight: 64,
                    directions: ['north', 'west', 'south', 'east'],
                    cycle: [0, 0, 1, 1, 0, 2, 2, 3],
                    frameMs: 520,
                },
            };
        }
        if (effect === 'pacing') {
            const walkSheet = await composeRaw(selections, 'walk', moodId);
            let pauseLeft = walkSheet, pauseRight = walkSheet;
            try {
                pauseLeft = await composeRaw(selections, 'idle', 'thoughtful');
                pauseRight = await composeRaw(selections, 'idle', 'look_right');
            } catch {}
            // 20 frames: 8 walk west (offset +5..-5), 2 pause south-left, 8 walk east (offset -5..+5), 2 pause south-right
            const totalCols = 20;
            const out = createCanvas(totalCols * 64, 256);
            const ctx = out.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let row = 0; row < 4; row++) {
                    const y = row * 64;
                    // Walk west (row 1 in LPC)
                    for (let i = 0; i < 8; i++) {
                        const dx = Math.round(5 - (i / 7) * 10);
                        ctx.drawImage(walkSheet.canvas, (i + 1) * 64, 1 * 64, 64, 64, i * 64 + dx, y, 64, 64);
                    }
                    // Pause at left (facing south, row 2)
                    for (let i = 8; i < 10; i++) {
                        ctx.drawImage(pauseLeft.canvas, 0, 2 * 64, 64, 64, i * 64 - 5, y, 64, 64);
                    }
                    // Walk east (row 3 in LPC)
                    for (let i = 0; i < 8; i++) {
                        const col = 10 + i;
                        const dx = Math.round(-5 + (i / 7) * 10);
                        ctx.drawImage(walkSheet.canvas, (i + 1) * 64, 3 * 64, 64, 64, col * 64 + dx, y, 64, 64);
                    }
                    // Pause at right (facing south, row 2)
                    for (let i = 18; i < 20; i++) {
                        ctx.drawImage(pauseRight.canvas, 0, 2 * 64, 64, 64, i * 64 + 5, y, 64, 64);
                    }
                }
            }
            return {
                canvas: out,
                layout: {
                    frameWidth: 64,
                    frameHeight: 64,
                    directions: ['north', 'west', 'south', 'east'],
                    cycle: Array.from({ length: totalCols }, (_, i) => i),
                    frameMs: 165,
                },
            };
        }
        const phys = behavior.physicalAnimationId ?? behavior.animationId;
        const sheet = await composeRaw(selections, phys, moodId);
        const withCycle = {
            ...sheet,
            layout: {
                ...sheet.layout,
                cycle: behavior.cycle ? [...behavior.cycle] : sheet.layout.cycle,
                frameMs: behavior.frameMs ?? sheet.layout.frameMs,
            },
        };
        return attachBlink(withCycle, selections, phys, moodId);
    }

    return {
        ...composer,
        async compose(selections, animation, moodId = null) {
            const sheet = await composeRaw(selections, animation, moodId);
            return attachBlink(sheet, selections, animation, moodId);
        },
        composeMotionAction,
        composeActivityEffect,
        dispose() {
            disposed = true;
            for (const cancel of [...pending]) cancel();
            if (libraryPromise) libraryPromise.then(({ lib }) => lib.dispose()).catch(() => {});
            composer.dispose();
        },
    };
}
