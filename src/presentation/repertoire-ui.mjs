import {
    REPERTOIRE_POSES,
    REPERTOIRE_EXPRESSIONS,
    REPERTOIRE_ACTIONS,
    readRepertoire,
    writeRepertoire,
    presetRepertoire,
} from '../state/repertoire.mjs';
import { createIcon } from './molecules.mjs';

export function createRepertoireCustomizer({
    document,
    window,
    getDefinition,
    getOutfitId,
    onWrite,
    onChange = () => {},
}) {
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };

    let activeTab = 'actions';
    const details = el('details', undefined, 'lpc-repertoire-drawer');
    details.dataset.control = 'repertoire-drawer';
    const summary = el('summary', undefined, 'lpc-repertoire-summary');
    const summaryTitle = el('span', 'Customize main panel', 'lpc-repertoire-title');
    summaryTitle.title = 'Customize main panel';
    const summaryBadge = el('span', '', 'lpc-repertoire-badge');
    summary.prepend(createIcon(document, 'sliders'));
    summary.append(summaryTitle, summaryBadge);

    const body = el('div', undefined, 'lpc-repertoire-body');
    const note = el(
        'p',
        'Choose which Actions, Poses, and Expressions appear on the main companion panel and in AI tools.',
        'lpc-note',
    );

    const presetRow = el('div', undefined, 'lpc-repertoire-presets');
    const presetButtons = new Map();
    const makePresetBtn = (label, titleText, presetId, controlId) => {
        const btn = el('button', label, 'lpc-repertoire-preset-btn');
        btn.type = 'button';
        btn.title = titleText;
        btn.dataset.control = controlId;
        btn.onclick = () => {
            const def = getDefinition();
            const outfitId = getOutfitId?.() ?? def?.startingPresentation?.outfitId;
            const next = presetId === 'auto'
                ? { mode: 'auto' }
                : presetRepertoire(presetId, def, outfitId);
            if (onWrite) onWrite(next);
            else writeRepertoire(def?.characterId, next, window?.localStorage);
            sync();
            onChange();
        };
        presetButtons.set(presetId, btn);
        return btn;
    };
    presetRow.append(
        makePresetBtn('Roleplay', 'Everyday roleplay (hides combat weapon moves)', 'roleplay', 'repertoire-preset-roleplay'),
        makePresetBtn('Combat & tools', 'Include all combat weapons and tool actions', 'all', 'repertoire-preset-all'),
        makePresetBtn('Minimal', 'Keep only core poses, moods, and gestures', 'minimal', 'repertoire-preset-minimal'),
        makePresetBtn('Auto (outfit)', 'Automatically match repertoire to equipped items', 'auto', 'repertoire-preset-auto'),
    );

    const tabsHeader = el('div', undefined, 'lpc-repertoire-tabs-header');
    const tabsBar = el('div', undefined, 'lpc-wardrobe-tabs lpc-repertoire-tabs');
    tabsBar.setAttribute('role', 'tablist');

    const tabDefs = [
        ['actions', 'Actions', REPERTOIRE_ACTIONS],
        ['poses', 'Poses', REPERTOIRE_POSES],
        ['expressions', 'Moods', REPERTOIRE_EXPRESSIONS],
    ];
    const tabButtons = new Map();
    const categoryGrids = new Map();
    const checkboxes = { poses: new Map(), expressions: new Map(), actions: new Map() };

    function updateTabVisibility() {
        for (const [key] of tabDefs) {
            const isSelected = key === activeTab;
            tabButtons.get(key)?.setAttribute('aria-selected', String(isSelected));
            const grid = categoryGrids.get(key);
            if (grid) grid.hidden = !isSelected;
        }
    }

    for (const [key, shortLabel, entries] of tabDefs) {
        const tabBtn = el('button', shortLabel, 'lpc-wardrobe-tab');
        tabBtn.type = 'button';
        tabBtn.dataset.control = `repertoire-tab-${key}`;
        tabBtn.setAttribute('role', 'tab');
        tabBtn.onclick = () => {
            activeTab = key;
            updateTabVisibility();
        };
        tabButtons.set(key, tabBtn);
        tabsBar.append(tabBtn);

        const grid = el('div', undefined, 'lpc-repertoire-grid');
        grid.dataset.control = `repertoire-grid-${key}`;
        for (const [id, label, subcat] of entries) {
            const chip = el('label', undefined, 'lpc-repertoire-chip');
            chip.title = label;
            if (subcat === 'combat') chip.dataset.category = 'combat';
            const input = el('input');
            input.type = 'checkbox';
            input.dataset.control = `repertoire-${key}-${id}`;
            input.onchange = () => {
                const def = getDefinition();
                const outfitId = getOutfitId?.() ?? def?.startingPresentation?.outfitId;
                const current = readRepertoire(def, outfitId, window?.localStorage);
                const set = new Set(current[key]);
                if (input.checked) set.add(id);
                else set.delete(id);
                chip.dataset.checked = String(input.checked);
                const nextValue = {
                    mode: 'custom',
                    poses: key === 'poses' ? [...set] : current.poses,
                    expressions: key === 'expressions' ? [...set] : current.expressions,
                    actions: key === 'actions' ? [...set] : current.actions,
                };
                if (onWrite) {
                    onWrite(nextValue);
                } else {
                    writeRepertoire(def?.characterId, nextValue, window?.localStorage);
                }
                syncBadge();
                onChange();
            };
            const text = el('span', label, 'lpc-repertoire-chip-label');
            chip.append(input, text);
            checkboxes[key].set(id, { input, chip });
            grid.append(chip);
        }
        categoryGrids.set(key, grid);
    }

    tabsHeader.append(tabsBar);
    body.append(note, presetRow, tabsHeader, ...categoryGrids.values());
    details.append(summary, body);
    updateTabVisibility();

    function syncBadge() {
        const def = getDefinition();
        const outfitId = getOutfitId?.() ?? def?.startingPresentation?.outfitId;
        const current = readRepertoire(def, outfitId, window?.localStorage);
        const total = current.actions.length + current.poses.length + current.expressions.length;
        summaryBadge.textContent = `${total} active`;
        summaryBadge.title = `${current.actions.length} actions · ${current.poses.length} poses · ${current.expressions.length} moods`;
        const actBtn = tabButtons.get('actions');
        if (actBtn) actBtn.textContent = `Actions (${current.actions.length}/${REPERTOIRE_ACTIONS.length})`;
        const poseBtn = tabButtons.get('poses');
        if (poseBtn) poseBtn.textContent = `Poses (${current.poses.length}/${REPERTOIRE_POSES.length})`;
        const expBtn = tabButtons.get('expressions');
        if (expBtn) expBtn.textContent = `Moods (${current.expressions.length}/${REPERTOIRE_EXPRESSIONS.length})`;
    }

    function sync() {
        const def = getDefinition();
        const outfitId = getOutfitId?.() ?? def?.startingPresentation?.outfitId;
        const current = readRepertoire(def, outfitId, window?.localStorage);
        for (const [id, { input, chip }] of checkboxes.poses) {
            input.checked = current.poses.includes(id);
            chip.dataset.checked = String(input.checked);
        }
        for (const [id, { input, chip }] of checkboxes.expressions) {
            input.checked = current.expressions.includes(id);
            chip.dataset.checked = String(input.checked);
        }
        for (const [id, { input, chip }] of checkboxes.actions) {
            input.checked = current.actions.includes(id);
            chip.dataset.checked = String(input.checked);
        }
        syncBadge();
    }

    sync();
    return { element: details, sync };
}
