import { validateDefinition } from '../state/validate.mjs';
import { selectionsFor } from '../catalog/catalog.mjs';
import { drawFrame } from './player.mjs';

/** Static 64px tiles, sequential composition, at most one canvas per current outfit. */
export function createOutfitGallery({ document, compose, onSelect, label }) {
    const element = document.createElement('div'); element.className = 'lpc-outfit-gallery';
    element.setAttribute('role', 'group'); element.setAttribute('aria-label', label);
    const cached = new Map(); let generation = 0, disposed = false, focusRequest = null;
    function clear() { focusRequest = null; generation++; cached.clear(); element.replaceChildren(); element.dataset.ready = 'false'; }
    return {
        element, clear,
        async render(value, selectedId) {
            const token = ++generation;
            if (disposed) return;
            let definition;
            try { definition = validateDefinition(value); }
            catch { clear(); element.textContent = 'Outfit previews unavailable. Check the setup.'; return; }
            const outfits = [...definition.outfits].sort((a, b) => Number(b.favorite === true) - Number(a.favorite === true));
            for (const id of cached.keys()) if (!outfits.some(outfit => outfit.id === id)) cached.delete(id);
            const focused = focusRequest ?? (element.contains(document.activeElement) ? document.activeElement.dataset.outfitId : null); focusRequest = null;
            element.dataset.ready = 'false'; element.replaceChildren();
            const tiles = outfits.map(outfit => {
                const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'lpc-outfit-tile'; tile.dataset.outfitId = outfit.id;
                tile.setAttribute('aria-label', `${outfit.name}${outfit.favorite ? ', favorite' : ''}`);
                tile.setAttribute('aria-pressed', String(outfit.id === selectedId));
                const text = document.createElement('span'); text.textContent = `${outfit.favorite ? '★ ' : ''}${outfit.name}`;
                tile.append(text); tile.onclick = () => { if (document.activeElement === tile) focusRequest = outfit.id; onSelect(outfit.id); }; element.append(tile);
                return { tile, outfit };
            });
            if (focused) tiles.find(({ outfit }) => outfit.id === focused)?.tile.focus({ preventScroll: true });
            for (const { tile, outfit } of tiles) {
                if (disposed || token !== generation) return;
                const signature = JSON.stringify([definition.identity, outfit.selections]);
                try {
                    let canvas = cached.get(outfit.id)?.signature === signature ? cached.get(outfit.id).canvas : null;
                    if (!canvas) {
                        const sheet = await compose(selectionsFor(definition, outfit.id), 'idle');
                        if (disposed || token !== generation) return;
                        canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
                        canvas.setAttribute('aria-hidden', 'true'); drawFrame(canvas, sheet, 'south');
                        cached.set(outfit.id, { signature, canvas });
                    }
                    tile.prepend(canvas); tile.dataset.preview = 'ready';
                } catch {
                    if (disposed || token !== generation) return;
                    cached.delete(outfit.id); tile.dataset.preview = 'unavailable';
                    const note = document.createElement('small'); note.textContent = 'Preview unavailable'; tile.append(note);
                }
            }
            if (!disposed && token === generation) element.dataset.ready = 'true';
        },
        dispose() { disposed = true; clear(); },
    };
}
