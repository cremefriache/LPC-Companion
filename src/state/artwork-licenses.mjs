import { catalog } from '../catalog/catalog.mjs';
export const ARTWORK_LICENSE_URLS = Object.freeze({
    'OGA-BY 3.0': 'https://static.opengameart.org/OGA-BY-3.0.txt',
    'GPL 3.0': 'https://www.gnu.org/licenses/gpl-3.0.html',
    CC0: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt'
});
export function selectedArtworkLicenses(ids) {
    return Object.fromEntries([...ids].map(id => {
        const item = catalog.items[id], license = item?.selectedLicense;
        if (!Object.hasOwn(ARTWORK_LICENSE_URLS, license) || !item.layers.every(layer => Object.values(layer.paths).every(path => item.credits.some(credit => path.startsWith('spritesheets/' +credit.file +'/')
            && credit.licenses.includes(license))))) throw Error('Unsupported artwork license selection.');
        return [id, license];
    }));
}
