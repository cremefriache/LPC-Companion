import { getSourceCertificate } from './source-certificates.mjs';
import { phaseLayers, phaseLayout } from './source-phase-signatures.mjs';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let cachedPolicy = null, byItem = null;
function getByItem() {
    const policy = getSourceCertificate('native-repairs.json');
    if (policy === cachedPolicy) return byItem;
    if (policy.schemaVersion !== 1 || policy.sourceCommit !== '86160e7507d6841259cff624a51a63c1d4847ee3') throw Error('Unreviewed native-frame preparation.');
    const next = new Map();
    for (const rule of policy.rules) {
        const rows = next.get(rule.itemId) ?? [];
        rows.push(rule);
        next.set(rule.itemId, rows);
    }
    cachedPolicy = policy;
    byItem = next;
    return byItem;
}
function selected(recipe, r) {
    return recipe.bodyType === r.bodyType && recipe.selections[r.slot]?.itemId === r.itemId && recipe.selections[r.slot]
        .variant === r.targetVariant && recipe.selections.body?.itemId === r.bodyId && recipe.selections.body.variant === r.bodyVariant
        && recipe.selections.head?.itemId === r.headId && recipe.selections.head.variant === r.headVariant;
}
export function nativePreparationIds(recipe) {
    const map = getByItem();
    return [...new Set(Object.values(recipe.selections).flatMap(s => (map.get(s.itemId) ?? []).filter(r => selected(recipe,
        r)).map(r => r.transformId)))];
}
export function nativeRepairVersion(recipe) {
    return nativePreparationIds(recipe).length ? 7 : 0;
}
export function attachNativeSourcePreparation(plan) {
    const map = getByItem();
    for (const selection of Object.values(plan.recipe.selections))
        for (const r of map.get(selection.itemId) ?? [])
            if (r.action === plan.action && selected(plan.recipe, r) && same(phaseLayout(plan), r.layout) && same(phaseLayers(plan,
                r.itemId), r.targetLayers) && same(phaseLayers(plan, r.bodyId), r.bodyLayers) && same(phaseLayers(plan,
                r.headId), r.headLayers)) {
                const layer = plan.layers.find(l => l.itemId === r.itemId);
                if (layer.sourceTransformId) throw Error('Conflicting source preparations.');
                layer.sourceTransformId = r.transformId;
                plan.warnings.push({
                    code: 'reviewed_terminal_source',
                    itemId: r.itemId,
                    message: 'Missing terminal frames use existing artwork with matching body and head poses.'
                });
                break;
            }
}
