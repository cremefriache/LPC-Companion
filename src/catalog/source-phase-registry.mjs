import { phaseLayers, phaseLayout } from './source-phase-signatures.mjs';
export function createSourcePhaseRegistry(policy, { version, message }) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
        key = (action, layout) => action +'\n' +JSON.stringify(layout),
        rows = new Map(),
        byItem = new Map(),
        parents = new Map();
    if (policy.schemaVersion !== 1 || policy.sourceCommit !== '86160e7507d6841259cff624a51a63c1d4847ee3') throw Error('Unreviewed source pose policy.');
    for (const row of policy.rows) {
        const id = row.itemId +'\n' +row.action, list = rows.get(id) ?? [];
        list.push({
            ...row,
            bindingKey: key(row.action, row.layout),
            signature: JSON.stringify(row.layers)
        });
        rows.set(id, list);
        const items = byItem.get(row.itemId) ?? [];
        items.push(list.at(-1));
        byItem.set(row.itemId, items);
    }
    for (const [id, entry]of Object.entries(policy.parents)) {
        const bindings = new Map();
        for (const b of entry.bindings) {
            const k = key(b.action, b.layout), list = bindings.get(k) ?? [];
            list.push({ ...b, signature: JSON.stringify(b.layers) });
            bindings.set(k, list);
        }
        parents.set(id, { slot: entry.slot, bindings });
    }
    function selectedParent(recipe, id, k) {
        const entry = parents.get(id);
        return entry && recipe.selections[entry.slot]?.itemId === id && entry.bindings.get(k)?.some(b => b.bodies.includes(recipe.bodyType));
    }
    function knownParent(plan, id, k) {
        const entry = parents.get(id);
        if (!selectedParent(plan.recipe, id, k)) return false;
        const signature = JSON.stringify(phaseLayers(plan, id));
        return entry.bindings.get(k).some(b => b.bodies.includes(plan.recipe.bodyType) && b.signature === signature);
    }
    const rigIds = recipe => [recipe.selections.body?.itemId, recipe.selections.head?.itemId];
    function dependencies(recipe, row, plan = null) {
        return row.requiredParents.every(group => group.choices.some(c => recipe.selections[c.slot]?.itemId === c.itemId
            && selectedParent(recipe, c.itemId, row.bindingKey) && (!plan || knownParent(plan, c.itemId, row.bindingKey))));
    }
    /** Exact reviewed original sheets/geometry only; parent alpha is checked by availability. */
    function reviewedPosePhase(plan, itemId) {
        const candidates = rows.get(itemId +'\n' +plan.action);
        if (!candidates) return null;
        const ids = rigIds(plan.recipe),
            layout = phaseLayout(plan),
            signature = JSON.stringify(phaseLayers(plan, itemId));
        for (const row of candidates)
            if (row.bodies.includes(plan.recipe.bodyType) && plan.recipe.selections[row.slot]?.itemId === itemId
                && same(layout, row.layout) && signature === row.signature && ids.every(id => id && knownParent(plan,
                id, row.bindingKey)) && dependencies(plan.recipe, row, plan))
                return {
                    kind: row.kind,
                    parents: ids,
                    blankCells: row.blankCells,
                    message: message ?? (row.kind === 'program_stage' ? 'This prop has an authored setup or release phase.'
                        : 'Some parts are hidden by this authored pose.')
                };
        return null;
    }
    function posePhaseVersion(recipe) {
        for (const selection of Object.values(recipe.selections))
            for (const row of byItem.get(selection.itemId) ?? [])
                if (row.bodies.includes(recipe.bodyType) && rigIds(recipe).every(id => id && selectedParent(recipe,
                    id, row.bindingKey)) && dependencies(recipe, row)) return version;
        return 0;
    }

    return Object.freeze({ reviewed: reviewedPosePhase, version: posePhaseVersion });
}
