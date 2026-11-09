import { ARTWORK_LICENSE_URLS, selectedArtworkLicenses } from './artwork-licenses.mjs';
import { catalog } from '../catalog/catalog.mjs';
import { validateDefinition } from './validate.mjs';
import { importGeneratorPreset } from './generator-import.mjs';
import { sceneCredit, partySceneCredit } from '../catalog/scenes.mjs';

export function exportCompanion(definition) {
    const checked = validateDefinition(definition);
    const ids = new Set(Object.entries(checked.identity).filter(([slot]) => !['bodyType','bald'].includes(slot)).map(([, value]) => value.itemId));
    for (const outfit of checked.outfits) for (const value of Object.values(outfit.selections)) ids.add(value.itemId);
    const selectedLicenses=selectedArtworkLicenses(ids),mixed=Object.values(selectedLicenses).some(license=>license!=='OGA-BY 3.0');
    return { schemaVersion: 1, kind: 'companion-package', requiredCatalog: catalog.version, definition: checked,
        attribution: { upstreamCommit: catalog.upstreamCommit, artworkLicense: mixed?'mixed':'OGA-BY 3.0', codeLicense: 'GPL-3.0',
            licenseUrls: { artwork: mixed?Object.fromEntries([...new Set(Object.values(selectedLicenses))].map(license=>[license,ARTWORK_LICENSE_URLS[license]])):ARTWORK_LICENSE_URLS['OGA-BY 3.0'], code: 'https://www.gnu.org/licenses/gpl-3.0.html' },
            ...(mixed?{selectedLicenses}:{}),
            ...([...ids].some(id=>catalog.items[id].upstreamSource)?{sources:Object.fromEntries([...ids].filter(id=>catalog.items[id].upstreamSource).map(id=>[id,structuredClone(catalog.items[id].upstreamSource)]))}:{}),
            items: Object.fromEntries([...ids].map(id => [id, structuredClone(catalog.items[id].credits)])),
            ...(sceneCredit(checked) ? { scene:sceneCredit(checked) } : {}),
            ...(partySceneCredit(checked) ? { partyScene:partySceneCredit(checked) } : {}) } };
}

export function importCompanion(text, localId) {
    if (typeof text !== 'string' || text.length > 512_000) throw Error('Companion import exceeds 512 KB.');
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a companion package or generator version-2 preset object.');
    if (value.kind === 'companion-package') {
        if (value.schemaVersion !== 1 || value.requiredCatalog !== catalog.version
            || Object.keys(value).some(key => !['schemaVersion', 'kind', 'requiredCatalog', 'definition', 'attribution'].includes(key))) throw Error('Unsupported companion package.');
        const definition = validateDefinition(value.definition);
        if(exportCompanion(definition).attribution.artworkLicense==='mixed'||exportCompanion(definition).attribution.sources){const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);if(canonical(value.attribution)!==canonical(exportCompanion(definition).attribution))throw Error('Artwork attribution or source provenance is missing or altered.');}
        definition.characterId = localId;
        return definition;
    }
    return importGeneratorPreset(value, localId);
}
