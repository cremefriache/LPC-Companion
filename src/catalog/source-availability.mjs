import { reviewedSourcePhase } from './source-phases.mjs';
import { inspectSourceVisibility } from './full-coverage.mjs';
import { inspectSourceColors } from './full-color-coverage.mjs';
export class SourceAvailabilityError extends Error {
    constructor(code, message, details) {
        super(message);
        this.name = 'SourceAvailabilityError';
        this.code = code;
        this.details = details;
    }
}

/** Compiled decoded evidence only. No image fetches or inferred replacement art. */
export function createSourceAvailability({ catalog, evidenceFor }) {
    const baseline = new Map();
    function expectedDirections(recipe, itemId) {
        const key = JSON.stringify([
            itemId,
            recipe.bodyType,
            Object.entries(recipe.selections).map(([s, v]) => [s, v.itemId, v.variant])
        ]);
        if (baseline.has(key)) {
            const hit = baseline.get(key);
            baseline.delete (key);
            baseline.set(key, hit);
            return hit;
        }
        const visible = new Set();
        for (const plan of catalog.itemPlans(recipe, itemId))
            for (const item of inspectSourceVisibility(plan, evidenceFor))
                for (const frame of item.frames)
                    if (frame.measurable && !frame.blank) visible.add(frame.direction);
        if (baseline.size >= 256) baseline.delete (baseline.keys().next().value);
        baseline.set(key, visible);
        return visible;
    }
    function validate(plan, presentation) {
        const held = presentation.playback.mode === 'hold',
            selected = {
                ...plan,
                layout: {
                    ...plan.layout,
                    cycle: held ? [presentation.playback.frame] : plan.layout.cycle
                }
            },
            view = plan.layout.authoredDirectionOnly ? 'authored' : presentation.facing;
        const visibility = inspectSourceVisibility(selected, evidenceFor);
        for (const item of visibility) {
            if (item.unmeasurable)
                throw new SourceAvailabilityError(
                    'missing_coverage',
                    'Pixel coverage is unavailable for this source pose.',
                    { itemId: item.itemId, action: plan.action }
                );
            const expected = expectedDirections(plan.recipe, item.itemId),
                direction = view,
                frames = item.frames.filter(f => f.direction === view);
            const reviewed = reviewedSourcePhase(plan, item.itemId),
                parents = reviewed && (reviewed.parents ?? [reviewed.baseId]).map(id => visibility.find(i => i.itemId === id)),
                unexplained = frames.filter(f => f.blank && !((reviewed?.blankCells ?? []).some(([d, c]) => d === f.direction
                    && c === f.column) && parents?.every(parent => parent?.frames.some(p => p.direction === f.direction
                    && p.column === f.column && p.measurable && !p.blank))));
            if (!expected.size || (view === 'authored' || expected.has(direction)) && unexplained.length)
                throw new SourceAvailabilityError(
                    'incomplete_pose',
                    `${catalog.item(item.itemId).name} has incomplete ${plan.action} art for this view. Choose another pose, frame or direction.`,
                    {
                        itemId: item.itemId,
                        action: plan.action,
                        direction,
                        frames: unexplained.map(f => f.column)
                    }
                );
        }
        const channels = new Map();
        for (const layer of plan.layers) {
            if (!layer.palettes.length) continue;
            const colors = evidenceFor(layer.sha256).colors,
                histogram = Object.fromEntries(colors.map(c => [c, 1])),
                report = inspectSourceColors(layer.palettes, histogram);
            layer.palettes.forEach((mapping, n) => {
                const key = layer.itemId +'/' +mapping.channel,
                    entry = channels.get(key) ?? {
                        itemId: layer.itemId,
                        channel: mapping.channel,
                        matches: 0,
                        inactiveAllowed: true
                    };
                entry.inactiveAllowed &&= Boolean(mapping.inactiveReason);
                entry.matches += report.channels[n].matchedPixels;
                channels.set(key, entry);
            });
        }
        for (const entry of channels.values())
            if (!entry.matches && !entry.inactiveAllowed)
                throw new SourceAvailabilityError(
                    'unrecolorable_channel',
                    `${catalog.item(entry.itemId).name} has no source pixels for this color channel. Choose authored colors or another item.`,
                    entry
                );
        return plan;
    }
    return Object.freeze({
        validate,
        stats: () => ({ baselineEntries: baseline.size, maxBaselineEntries: 256 }),
        clear: () => baseline.clear()
    });
}
