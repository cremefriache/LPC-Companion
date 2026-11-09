import { slotShortName, formatSourceColorLabel, formatShortColorName } from './source-ui.mjs';
import { createLuciteIcon } from './molecules.mjs';
import {
    readCloset,
    isEntryWorn,
    removeClosetEntry,
} from '../state/closet.mjs';

export function swatchChannelsForItem(catalog, item) {
    const recolorChannels = catalog.colorOptions(item.id);
    if (recolorChannels.length) return recolorChannels;
    if (item.variants?.length) {
        return [{
            channel: '__variant__',
            label: 'Color / variant',
            choices: [...item.variants],
            isVariant: true,
        }];
    }
    return [];
}

export function describeSelectionColor(catalog, item, selection) {
    const channels = swatchChannelsForItem(catalog, item);
    if (!channels.length) return { channel: null, value: '', ramp: [], label: '' };
    const primary = channels[0];
    if (primary.isVariant) {
        const value = selection?.variant || item.variants?.[0] || '';
        const ramp = catalog.colorRamp(item.id, '__variant__', value);
        return { channel: primary, value, ramp, label: formatShortColorName(value) };
    }
    const value = selection?.colors?.[primary.channel] ?? '';
    const ramp = catalog.colorRamp(item.id, primary.channel, value);
    const baseColor = item.recolors?.[0]?.base ?? '';
    const label = value
        ? formatShortColorName(value)
        : (baseColor ? formatShortColorName(baseColor) : 'Authored');
    return { channel: primary, value, ramp, label };
}

export function swatchGradientForRamp(ramp) {
    if (!Array.isArray(ramp) || !ramp.length) {
        return 'linear-gradient(90deg, #475569 0% 33.33%, #94a3b8 33.33% 66.66%, #e2e8f0 66.66% 100%)';
    }
    const c1 = ramp[Math.min(1, ramp.length - 1)] ?? ramp[0];
    const c2 = ramp[Math.floor(ramp.length / 2)] ?? c1;
    const c3 = ramp[Math.max(0, ramp.length - 2)] ?? ramp.at(-1) ?? c2;
    return `linear-gradient(90deg, ${c1} 0% 33.33%, ${c2} 33.33% 66.66%, ${c3} 66.66% 100%)`;
}

export function createSwatchRect(document, ramp, className = 'lpc-swatch-rect') {
    const span = document.createElement('span');
    span.className = className;
    span.setAttribute('aria-hidden', 'true');
    span.style.background = swatchGradientForRamp(ramp);
    return span;
}

const activePopoverClosers = new WeakMap();

export function closeOpenSwatchPopovers(container) {
    if (!container) return;
    for (const pop of container.querySelectorAll('.lpc-swatch-popover:not([hidden])')) {
        const close = activePopoverClosers.get(pop);
        if (close) close();
        else {
            pop.hidden = true;
            const btn = pop.parentElement?.querySelector('.lpc-swatch-trigger');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        }
    }
}

export function createInlineSwatchDropdown({
    document,
    catalog,
    itemId,
    channel,
    currentColor = '',
    onPickColor,
    rootContainer,
}) {
    const wrap = document.createElement('div');
    wrap.className = 'lpc-swatch-dropdown';
    wrap.onclick = e => e.stopPropagation();

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lpc-swatch-trigger';
    trigger.dataset.control = `swatch-trigger-${itemId}-${channel.channel}`;
    trigger.setAttribute('aria-expanded', 'false');
    const prettyCurrent = formatSourceColorLabel(currentColor);
    trigger.setAttribute('aria-label', `${channel.label} swatch (${prettyCurrent})`);
    trigger.title = `${channel.label} (${prettyCurrent}) — click to pick color`;

    const rect = createSwatchRect(document, catalog.colorRamp(itemId, channel.channel, currentColor));
    const caret = document.createElement('span');
    caret.className = 'lpc-swatch-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    trigger.append(rect, caret);

    const popover = document.createElement('div');
    popover.className = 'lpc-swatch-popover';
    popover.setAttribute('role', 'listbox');
    popover.setAttribute('aria-label', `${channel.label} color swatches`);
    popover.hidden = true;

    function placePopover() {
        const trig = trigger.getBoundingClientRect?.();
        if (!trig || (!trig.width && !trig.height)) return;
        popover.style.left = '0px';
        popover.style.top = '0px';
        const origin = popover.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 206, height: 196 };
        const popW = origin.width || 206;
        const popH = origin.height || 196;
        const win = document.defaultView;
        const vw = win?.innerWidth || 1024;
        const vh = win?.innerHeight || 768;
        const rootRect = rootContainer?.getBoundingClientRect?.();
        const minX = Math.max(8, (rootRect?.left ?? 0) + 8);
        const maxX = Math.max(minX, Math.min(vw - popW - 8, (rootRect?.right ?? vw) - popW - 8));
        const minY = Math.max(8, (rootRect?.top ?? 0) + 8);
        const maxY = Math.max(minY, Math.min(vh - 8, (rootRect?.bottom ?? vh) - 8));

        let vx = trig.right - popW;
        if (vx < minX) vx = trig.left;
        vx = Math.max(minX, Math.min(maxX, vx));

        let vy = trig.bottom + 6;
        if (vy + popH > maxY && trig.top - popH - 6 >= minY) {
            vy = trig.top - popH - 6;
        } else {
            vy = Math.max(minY, Math.min( Math.max(minY, maxY - popH), vy));
        }

        popover.style.left = `${Math.round(vx - origin.left)}px`;
        popover.style.top = `${Math.round(vy - origin.top)}px`;
    }

    const onContainerScroll = event => {
        if (popover.hidden || event?.target === popover) return;
        placePopover();
    };

    function closePopover() {
        popover.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        rootContainer?.removeEventListener?.('scroll', onContainerScroll, true);
    }
    activePopoverClosers.set(popover, closePopover);

    let populated = false;
    function populate() {
        if (populated) return;
        populated = true;
        const allChoices = channel.isVariant ? [...channel.choices] : ['', ...channel.choices];
        for (const choice of allChoices) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'lpc-swatch-cell';
            cell.dataset.colorChoice = choice;
            cell.setAttribute('role', 'option');
            cell.setAttribute('aria-selected', String(choice === currentColor));
            const label = formatSourceColorLabel(choice);
            cell.setAttribute('aria-label', label);
            cell.title = label;
            const ramp = catalog.colorRamp(itemId, channel.channel, choice);
            cell.append(createSwatchRect(document, ramp, 'lpc-swatch-cell-bar'));
            cell.onclick = e => {
                e.stopPropagation();
                closePopover();
                onPickColor(choice);
            };
            popover.append(cell);
        }
    }

    trigger.onclick = e => {
        e.stopPropagation();
        const willOpen = popover.hidden;
        if (rootContainer) closeOpenSwatchPopovers(rootContainer);
        if (willOpen) {
            populate();
            for (const cell of popover.querySelectorAll('.lpc-swatch-cell')) {
                cell.setAttribute('aria-selected', String(cell.dataset.colorChoice === currentColor));
            }
            popover.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            placePopover();
            rootContainer?.addEventListener?.('scroll', onContainerScroll, true);
        } else {
            closePopover();
        }
    };

    wrap.append(trigger, popover);
    return wrap;
}

export function createStudioClosetSection({
    document,
    window,
    catalog,
    getDefinition,
    getOutfitId,
    getSelectedSlot,
    onSelectSlot,
    onUnequipSlot,
    onRecolorSlot,
    onToggleEntry,
    onRecolorEntry,
    onRemoveEntry,
    onSaveAsOutfit,
    rootContainer,
}) {
    let activeTab = 'equipped';
    const container = document.createElement('div');
    container.className = 'lpc-closet-section';
    container.dataset.control = 'source-closet';

    const header = document.createElement('div');
    header.className = 'lpc-closet-header';

    const tabsWrap = document.createElement('div');
    tabsWrap.className = 'lpc-wardrobe-tabs';
    tabsWrap.setAttribute('role', 'tablist');

    const equippedTabBtn = document.createElement('button');
    equippedTabBtn.type = 'button';
    equippedTabBtn.className = 'lpc-wardrobe-tab';
    equippedTabBtn.dataset.control = 'wardrobe-tab-equipped';
    equippedTabBtn.setAttribute('role', 'tab');

    const closetTabBtn = document.createElement('button');
    closetTabBtn.type = 'button';
    closetTabBtn.className = 'lpc-wardrobe-tab';
    closetTabBtn.dataset.control = 'wardrobe-tab-closet';
    closetTabBtn.setAttribute('role', 'tab');
    const countBadge = document.createElement('span');
    countBadge.dataset.control = 'closet-count';
    closetTabBtn.append(countBadge);

    tabsWrap.append(equippedTabBtn, closetTabBtn);

    const headerActions = document.createElement('div');
    headerActions.className = 'lpc-closet-header-actions';
    const saveOutfitBtn = document.createElement('button');
    saveOutfitBtn.type = 'button';
    saveOutfitBtn.className = 'lpc-closet-save-outfit-btn';
    saveOutfitBtn.dataset.control = 'closet-save-outfit';
    saveOutfitBtn.textContent = '+ Save worn as Outfit';
    saveOutfitBtn.title = 'Save the currently worn layers as a new numbered outfit';
    saveOutfitBtn.onclick = () => onSaveAsOutfit?.();
    headerActions.append(saveOutfitBtn);

    header.append(tabsWrap, headerActions);

    const equippedGrid = document.createElement('div');
    equippedGrid.className = 'lpc-closet-grid';
    equippedGrid.dataset.control = 'equipped-grid';

    const closetGrid = document.createElement('div');
    closetGrid.className = 'lpc-closet-grid';
    closetGrid.dataset.control = 'closet-grid';

    function updateTabVisibility() {
        const isEquipped = activeTab === 'equipped';
        equippedTabBtn.setAttribute('aria-selected', String(isEquipped));
        closetTabBtn.setAttribute('aria-selected', String(!isEquipped));
        equippedGrid.hidden = !isEquipped;
        closetGrid.hidden = isEquipped;
    }

    equippedTabBtn.onclick = () => {
        activeTab = 'equipped';
        updateTabVisibility();
    };
    closetTabBtn.onclick = () => {
        activeTab = 'closet';
        updateTabVisibility();
    };

    container.append(header, equippedGrid, closetGrid);
    updateTabVisibility();

    function sync() {
        const def = getDefinition?.();
        const outfitId = getOutfitId?.();
        if (!def || !catalog) return;
        const outfit = def.outfits.find(o => o.id === outfitId) ?? def.outfits[0];
        const equippedMap = { ...def.identity.selections, ...outfit.selections };
        const equippedEntries = Object.entries(equippedMap);
        const closetEntries = readCloset(def, catalog, window?.localStorage, { includeOutfits: false });
        const wornCount = closetEntries.filter(e => isEntryWorn(outfit, e)).length;

        equippedTabBtn.textContent = `Wearing (${equippedEntries.length})`;
        countBadge.textContent = `Closet (${closetEntries.length}${wornCount ? ` · ${wornCount} worn` : ''})`;

        // 1. Populate Equipped (Wearing) rows
        equippedGrid.replaceChildren();
        const activeSlot = getSelectedSlot?.() ?? '';
        for (const [slot, sel] of equippedEntries) {
            const item = catalog.item(sel.itemId);
            const colorInfo = describeSelectionColor(catalog, item, sel);
            const slotAndColor = colorInfo.label ? `${slotShortName(slot)} · ${colorInfo.label}` : slotShortName(slot);

            const row = document.createElement('div');
            row.className = 'lpc-wardrobe-row';
            row.dataset.active = String(activeSlot === slot);

            const mainBtn = document.createElement('button');
            mainBtn.type = 'button';
            mainBtn.className = 'lpc-wardrobe-row-main';
            mainBtn.dataset.control = 'source-selected';
            mainBtn.dataset.slot = slot;
            mainBtn.setAttribute('aria-pressed', String(activeSlot === slot));
            mainBtn.title = `Filter catalog to ${slotShortName(slot)}`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'lpc-wardrobe-row-name';
            nameSpan.textContent = item.name;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'lpc-wardrobe-row-meta';
            metaSpan.textContent = slotAndColor;
            mainBtn.append(nameSpan, ' ', metaSpan);
            mainBtn.onclick = () => onSelectSlot?.(slot);
            row.append(mainBtn);

            const actions = document.createElement('div');
            actions.className = 'lpc-wardrobe-row-actions';
            for (const ch of swatchChannelsForItem(catalog, item)) {
                const curVal = ch.isVariant
                    ? (sel.variant || item.variants?.[0] || '')
                    : (sel.colors?.[ch.channel] ?? '');
                const swatchPicker = createInlineSwatchDropdown({
                    document,
                    catalog,
                    itemId: item.id,
                    channel: ch,
                    currentColor: curVal,
                    rootContainer,
                    onPickColor: newColor => onRecolorSlot?.(slot, ch, newColor),
                });
                swatchPicker.classList.add('lpc-closet-inline-swatch');
                actions.append(swatchPicker);
            }

            if (slot !== 'body' && slot !== 'head') {
                const unequipBtn = document.createElement('button');
                unequipBtn.type = 'button';
                unequipBtn.className = 'lpc-wardrobe-row-remove';
                unequipBtn.dataset.control = `source-remove-slot-${slot}`;
                unequipBtn.textContent = '×';
                unequipBtn.setAttribute('aria-label', `Take off ${item.name}`);
                unequipBtn.title = `Take off ${item.name}`;
                unequipBtn.onclick = e => {
                    e.stopPropagation();
                    onUnequipSlot?.(slot);
                };
                actions.append(unequipBtn);
            }
            row.append(actions);
            equippedGrid.append(row);
        }

        // 2. Populate Saved Closet rows (no duplicate swatches, no nested ovals)
        closetGrid.replaceChildren();
        if (!closetEntries.length) {
            const empty = document.createElement('p');
            empty.className = 'lpc-note lpc-wardrobe-empty';
            empty.textContent = 'No pieces saved in your closet yet. Click + Closet on any catalog item below to save it here.';
            closetGrid.append(empty);
            return;
        }

        for (const entry of closetEntries) {
            const item = catalog.item(entry.itemId);
            const worn = isEntryWorn(outfit, entry);
            const colorInfo = describeSelectionColor(catalog, item, entry);
            const slotAndColor = colorInfo.label ? `${slotShortName(entry.slot)} · ${colorInfo.label}` : slotShortName(entry.slot);

            const row = document.createElement('div');
            row.className = 'lpc-wardrobe-row';
            row.dataset.worn = String(worn);
            row.dataset.closetKey = entry.key;

            const mainBtn = document.createElement('button');
            mainBtn.type = 'button';
            mainBtn.className = 'lpc-wardrobe-row-main';
            mainBtn.dataset.control = 'closet-toggle';
            mainBtn.dataset.closetSlot = entry.slot;
            mainBtn.dataset.closetItem = entry.itemId;
            mainBtn.setAttribute('aria-pressed', String(worn));
            mainBtn.title = worn
                ? `Wearing ${item.name} (${slotAndColor}) — click to take off`
                : `Click to equip ${item.name} (${slotAndColor})`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'lpc-wardrobe-row-name';
            nameSpan.textContent = (worn ? '✓ ' : '') + item.name;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'lpc-wardrobe-row-meta';
            metaSpan.textContent = slotAndColor;
            mainBtn.append(nameSpan, ' ', metaSpan);
            mainBtn.onclick = () => onToggleEntry?.(entry);
            row.append(mainBtn);

            const actions = document.createElement('div');
            actions.className = 'lpc-wardrobe-row-actions';
            for (const ch of swatchChannelsForItem(catalog, item)) {
                const curVal = ch.isVariant
                    ? (entry.variant || item.variants?.[0] || '')
                    : (entry.colors?.[ch.channel] ?? '');
                if (onRecolorEntry) {
                    const swatchPicker = createInlineSwatchDropdown({
                        document,
                        catalog,
                        itemId: item.id,
                        channel: ch,
                        currentColor: curVal,
                        rootContainer,
                        onPickColor: newColor => onRecolorEntry(entry, ch.channel, newColor),
                    });
                    swatchPicker.classList.add('lpc-closet-inline-swatch');
                    actions.append(swatchPicker);
                }
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'lpc-wardrobe-row-remove';
            removeBtn.textContent = '×';
            removeBtn.setAttribute('aria-label', `Remove ${item.name} from closet`);
            removeBtn.title = 'Remove from closet';
            removeBtn.onclick = e => {
                e.stopPropagation();
                removeClosetEntry(def, entry.key, catalog, window?.localStorage);
                onRemoveEntry?.(entry);
                sync();
            };
            actions.append(removeBtn);

            row.append(actions);
            closetGrid.append(row);
        }
    }

    return { element: container, sync };
}

export function createLiveClosetBar({
    document,
    window,
    catalog,
    getDefinition,
    getOutfitId,
    onToggleEntry,
    onUnequipSlot,
    onSaveAsOutfit,
}) {
    const wrap = document.createElement('div');
    wrap.className = 'lpc-live-closet';
    wrap.dataset.control = 'live-closet';

    const wornHeader = document.createElement('div');
    wornHeader.className = 'lpc-live-worn-header';
    const wornLabel = document.createElement('span');
    wornLabel.className = 'lpc-live-worn-title';
    wornLabel.textContent = 'Worn layers (click to take off)';
    wornHeader.append(wornLabel);

    const wornRow = document.createElement('div');
    wornRow.className = 'lpc-live-worn-row';
    wornRow.dataset.control = 'live-worn-layers';

    const closetDrawer = document.createElement('details');
    closetDrawer.className = 'lpc-live-closet-drawer';
    closetDrawer.dataset.control = 'live-closet-drawer';
    const summary = document.createElement('summary');
    summary.className = 'lpc-live-closet-summary';
    const summaryText = document.createElement('span');
    summaryText.textContent = 'Character closet';
    const summaryCount = document.createElement('span');
    summaryCount.className = 'lpc-badge';
    summary.append(summaryText, summaryCount);

    const drawerBody = document.createElement('div');
    drawerBody.className = 'lpc-live-closet-body';
    const drawerGrid = document.createElement('div');
    drawerGrid.className = 'lpc-closet-grid';
    const drawerFooter = document.createElement('div');
    drawerFooter.className = 'lpc-live-closet-footer';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'lpc-closet-save-outfit-btn';
    saveBtn.dataset.control = 'live-save-outfit';
    saveBtn.textContent = '+ Save current layers as new Outfit';
    saveBtn.onclick = () => onSaveAsOutfit?.();
    drawerFooter.append(saveBtn);
    drawerBody.append(drawerGrid, drawerFooter);
    closetDrawer.append(summary, drawerBody);

    wrap.append(wornHeader, wornRow, closetDrawer);

    function sync() {
        const def = getDefinition?.();
        const outfitId = getOutfitId?.();
        if (!def || def.schemaVersion !== 2 || !catalog) return;
        const outfit = def.outfits.find(o => o.id === outfitId) ?? def.outfits[0];
        if (!outfit) return;

        wornRow.replaceChildren();
        const wornEntries = Object.entries(outfit.selections ?? {});
        if (!wornEntries.length) {
            const none = document.createElement('span');
            none.className = 'lpc-note';
            none.textContent = 'No extra garment layers worn.';
            wornRow.append(none);
        } else {
            for (const [slot, sel] of wornEntries) {
                const item = catalog.item(sel.itemId);
                const colorInfo = describeSelectionColor(catalog, item, sel);
                const slotAndColor = colorInfo.label ? `${slotShortName(slot)} · ${colorInfo.label}` : slotShortName(slot);

                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'lpc-worn-layer-chip';
                chip.dataset.control = `worn-layer-${slot}`;
                chip.title = `Take off ${item.name} (${slotAndColor})`;
                if (colorInfo.channel) {
                    chip.append(createSwatchRect(document, colorInfo.ramp, 'lpc-swatch-rect lpc-closet-swatch'));
                }
                const label = document.createElement('span');
                label.textContent = colorInfo.label ? `${item.name} (${colorInfo.label})` : item.name;
                const x = document.createElement('span');
                x.className = 'lpc-worn-layer-x';
                x.setAttribute('aria-hidden', 'true');
                x.textContent = '×';
                chip.append(label, x);
                chip.onclick = () => onUnequipSlot?.(slot);
                wornRow.append(chip);
            }
        }

        const closetEntries = readCloset(def, catalog, window?.localStorage);
        summaryCount.textContent = `${closetEntries.length} pieces`;
        drawerGrid.replaceChildren();
        for (const entry of closetEntries) {
            const item = catalog.item(entry.itemId);
            const worn = isEntryWorn(outfit, entry);
            const colorInfo = describeSelectionColor(catalog, item, entry);
            const slotAndColor = colorInfo.label ? `${slotShortName(entry.slot)} · ${colorInfo.label}` : slotShortName(entry.slot);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lpc-closet-pill-main lpc-live-closet-item';
            btn.dataset.control = 'live-closet-toggle';
            btn.setAttribute('aria-pressed', String(worn));
            btn.title = worn ? `Take off ${item.name} (${slotAndColor})` : `Put on ${item.name} (${slotAndColor})`;
            if (colorInfo.channel) {
                btn.append(createSwatchRect(document, colorInfo.ramp, 'lpc-swatch-rect lpc-closet-swatch'));
            }
            const textWrap = document.createElement('span');
            textWrap.className = 'lpc-closet-pill-text';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'lpc-closet-pill-name';
            nameSpan.textContent = item.name;
            const slotSpan = document.createElement('span');
            slotSpan.className = 'lpc-closet-pill-slot';
            slotSpan.textContent = slotAndColor + (worn ? ' · worn' : '');
            textWrap.append(nameSpan, ' ', slotSpan);
            btn.append(textWrap);
            btn.onclick = () => onToggleEntry?.(entry);
            drawerGrid.append(btn);
        }
    }

    return { element: wrap, sync };
}
