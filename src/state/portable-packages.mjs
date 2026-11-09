import hairNotices from '../../vendor/lpc/hair-notices.json' with {type:'json'};
import { catalog } from '../catalog/catalog.mjs';
import { validateDefinition } from './validate.mjs';
import { exportCompanion, importCompanion } from './packages.mjs';
import { PACKAGE_LIMIT, encodePng, decodePng, digest, validateEmbeddedAssets } from './portable-assets.mjs';
import notices from '../../vendor/lpc/package-notices.json' with { type: 'json' };
import { partyScene } from './party.mjs';
import { scenes } from '../catalog/scenes.mjs';
const noticesFor = definition => ({...notices,...(Object.values(exportCompanion(definition).attribution.selectedLicenses??{}).includes('CC0')?hairNotices:{}),...((scenes.backgrounds[definition.startingPresentation.scene.backgroundId] || scenes.backgrounds[partyScene(definition.startingPresentation.partySceneId).backgroundId]) ? {'LICENSE-scene-MIT.txt':scenes.licenseText} : {})});
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

export function requiredArtwork(definition,{activityAssets=true}={}) {
    const ids = Object.keys(exportCompanion(definition).attribution.items);
    const background = scenes.backgrounds[definition.startingPresentation.scene.backgroundId];
    return [...new Set([...ids.flatMap(id => catalog.items[id].layers.flatMap(layer => Object.entries(layer.paths).filter(([id])=>activityAssets||!['sit','emote'].includes(id)).map(([,path])=>path))),...(background ? [background.path] : []),...(scenes.backgrounds[partyScene(definition.startingPresentation.partySceneId).backgroundId] ? [scenes.backgrounds[partyScene(definition.startingPresentation.partySceneId).backgroundId].path] : [])])].sort();
}
export async function exportPortableCompanion(definition, { loadBytes, preview }) {
    const value = exportCompanion(definition), assets = {};
    for (const path of requiredArtwork(definition)) assets[path] = encodePng(await loadBytes(path));
    validateEmbeddedAssets(assets);
    const bytes = decodePng(preview, 128, 128);
    const result = { ...value, schemaVersion: 2, activityAssetsVersion:1, assets, preview: { width: 128, height: 128, png: preview, sha256: digest(bytes) }, notices:noticesFor(definition) };
    if (JSON.stringify(result).length > PACKAGE_LIMIT) throw Error('Complete companion package exceeds 2 MB.');
    return result;
}
export function importCompanionDocument(text, localId) {
    if (typeof text !== 'string' || text.length > PACKAGE_LIMIT) throw Error('Companion import exceeds 2 MB.');
    const value = JSON.parse(text);
    if (value?.kind !== 'companion-package' || value.schemaVersion !== 2) return { definition: importCompanion(text, localId), embeddedAssets: {} };
    if (value.requiredCatalog !== catalog.version || Object.keys(value).some(key => !['schemaVersion','kind','requiredCatalog','definition','attribution','assets','preview','notices','activityAssetsVersion'].includes(key))) throw Error('Unsupported complete companion package.');
    if(value.activityAssetsVersion!==undefined&&value.activityAssetsVersion!==1)throw Error('Unsupported activity artwork version.');
    const definition = validateDefinition(value.definition), expected = exportCompanion(definition);
    if (!same(value.attribution, expected.attribution) || !same(value.notices, noticesFor(definition))) throw Error('Package attribution or license notices are missing or altered.');
    const embeddedAssets = validateEmbeddedAssets(value.assets);
    if (JSON.stringify(Object.keys(embeddedAssets).sort()) !== JSON.stringify(requiredArtwork(definition,{activityAssets:value.activityAssetsVersion===1}))) throw Error('Package artwork is missing or contains unused assets.');
    if(value.activityAssetsVersion===undefined&&['sit_low','sit_upright'].includes(definition.startingPresentation.activityId))throw Error('A held-pose package requires activity artwork version 1.');
    const preview = value.preview;
    if (!preview || Object.keys(preview).sort().join(',') !== 'height,png,sha256,width' || preview.width !== 128 || preview.height !== 128
        || digest(decodePng(preview.png,128,128)) !== preview.sha256) throw Error('Invalid package preview.');
    // Imported previews are never decoded into the UI. Recompose from verified artwork.
    definition.characterId = localId;
    return { definition, embeddedAssets };
}
