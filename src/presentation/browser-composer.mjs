import { recolorImageCPU } from '../../vendor/lpc/lpc-core.js';
import {
    CURATED_BANK_ANIMATIONS,
    EXTRA_ANIMATION_LAYOUTS,
    curatedMoodSelections,
    enhancedCuratedCatalog,
    isBankBackedMood,
    isCuratedBankAssetPath,
} from '../catalog/curated-enhancements.mjs';
import { createComposer } from '../composition/composer.mjs';
import { openFullArtBank } from './full-library.mjs';

const HEAD_SLOTS = new Set(['head', 'expression', 'hair', 'beard', 'ears']);
const BANK_ANIMATION_SET = new Set(CURATED_BANK_ANIMATIONS);

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

function bankUnavailableError(message = 'Optional full-source artwork bank is unavailable.') {
    const error = Error(message);
    error.code = 'bank_enhancement_unavailable';
    return error;
}

const isBankUnavailableError = error => error?.code === 'bank_enhancement_unavailable';

const isIntegrityFailure = error => /verification|source mismatch|Invalid compiled/i.test(error?.message ?? '');

const bankPathsByStore = new WeakMap();

export function createBrowserComposer(document, baseUrl, getEmbeddedAssets = () => ({}), options = {}) {
    const { fullRuntime = null, allowBankEnhancements = true } = options;
    const pending = new Set();
    let libraryPromise = null;
    let ownsLibrary = false;
    let bankUnavailable = !allowBankEnhancements;
    let disposed = false;

    function effectiveMoodId(moodId) {
        if (!moodId || (bankUnavailable && isBankBackedMood(moodId))) return null;
        return moodId;
    }

    function getBankLibrary() {
        if (!allowBankEnhancements || bankUnavailable) return Promise.reject(bankUnavailableError());
        if (!libraryPromise) {
            const sourcePromise = fullRuntime?.getBank
                ? fullRuntime.getBank()
                : (ownsLibrary = true, openFullArtBank({ baseUrl, document }));
            libraryPromise = sourcePromise.then(lib => {
                if (disposed) {
                    if (ownsLibrary) lib.dispose();
                    throw Error('Renderer closed.');
                }
                let byPath = bankPathsByStore.get(lib);
                if (!byPath) {
                    byPath = new Map(lib.assets.map(a => [a.path, a.sha256]));
                    bankPathsByStore.set(lib, byPath);
                }
                return { lib, byPath };
            }).catch(error => {
                libraryPromise = null;
                if (disposed || error?.message === 'Renderer closed.' || isIntegrityFailure(error)) throw error;
                bankUnavailable = true;
                throw bankUnavailableError(error?.message);
            });
        }
        return libraryPromise;
    }

    const composer = createComposer({
        catalog: enhancedCuratedCatalog,
        createCanvas(width, height) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        },
        loadImage(path) {
            const embedded = getEmbeddedAssets()[path];
            if (!embedded && isCuratedBankAssetPath(path)) {
                return getBankLibrary().then(({ lib, byPath }) => {
                    const sha = byPath.get(path);
                    if (!sha) throw bankUnavailableError('Optional full-source sprite is absent.');
                    return lib.loadImage(path, sha).catch(error => {
                        if (disposed || isIntegrityFailure(error)) throw error;
                        throw bankUnavailableError(error?.message);
                    });
                });
            }
            return new Promise((resolve, reject) => {
                const image = new Image();
                const timeout = setTimeout(() => done(Error('Asset load timed out. Retry when local assets are available.')), 10000);
                const cancel = () => done(Error('Renderer closed.'));
                function done(error) {
                    clearTimeout(timeout);
                    pending.delete(cancel);
                    image.onload = null;
                    image.onerror = null;
                    if (error) {
                        image.src = '';
                        reject(error);
                    } else {
                        resolve(image);
                    }
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

    async function composeNeutralIdleFallback(selections) {
        const fallback = await composer.compose(selections, 'idle');
        return { ...fallback, bankFallback: true };
    }

    async function composeRaw(selections, animation, moodId = null) {
        const resolvedMood = effectiveMoodId(moodId);
        if (bankUnavailable && BANK_ANIMATION_SET.has(animation)) {
            return composeNeutralIdleFallback(selections);
        }
        if (animation === 'hurt') {
            try {
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
            } catch (error) {
                if (!isBankUnavailableError(error)) throw error;
                return composeNeutralIdleFallback(selections);
            }
        }
        const targetSelections = curatedMoodSelections(selections, resolvedMood, enhancedCuratedCatalog);
        try {
            const sheet = await composer.compose(targetSelections, animation);
            return resolvedMood !== moodId ? { ...sheet, bankFallback: true } : sheet;
        } catch (error) {
            if (!isBankUnavailableError(error)) throw error;
            const fallbackAnimation = BANK_ANIMATION_SET.has(animation) ? 'idle' : animation;
            const fallback = await composer.compose(selections, fallbackAnimation);
            return { ...fallback, bankFallback: true };
        }
    }

    async function attachBlink(sheet, selections, animation, moodId) {
        if (!allowBankEnhancements || bankUnavailable || sheet.bankFallback || moodId === 'closed' || animation === 'hurt' || animation === 'run' || animation === 'jump' || BANK_ANIMATION_SET.has(animation)) {
            return sheet;
        }
        try {
            const blink = await composer.compose(curatedMoodSelections(selections, 'closed', enhancedCuratedCatalog), animation);
            return { ...sheet, blinkCanvas: blink.canvas };
        } catch {
            return sheet;
        }
    }

    function canAttachBlink(selections, animation, moodId) {
        if (!allowBankEnhancements || bankUnavailable || moodId === 'closed' || animation === 'hurt' || animation === 'run' || animation === 'jump' || BANK_ANIMATION_SET.has(animation)) {
            return false;
        }
        const closedSelections = curatedMoodSelections(selections, 'closed', enhancedCuratedCatalog);
        return closedSelections !== selections && Boolean(closedSelections.expression);
    }

    function withLazyBlink(sheet, selections, animation, moodId) {
        if (sheet.bankFallback || !canAttachBlink(selections, animation, moodId)) return sheet;
        let blinkPending = null;
        let settled = false;
        const out = { ...sheet };
        Object.defineProperty(out, 'canBlink', {
            configurable: true,
            enumerable: false,
            get: () => !disposed && !bankUnavailable && (!settled || Boolean(out.blinkCanvas)),
        });
        Object.defineProperty(out, 'ensureBlink', {
            configurable: true,
            enumerable: false,
            value(isCurrent = () => true) {
                if (disposed || bankUnavailable || settled || out.blinkCanvas) return blinkPending ?? Promise.resolve(out);
                if (!blinkPending) {
                    blinkPending = composer.compose(curatedMoodSelections(selections, 'closed', enhancedCuratedCatalog), animation)
                        .then(blink => {
                            settled = true;
                            if (!disposed && isCurrent()) out.blinkCanvas = blink.canvas;
                            return out;
                        })
                        .catch(() => {
                            settled = true;
                            return out;
                        })
                        .finally(() => {
                            blinkPending = null;
                        });
                }
                return blinkPending;
            },
        });
        return out;
    }

    async function composePuppetParts(selections, animation, moodIds) {
        const bodySelections = Object.fromEntries(Object.entries(selections).filter(([slot]) => !HEAD_SLOTS.has(slot)));
        const headSelections = Object.fromEntries(Object.entries(selections).filter(([slot]) => HEAD_SLOTS.has(slot)));
        const bodySheet = await composer.compose(bodySelections, animation);
        const heads = {};
        let baseHeadCanvas = null;
        const ensureBaseHead = async () => {
            if (!baseHeadCanvas) baseHeadCanvas = (await composer.compose(headSelections, animation)).canvas;
            return baseHeadCanvas;
        };
        for (const m of new Set(moodIds)) {
            const resolved = effectiveMoodId(m);
            if (!resolved) {
                heads[m ?? 'base'] = await ensureBaseHead();
                continue;
            }
            try {
                heads[m ?? 'base'] = (await composer.compose(curatedMoodSelections(headSelections, resolved, enhancedCuratedCatalog), animation)).canvas;
            } catch (error) {
                if (!isBankUnavailableError(error)) throw error;
                heads[m ?? 'base'] = await ensureBaseHead();
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
            const sleepCol = hurtSheet.bankFallback ? 0 : 5;
            const out = createCanvas(128, 256);
            const ctx = out.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let row = 0; row < 4; row++) {
                    const y = row * 64;
                    ctx.drawImage(hurtSheet.canvas, sleepCol * 64, y, 64, 64, 0, y, 64, 64);
                    drawBadge(ctx, 'z..', 0, y + 18, 0);
                    ctx.drawImage(hurtSheet.canvas, sleepCol * 64, y, 64, 64, 64, y, 64, 64);
                    drawBadge(ctx, 'Zzz', 64, y + 18, -2);
                }
            }
            return {
                canvas: out,
                ...(hurtSheet.bankFallback ? { bankFallback: true } : {}),
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
            let pauseLeft = walkSheet;
            let pauseRight = walkSheet;
            if (!bankUnavailable) {
                try {
                    pauseLeft = await composeRaw(selections, 'idle', 'thoughtful');
                    pauseRight = await composeRaw(selections, 'idle', 'look_right');
                } catch {}
            } else {
                try {
                    pauseLeft = await composeRaw(selections, 'idle', null);
                    pauseRight = pauseLeft;
                } catch {}
            }
            // 20 frames: 8 walk west (offset +5..-5), 2 pause south-left, 8 walk east (offset -5..+5), 2 pause south-right
            const totalCols = 20;
            const out = createCanvas(totalCols * 64, 256);
            const ctx = out.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = false;
                for (let row = 0; row < 4; row++) {
                    const y = row * 64;
                    for (let i = 0; i < 8; i++) {
                        const dx = Math.round(5 - (i / 7) * 10);
                        ctx.drawImage(walkSheet.canvas, (i + 1) * 64, 1 * 64, 64, 64, i * 64 + dx, y, 64, 64);
                    }
                    for (let i = 8; i < 10; i++) {
                        ctx.drawImage(pauseLeft.canvas, 0, 2 * 64, 64, 64, i * 64 - 5, y, 64, 64);
                    }
                    for (let i = 0; i < 8; i++) {
                        const col = 10 + i;
                        const dx = Math.round(-5 + (i / 7) * 10);
                        ctx.drawImage(walkSheet.canvas, (i + 1) * 64, 3 * 64, 64, 64, col * 64 + dx, y, 64, 64);
                    }
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
                cycle: !sheet.bankFallback && behavior.cycle ? [...behavior.cycle] : sheet.layout.cycle,
                frameMs: behavior.frameMs ?? sheet.layout.frameMs,
            },
        };
        return withLazyBlink(withCycle, selections, phys, moodId);
    }

    return {
        ...composer,
        async compose(selections, animation, moodId = null) {
            const sheet = await composeRaw(selections, animation, moodId);
            return withLazyBlink(sheet, selections, animation, moodId);
        },
        attachBlink,
        composeMotionAction,
        composeActivityEffect,
        dispose() {
            disposed = true;
            for (const cancel of [...pending]) cancel();
            if (ownsLibrary && libraryPromise) libraryPromise.then(({ lib }) => lib.dispose()).catch(() => {});
            composer.dispose();
        },
    };
}
