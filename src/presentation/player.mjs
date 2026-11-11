import { drawSourceFrame } from './source-frames.mjs';
export const CUE_REPEAT_MS = 7000;
export function drawFrame(target, sheet, facing, frame = 0, options) {
    if (sheet.layout.sourceBounds || options?.fitExtents) return drawSourceFrame(target, sheet, facing, frame, options);
    const { layout, canvas } = sheet;
    const row = layout.directions.indexOf(facing);
    if (row < 0) throw Error('Facing is unavailable for this animation.');
    const context = target.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(
        canvas,
        layout.cycle[frame % layout.cycle.length] * layout.frameWidth,
        row * layout.frameHeight,
        layout.frameWidth,
        layout.frameHeight,
        0,
        0,
        target.width,
        target.height
    );
    target.dataset.frame = String(frame);
}

/** One loop owner. Cues replace each other; publish interrupts and installs the new rest. */
export function createPlayer(canvas, stage, window, drawing = {}) {
    const document = canvas.ownerDocument;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let sheet,
        facing = 'south',
        rest,
        cue,
        paused = false,
        visible = true,
        disposed = false;
    let request = 0,
        frame = 0,
        last = null,
        elapsed = 0,
        blinking = false;
    let fitExtents = null;
    const isBlinking = () => Boolean((!cue || cue.cooldown) && sheet?.blinkCanvas && elapsed >= 3650 && (elapsed % 3800) >= 3650);
    const draw = () => drawFrame(
        canvas,
        isBlinking() ? { ...sheet, canvas: sheet.blinkCanvas } : sheet,
        facing,
        frame,
        { placement: drawing.placement?.(), fitExtents }
    );
    function allowed() {
        return !disposed && sheet && !paused && !motion.matches && visible && !document.hidden && (cue || sheet.layout.cycle.length > 1
            || Boolean(sheet.blinkCanvas) || Boolean(sheet.canBlink));
    }
    function finish(reason) {
        const completed = cue;
        cue = null;
        blinking = false;
        if (rest) {
            sheet = rest.sheet;
            facing = rest.facing;
            frame = 0;
            draw();
        }
        if (!completed?.cooldown) completed?.done(reason);
    }
    function tick(time) {
        request = 0;
        if (!allowed()) return;
        if (last === null) last = time;
        const delta = time -last;
        last = time;
        elapsed += delta;
        if (cue) {
            if (cue.cooldown) {
                if (elapsed >= cue.repeatMs) {
                    cue.cooldown = false;
                    cue.index = 0;
                    elapsed = 0;
                    frame = 0;
                    blinking = false;
                    sheet = cue.steps[0].sheet;
                    facing = cue.direction;
                    draw();
                    cue.progress?.(0, cue.steps.length);
                }
            } else if (elapsed >= cue.steps[cue.index].durationMs) {
                elapsed = 0;
                cue.index++;
                if (cue.index === cue.steps.length) {
                    if (cue.repeatMs > 0 && rest) {
                        cue.cooldown = true;
                        blinking = false;
                        sheet = rest.sheet;
                        facing = rest.facing;
                        frame = 0;
                        draw();
                        cue.done?.('completed');
                    } else {
                        finish('completed');
                        elapsed = 0;
                    }
                } else {
                    sheet = cue.steps[cue.index].sheet;
                    frame = 0;
                    draw();
                    cue.progress?.(cue.index, cue.steps.length);
                }
            }
        }
        if ((!cue || cue.cooldown) && !sheet.blinkCanvas && sheet.canBlink && elapsed >= 2000) {
            const target = sheet;
            void target.ensureBlink?.(() => !disposed && rest?.sheet === target)?.then(() => {
                if (!disposed && sheet === target) refresh();
            });
        }
        const next = (cue && !cue.cooldown) || sheet.layout.cycle.length > 1 ? Math.floor(elapsed / sheet.layout.frameMs)
            : 0;
        const nextBlink = isBlinking();
        if (next !== frame || nextBlink !== blinking) {
            frame = next;
            blinking = nextBlink;
            draw();
        }
        if (allowed()) request = window.requestAnimationFrame(tick);
    }
    function refresh() {
        if (request) window.cancelAnimationFrame(request);
        request = 0;
        last = null;
        if (motion.matches && cue) {
            if (cue.cooldown) cue = null;
            else finish('reduced-motion');
        }
        if (allowed()) request = window.requestAnimationFrame(tick);
    }
    const observer = new window.IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        refresh();
    });
    observer.observe(stage);
    document.addEventListener('visibilitychange', refresh);
    motion.addEventListener('change', refresh);
    return {
        publish(next, direction) {
            if (disposed) return;
            if (!next.layout.directions.includes(direction) && !next.layout.authoredDirectionOnly) throw Error('Facing is unavailable for this animation.');
            cue = null;
            blinking = false;
            rest = { sheet: next, facing: direction };
            sheet = next;
            facing = direction;
            frame = elapsed = 0;
            draw();
            refresh();
        },
        playOnce(next, direction, durationMs, done = () => {}, options = {}) {
            this.playSequence([{ sheet: next, durationMs }], direction, done, undefined, options);
        },
        playSequence(steps, direction, done = () => {}, progress = () => {}, options = {}) {
            if (disposed || !rest) throw Error('No resting presentation is ready.');
            if (!Array.isArray(steps) || steps.length < 1 || steps.length > 4) throw Error('A sequence needs 1–4 prepared steps.');
            let total = 0;
            for (const step of steps) {
                if (!step.sheet?.layout.directions.includes(direction) && !step.sheet?.layout.authoredDirectionOnly) throw Error('Facing is unavailable for a sequence step.');
                const minimum = step.sheet.layout.cycle.length * step.sheet.layout.frameMs;
                if (!Number.isInteger(step.durationMs) || step.durationMs < minimum || step.durationMs > 10000)
                    throw Error('Each action must include its full cycle and last at most 10 seconds.');
                total += step.durationMs;
            }
            if (total > 20000) throw Error('Sequence exceeds 20 seconds.');
            const repeatMs = Number.isInteger(options?.repeatMs) && options.repeatMs > 0 ? options.repeatMs : 0;
            cue = {
                steps: [...steps],
                direction,
                index: 0,
                done,
                progress,
                repeatMs,
                cooldown: false
            };
            sheet = steps[0].sheet;
            facing = direction;
            frame = elapsed = 0;
            draw();
            progress(0, steps.length);
            refresh();
        },
        cancel() {
            if (cue) {
                finish('cancelled');
                elapsed = 0;
                refresh();
            }
        },
        pause(value) {
            paused = value;
            refresh();
        },
        redraw() {
            if (sheet && !disposed) draw();
        },
        setFitExtents(value) {
            fitExtents = value;
            if (sheet && !disposed) draw();
        },
        dispose() {
            disposed = true;
            cue = rest = null;
            refresh();
            observer.disconnect();
            motion.removeEventListener('change', refresh);
            document.removeEventListener('visibilitychange', refresh);
            sheet = null;
        },
    };
}
