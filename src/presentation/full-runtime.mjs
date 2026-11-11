import { createSourceArtwork } from '../state/source-artwork.mjs';
import { createSourcePackages } from '../state/source-packages.mjs';
import { hasSourceData } from '../state/source-contracts.mjs';
import { openFullArtBank, openFullLibrary } from './full-library.mjs';

/** One immutable catalog and bounded bank cache per page; no card/chat data or global singletons mutated. */
export function createFullRuntime({ baseUrl, document, openLibrary = openFullLibrary, openBank = openFullArtBank, onReady }) {
    let ready = null;
    let pending = null;
    let bankReady = null;
    let bankPending = null;

    async function getBank() {
        if (ready?.library) return ready.library;
        if (bankReady) return bankReady;
        if (bankPending) return bankPending;
        const work = openBank({ baseUrl, document }).then(bank => {
            bankReady = bank;
            return bank;
        });
        bankPending = work;
        try {
            return await work;
        } finally {
            if (bankPending === work) bankPending = null;
        }
    }

    async function get() {
        if (ready) return ready;
        if (pending) return pending;
        const work = (async () => {
            const [{ createFullCatalog }, { createFullState }, { createSourceAvailability }] = await Promise.all([
                import('../catalog/full-catalog.mjs'),
                import('../state/full-state.mjs'),
                import('../catalog/source-availability.mjs'),
            ]);
            const useSharedBank = openLibrary === openFullLibrary || openBank !== openFullArtBank;
            const sharedBank = useSharedBank ? await getBank() : null;
            const library = await openLibrary({ baseUrl, document, ...(sharedBank ? { bank: sharedBank } : {}) });
            try {
                const catalog = createFullCatalog({ metadata: library.metadata, assets: library.assets, repairs: library.repairs });
                const availability = createSourceAvailability({ catalog, evidenceFor: library.evidenceFor });
                const state = createFullState(catalog, { validatePlan: availability.validate });
                const artwork = createSourceArtwork({ assets: library.assets, library, document });
                const packages = createSourcePackages({ catalog, state, metadata: library.metadata, assets: library.assets, artwork });
                ready = { library, catalog, state, availability, artwork, packages };
                onReady?.(ready);
                return ready;
            } catch (error) {
                if (sharedBank) bankReady = null;
                library.dispose();
                throw error;
            }
        })();
        pending = work;
        try {
            return await work;
        } finally {
            if (pending === work) pending = null;
        }
    }

    return Object.freeze({
        get,
        getBank,
        async prepareData(value) {
            if (hasSourceData(value)) await get();
        },
        isReady: () => Boolean(ready),
    });
}
