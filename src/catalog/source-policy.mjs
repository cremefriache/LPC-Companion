import hairShadow from '../../vendor/lpc/full-catalog/hair-shadow.json' with { type: 'json' };
import { getSourceCertificate } from './source-certificates.mjs';
import hair from '../../vendor/lpc/hair-provenance.json' with { type: 'json' };
const getColorPolicy = () => getSourceCertificate('color-policy.json');
// These are existing reviewed corrections, not a wider matching tolerance or pixel edits.
export function sourceAliases(itemId) {
    return ['hair_natural', 'hair_bob'].includes(itemId) ? hair.items[itemId].sourceColorAliases : {};
}
export function sourcePathProblem(itemId, path, action, sha256) {
    if (itemId === 'shield_heater_revised_wood' && action === 'spellcast')
        return 'This shield has blank south-facing Cast art; Cast is unavailable with it.';
    if (path === 'spritesheets/legs/formal/male/walk.png' && !sourceLayerColorCorrection(itemId, path, sha256, action)
        ?.unquarantine)
        return 'Formal Pants male Walk uses off-palette green art and remains quarantined.';
    return null;
}

export function sourceInactiveColor(itemId, path, sha256, action, channel) {
    const colorPolicy = getColorPolicy();
    if (colorPolicy.schemaVersion !== 1 || colorPolicy.sourceCommit !== '86160e7507d6841259cff624a51a63c1d4847ee3') throw Error('Unreviewed source color policy.');
    return colorPolicy.inactiveChannels.find(row => row.itemId === itemId && row.path === path && row.sha256 === sha256
        && row.action === action && row.channel === channel)?.reason ?? null;
}

export const sourceNeedsColorPolicy = (itemId, channels) => getColorPolicy().inactiveChannels.some(row => row.itemId === itemId
    && channels.includes(row.channel));

export function sourceLayerColorCorrection(itemId, path, sha256, action) {
    const colorPolicy = getColorPolicy();
    if (colorPolicy.schemaVersion !== 1 || colorPolicy.sourceCommit !== '86160e7507d6841259cff624a51a63c1d4847ee3') throw Error('Unreviewed source color policy.');
    return colorPolicy.layerCorrections?.find(row => row.itemId === itemId && row.path === path && row.sha256 === sha256
        && row.action === action) ?? null;
}
export function sourceLayerPolicyVersion(itemId, bodyType, channels) {
    return Math.max(0, ...(getColorPolicy().layerCorrections ?? []).filter(row => row.itemId === itemId && row.bodies.includes(bodyType)
        && (row.unquarantine || Object.keys(row.channels).some(c => channels.includes(c)))).map(row => row.requiredVersion));
}

export const sourceSharedPhysicalColor = itemId => getColorPolicy().sharedPhysicalColors?.find(row => row.itemId === itemId)
    ?? null;

export function sourceExtraShadeTarget(key, paletteId) {
    const colorPolicy = getColorPolicy();
    if (key !== 'hair_shadow_2021' || hairShadow.schemaVersion !== 1 || hairShadow.sourceCommit !== colorPolicy.sourceCommit) throw Error('Unreviewed extra-shade target table.');
    return hairShadow.extraShadeTargets[paletteId] ?? null;
}

export function sourceRenderingReferenceIds(itemId, bodyType, channels) {
    return [...new Set((getColorPolicy().layerCorrections ?? []).filter(row => row.itemId === itemId && row.bodies.includes(bodyType))
        .flatMap(row => Object.entries(row.channels).filter(([channel, spec]) => channels.includes(channel) && spec.extraShadeTargets)
        .map(([, spec]) => spec.extraShadeTargets)))];
}
