import { SOURCE_PACKAGE_KIND } from '../state/source-packages.mjs';
import { PARTY_SCENES, partyScene } from '../state/party.mjs';
import { BACKGROUNDS, LIGHTS } from '../catalog/scenes.mjs';
import { MOODS, moodLabel } from './presence.mjs';
import { sourceDraft, upgradeCuratedDefinitionToSource } from '../state/source-draft.mjs';
import { makeUuid } from '../state/uuid.mjs';
import { FULL_SOURCE_COMMIT } from '../catalog/full-catalog.mjs';
import { SOURCE_IDENTITY_SLOTS, SOURCE_LOOP_ACTIONS } from '../state/full-state.mjs';
import { createSourceRenderer } from './source-renderer.mjs';
import { createPlayer } from './player.mjs';
import { createStage } from './stage.mjs';
import {
    sourceUI,
    sourceProblem,
    sourcePlacementControls,
    observeSourceCanvas,
    sourcePresentationNotice,
    populateSlotSelect,
    updateSlotSelectEquipped,
    slotShortName,
    formatSourceActionLabel,
    SOURCE_POSE_PRESETS
} from './source-ui.mjs';
import { createLuciteIcon, decorateButton } from './molecules.mjs';
import { createRepertoireCustomizer } from './repertoire-ui.mjs';
import {
    createInlineSwatchDropdown,
    createStudioClosetSection,
    closeOpenSwatchPopovers,
    swatchChannelsForItem
} from './closet-ui.mjs';
import {
    addClosetEntry,
    removeClosetEntry,
    readCloset,
    seedClosetFromDefinition,
    isEntryWorn,
    toggleClosetLayer,
    saveWornAsOutfit,
    closetKeyForSelection
} from '../state/closet.mjs';

/** A local draft. Only an explicit, fully prepared Apply reaches the acknowledged writer. */
export async function createSourceStudio({
    document,
    window,
    baseUrl,
    fullRuntime,
    initialDefinition,
    characterId,
    hasDefaults,
    chatOnly = false,
    initialScope,
    openImport = false,
    getEmbeddedAssets = () => ({}),
    onApply,
    onCancel = () => {}
}) {
    const runtime = await fullRuntime.get(),
        { catalog, state } = runtime,
        { el, button, select } = sourceUI(document),
        focus = document.activeElement;
    const resolvedInitial = initialDefinition?.schemaVersion === 2 ? initialDefinition : initialDefinition?.schemaVersion === 1
        ? upgradeCuratedDefinitionToSource(initialDefinition, catalog, state) : null;
    const uuid = () => makeUuid(window.crypto),
        baseSeed = resolvedInitial ?? state.createDefinition(
            {
                schemaVersion: 2,
                sourceCommit: FULL_SOURCE_COMMIT,
                bodyType: 'male',
                selections: {
                    body: { itemId: 'body', variant: null, colors: {} },
                    head: { itemId: 'heads_human_male', variant: null, colors: {} },
                    hair: { itemId: 'hair_plain', variant: null, colors: {} },
                    clothes: {
                        itemId: 'torso_clothes_tshirt',
                        variant: null,
                        colors: { clothes: 'cloth.ulpc.teal' }
                    },
                    legs: { itemId: 'legs_pants', variant: null, colors: { legs: 'cloth.ulpc.navy' } }
                },
                matchBodyColor: true,
                applyMask: true
            },
            characterId ?? uuid(),
            { restActionId: 'idle' }
        );
    const seed = structuredClone(baseSeed);
    if (!resolvedInitial) seed.outfits[0].name = 'Starting outfit';
    seedClosetFromDefinition(seed, catalog, window?.localStorage);
    const draft = sourceDraft(seed, catalog),
        root = el('section', undefined, 'lpc-companion lpc-panel lpc-source-studio');
    root.dataset.control = 'source-studio';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Full catalog studio');
    root.onclick = event => {
        event.stopPropagation();
        closeOpenSwatchPopovers(root);
    };
    let disposed = false,
        busy = false,
        epoch = 0,
        valid = false,
        selectedSlot = 'body',
        showAllItems = false,
        importedAssets = {},
        importRead = 0,
        importNotices = [],
        draftNotices = [];
    const effectiveAssets = () => ({ ...getEmbeddedAssets(), ...importedAssets });
    const status = el('p', 'Loading preview…', 'lpc-note lpc-status-banner');
    status.setAttribute('role', 'status');
    status.dataset.control = 'source-status';
    const header = el('header'), headerLead = el('div', undefined, 'lpc-panel-title-wrap');
    headerLead.append(createLuciteIcon(document, 'wand', 'lpc-lucite-icon-sm'), el('h3', 'Full catalog studio'));
    header.append(headerLead, button('Cancel', cancel, 'source-cancel'));
    root.append(header, el(
        'p',
        (resolvedInitial ? 'Manage currently worn layers and your saved Closet at the top, or browse the 657-item catalog below.'
            : 'Set up your character: manage worn layers and your Closet at the top, and browse the 657-item catalog below. Preview locally, then click Apply.'),
        'lpc-note'
    ));
    const stageEl = el('div', undefined, 'lpc-stage lpc-source-stage'),
        canvas = el('canvas');
    canvas.dataset.control = 'character';
    canvas.setAttribute('aria-label', 'Draft character preview');
    canvas.setAttribute('role', 'img');
    stageEl.append(canvas);
    const previewDirections = el('div', undefined, 'lpc-studio-facing-bar');
    const directionBtns = [['south', 'Front'], ['west', 'Left'], ['north', 'Back'], ['east', 'Right']].map(([dir,
        label]) => {
        const b = button(
            label,
            () => {
                facing.input.value = dir;
                change(() => draft.facing(dir));
            },
            `source-facing-${dir}`
        );
        b.className = 'lpc-studio-facing-btn';
        return [dir, b];
    });
    previewDirections.append(...directionBtns.map(([, b]) => b));
    const previewArea = el('aside', undefined, 'lpc-studio-preview');
    previewArea.setAttribute('aria-label', 'Character preview');
    previewArea.append(el('h4', 'Preview'), stageEl, previewDirections, status);
    const renderer = createSourceRenderer({ runtime, document, getEmbeddedAssets: effectiveAssets }),
        player = createPlayer(canvas, stageEl, window, { placement: () => draft.presentation().scene }),
        stage = createStage({
            document,
            window,
            baseUrl,
            element: stageEl,
            getEmbeddedAssets: effectiveAssets
        });
    const body = select(
            'Body profile',
            catalog.bodies().map(id => [id, id.charAt(0).toUpperCase() +id.slice(1)]),
            'source-body'
        ),
        outfits = select('Outfit', [], 'source-outfit'),
        name = el('input');
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Outfit name');
    name.dataset.control = 'source-outfit-name';
    const field = (label, input) => {
            const wrap = el('label', undefined, 'lpc-field');
            wrap.append(el('span', label), input);
            return wrap;
        },
        section = (title, icon = 'layers') => {
            const node = el('section', undefined, 'lpc-studio-card'),
                head = el('div', undefined, 'lpc-panel-title-wrap');
            head.append(createLuciteIcon(document, icon, 'lpc-lucite-icon-sm'), el('h4', title));
            node.append(head);
            return node;
        };
    const names = section('Outfits', 'shirt'),
        nameFields = el('div', undefined, 'lpc-studio-fields'),
        nameActions = el('div', undefined, 'lpc-studio-outfit-actions'),
        markStart = button('Use as start', () => change(() => draft.starting(draft.selected())), 'source-starting');
    nameFields.append(outfits.wrap, field('Outfit name', name));
    const removeOutfit = button('Remove outfit', () => change(() => draft.remove()), 'source-remove');
    removeOutfit.title = 'Keep at least one outfit';
    nameActions.append(
        button('Duplicate', () => change(() => draft.duplicate()), 'source-duplicate'),
        removeOutfit,
        markStart
    );
    names.append(nameFields, nameActions);
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Search 657 items (e.g. blouse, jacket, glasses, bicorne)…';
    search.setAttribute('aria-label', 'Search source items');
    search.dataset.control = 'source-search';
    const slots = select('Physical slot', [], 'source-slot'),
        results = el('div', undefined, 'lpc-source-results'),
        countRow = el('div', undefined, 'lpc-studio-count-row'),
        count = el('p', undefined, 'lpc-note'),
        showMoreBtn = button(
            'Show all matching items',
            () => {
                showAllItems = true;
                renderSelection(false);
            },
            'source-show-all'
        );
    showMoreBtn.hidden = true;
    countRow.append(count, showMoreBtn);
    populateSlotSelect(document, slots.input, catalog.slots(), SOURCE_IDENTITY_SLOTS);
    results.setAttribute('aria-label', 'Catalog items');
    results.setAttribute('role', 'group');

    const action = select(
            'Saved resting pose',
            catalog.actionIds().map(id => [id, formatSourceActionLabel(id)]),
            'source-action'
        ),
        frame = el('input');
    frame.type = 'number';
    frame.min = 0;
    frame.max = 63;
    frame.setAttribute('aria-label', 'Held frame');
    frame.dataset.control = 'source-frame';
    const frameField = el('label', undefined, 'lpc-field');
    frameField.append(el('span', 'Pose frame (from 0)'), frame);
    const startingActivity = select(
        'Starting activity',
        [
            ['none', 'Saved held pose'],
            ...SOURCE_LOOP_ACTIONS.map(id => [id, formatSourceActionLabel(id)])
        ],
        'source-start-activity'
    );
    const facing = select(
            'Facing',
            [
                ['north', 'Back (north)'],
                ['west', 'Left (west)'],
                ['south', 'Front (south)'],
                ['east', 'Right (east)']
            ],
            'source-facing'
        ),
        startingMood = select('Starting mood / expression', MOODS.map(id => [id, moodLabel(id)]), 'source-start-mood'),
        loop = el('input');
    loop.type = 'checkbox';
    loop.className = 'lpc-switch-input';
    loop.dataset.control = 'source-preview-loop';
    const loopLabel = el('label', 'Animate preview only', 'lpc-source-toggle lpc-toggle-card');
    loopLabel.append(loop);
    const match = el('input');
    match.type = 'checkbox';
    match.className = 'lpc-switch-input';
    const matchLabel = el('label', 'Link skin colors', 'lpc-catalog-Check');
    matchLabel.append(match);
    const mask = el('input');
    mask.type = 'checkbox';
    mask.className = 'lpc-switch-input';
    const maskLabel = el('label', 'Apply authored masks', 'lpc-catalog-Check');
    maskLabel.append(mask);
    const studioCloset = createStudioClosetSection({
        document,
        window,
        catalog,
        rootContainer: root,
        getDefinition: () => draft.read(),
        getOutfitId: () => draft.selected(),
        getSelectedSlot: () => selectedSlot,
        onSelectSlot: slot => {
            selectedSlot = slot;
            slots.input.value = slot;
            showAllItems = false;
            studioCloset.sync();
            renderSelection(true);
        },
        onUnequipSlot: slot => change(() => {
            draft.setItem(slot, null);
        }),
        onRecolorSlot: (slot, ch, newColor) => change(() => {
            if (ch.isVariant) draft.setVariant(slot, newColor);
            else draft.setColor(slot, ch.channel, newColor);
        }),
        onToggleEntry: entry => change(() => {
            if (selectedSlot !== '__all__') {
                selectedSlot = entry.slot;
                slots.input.value = entry.slot;
            }
            const selId = draft.selected();
            const previousRest = draft.outfit()?.rest?.actionId;
            const next = toggleClosetLayer(draft.read(), selId, entry, catalog, null);
            draft.replace(next);
            draft.select(selId);
            const nextRest = draft.outfit()?.rest?.actionId;
            if (previousRest && nextRest && previousRest !== nextRest) {
                draftNotices = [`Resting pose adjusted to "${nextRest}" (frame 0) because this outfit has no "${previousRest}" sheet.`];
            }
        }),
        onRecolorEntry: (entry, channelName, newColor) => change(() => {
            const selId = draft.selected(),
                d = draft.read(),
                o = draft.outfit(),
                wasWorn = isEntryWorn(o, entry);
            removeClosetEntry(d, entry.key, catalog, null);
            if (channelName === '__variant__') {
                addClosetEntry(d, { ...entry, variant: newColor }, catalog, null);
                draft.replace(d);
                draft.select(selId);
                if (wasWorn) draft.setVariant(entry.slot, newColor);
                return;
            }
            const nextColors = { ...entry.colors };
            if (newColor) nextColors[channelName] = newColor;
            else delete nextColors[channelName];
            addClosetEntry(d, { ...entry, colors: nextColors }, catalog, null);
            draft.replace(d);
            draft.select(selId);
            if (wasWorn) draft.setColor(entry.slot, channelName, newColor);
        }),
        onRemoveEntry: entry => change(() => {
            const selId = draft.selected(), d = draft.read();
            removeClosetEntry(d, entry.key, catalog, null);
            draft.replace(d);
            draft.select(selId);
        }),
        onSaveAsOutfit: () => change(() => {
            const { definition: nextDef, outfitId: newId } = saveWornAsOutfit(draft.read(), draft.selected(), '',
                catalog);
            draft.replace(nextDef);
            draft.select(newId);
        }),
    });
    const catalogSection = section('Character & catalog', 'layers'),
        catalogToolbar = el('div', undefined, 'lpc-catalog-toolbar'),
        options = el('div', undefined, 'lpc-catalog-footer');
    catalogToolbar.append(body.wrap, slots.wrap, field('Search catalog', search));
    options.append(matchLabel, maskLabel);
    catalogSection.append(studioCloset.element, catalogToolbar, countRow, results, options);

    const posePresetsWrap = el('div', undefined, 'lpc-studio-pose-presets');
    posePresetsWrap.dataset.control = 'source-pose-presets';
    const posePresetBtns = SOURCE_POSE_PRESETS.map(preset => {
        const b = button(
            preset.label,
            () => {
                change(() => {
                    draft.rest(preset.actionId, preset.frame);
                    draft.startingActivity(preset.loop);
                });
            },
            `source-pose-preset-${preset.id}`
        );
        b.className = 'lpc-studio-pose-preset-btn';
        posePresetsWrap.append(b);
        return [preset, b];
    });
    const repertoireCustomizer = createRepertoireCustomizer({
        document,
        window,
        getDefinition: () => draft.read(),
        getOutfitId: () => draft.selected(),
        onWrite: next => change(() => draft.repertoire(next)),
    });
    const choices = section('Pose, playback & main panel', 'play'),
        poseRowPrimary = el('div', undefined, 'lpc-pose-row-primary'),
        poseRowSecondary = el('div', undefined, 'lpc-studio-fields');
    poseRowPrimary.append(action.wrap, frameField, startingActivity.wrap);
    poseRowSecondary.append(facing.wrap, startingMood.wrap);
    choices.append(posePresetsWrap, poseRowPrimary, poseRowSecondary, repertoireCustomizer.element);
    previewArea.append(loopLabel);
    const editor = el('div', undefined, 'lpc-studio-editor');
    editor.append(names, catalogSection, choices);
    const startingBackground = select('Starting backdrop', BACKGROUNDS, 'source-start-background'),
        startingLight = select('Starting background light', LIGHTS, 'source-start-light'),
        startingParty = select(
            'Starting shared scene',
            PARTY_SCENES.map(([id, name]) => [id, name]),
            'source-start-party-scene'
        ),
        placement = sourcePlacementControls({
            document,
            initial: draft.read().startingPresentation.scene,
            prefix: 'source-start-',
            changed: scene => change(() => draft.scene(scene))
        }),
        sceneDetails = el('details', undefined, 'lpc-studio-scene'),
        sceneBody = el('div', undefined, 'lpc-studio-stack'),
        sceneFields = el('div', undefined, 'lpc-studio-fields');
    sceneFields.append(startingBackground.wrap, startingLight.wrap, startingParty.wrap);
    sceneBody.append(sceneFields, placement.element);
    sceneDetails.append(el('summary', 'Starting scene'), sceneBody);
    editor.append(sceneDetails);
    startingBackground.input.onchange = startingLight.input.onchange = () => change(() => draft.scene({
        ...draft.read().startingPresentation.scene,
        backgroundId: startingBackground.input.value,
        lightId: startingLight.input.value
    }));
    startingParty.input.onchange = () => change(() => draft.partyScene(startingParty.input.value));
    const paste = el('textarea');
    paste.maxLength = 2_000_000;
    paste.placeholder = 'Paste a full-source package or official generator version 2 JSON export';
    paste.setAttribute('aria-label', 'Generator JSON');
    paste.dataset.control = 'source-json';
    const imports = el('details'), importBody = el('div', undefined, 'lpc-settings-stack');
    imports.dataset.control = 'source-import-section';
    imports.open = openImport;
    imports.append(el('summary', openImport ? 'Import generator JSON' : 'Import source package or generator JSON'),
        importBody);
    const file = el('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.dataset.control = 'source-import-file';
    file.hidden = true;
    file.setAttribute('aria-label', 'Import source package or generator JSON file');
    file.onchange = async () => {
        const token = ++importRead;
        try {
            const selected = file.files?.[0];
            if (!selected) return;
            if (selected.size > 2_000_000) throw Error('Import exceeds 2 MB.');
            const text = await selected.text();
            if (!disposed && !busy && token === importRead) {
                paste.value = text;
                await importText();
            }
        } catch (e) {
            if (!disposed) status.textContent = e.message;
        }
    };
    const chooseFile = button('Choose JSON file', () => file.click(), 'source-choose-file');
    importBody.append(
        el(
            'p',
            'Paste copied generator JSON or choose its .json export. Preview first; Apply saves.',
            'lpc-note'
        ),
        chooseFile,
        file,
        paste,
        button('Preview JSON', () => void importText(), 'source-import')
    );
    if (openImport) root.append(imports);
    else editor.append(imports);
    const scopes = chatOnly ? [['replacement', 'This chat']] : hasDefaults ? [
        ['replacement', 'This chat'],
        ['defaults', 'Future chats'],
        ['both', 'This chat and future chats']
    ] : [['both', 'Set up this character and chat']];
    const scope = select('Save to', scopes, 'source-scope');
    if (scopes.some(([id]) => id === initialScope)) scope.input.value = initialScope;
    const apply = button('Apply', () => void save(), 'source-apply');
    apply.disabled = true;
    const saveBar = el('footer', undefined, 'lpc-studio-savebar');
    saveBar.dataset.control = 'source-savebar';
    saveBar.append(scope.wrap, apply);
    if (openImport) {
        const adjustments = el('details');
        adjustments.dataset.control = 'source-import-adjustments';
        adjustments.append(el('summary', 'Adjust character and outfits'), editor);
        root.append(previewArea, adjustments);
    } else {
        const layout = el('div', undefined, 'lpc-studio-layout');
        layout.append(previewArea, editor);
        root.append(layout);
    }
    root.append(saveBar);
    document.body.append(root);
    const disconnectCanvas = observeSourceCanvas(window, canvas, stageEl, player),
        headerObserver = new window.ResizeObserver(() => root.style.setProperty('--lpc-studio-header-height', (Math.ceil(header.getBoundingClientRect()
            .height) +12) +'px'));
    headerObserver.observe(header);
    const disconnect = () => {
        disconnectCanvas();
        headerObserver.disconnect();
    };
    function controls(disabled) {
        for (const input of root.querySelectorAll('button,input,select,textarea')) input.disabled = disabled;
        apply.disabled = disabled || !valid;
        removeOutfit.disabled = disabled || draft.read().outfits.length <= 1;
    }
    function changedSlot() {
        selectedSlot = slots.input.value;
        showAllItems = false;
        studioCloset.sync();
        renderSelection(true);
    }
    function sync() {
        const d = draft.read(),
            o = draft.outfit(),
            equippedMap = { ...d.identity.selections, ...o.selections };
        body.input.value = d.identity.bodyType;
        outfits.input.replaceChildren();
        for (const outfit of d.outfits) {
            const option = el('option', outfit.name +(outfit.id === d.startingPresentation.outfitId ? ' · start'
                : ''));
            option.value = outfit.id;
            outfits.input.append(option);
        }
        outfits.input.value = o.id;
        name.value = o.name;
        action.input.value = o.rest.actionId;
        frame.value = o.rest.frame;
        facing.input.value = d.startingPresentation.facing;
        for (const [dir, b]of directionBtns)
            b.setAttribute('aria-pressed', String(d.startingPresentation.facing === dir));
        startingMood.input.value = d.startingPresentation.moodId ?? 'none';
        match.checked = d.renderOptions.matchBodyColor;
        mask.checked = d.renderOptions.applyMask;
        const start = d.startingPresentation.playback,
            held = start.mode === 'hold' ? start : { ...d.outfits.find(o => o.id === d.startingPresentation.outfitId)
                .rest };
        startingActivity.input.options[0].textContent = 'Held: ' +held.actionId +' · frame ' +held.frame;
        startingActivity.input.value = start.mode === 'loop' ? start.actionId : 'none';
        updateSlotSelectEquipped(slots.input, equippedMap, catalog, SOURCE_IDENTITY_SLOTS);
        slots.input.value = selectedSlot;
        placement.set(d.startingPresentation.scene);
        startingBackground.input.value = d.startingPresentation.scene.backgroundId;
        startingLight.input.value = d.startingPresentation.scene.lightId ?? 'day';
        startingParty.input.value = d.startingPresentation.partySceneId ?? 'together';
        const activeLoop = start.mode === 'loop' ? start.actionId : 'none';
        for (const [preset, b]of posePresetBtns)
            b.setAttribute('aria-pressed', String(o.rest.actionId === preset.actionId && Number(o.rest.frame) === preset.frame
                && activeLoop === preset.loop));
        removeOutfit.disabled = busy || d.outfits.length <= 1;
        markStart.setAttribute('aria-pressed', String(o.id === d.startingPresentation.outfitId));
        studioCloset.sync();
        repertoireCustomizer.sync();
        renderSelection();
    }
    function renderSelection(resetScroll = false) {
        const d = draft.read(),
            o = draft.outfit(),
            scroll = resetScroll ? 0 : results.scrollTop,
            query = search.value.toLowerCase().trim();
        const closetEntries = readCloset(d, catalog, window.localStorage, { includeOutfits: false });
        const totalInScope = selectedSlot === '__all__' ? catalog.items().filter(i => i.bodies.includes(d.identity.bodyType))
            .length : catalog.items().filter(i => i.slot === selectedSlot && i.bodies.includes(d.identity.bodyType)).length;
        search.placeholder = selectedSlot === '__all__' ? `Search ${totalInScope} items across all slots (e.g. blouse, jacket, glasses)…`
            : `Search ${totalInScope} item${totalInScope===1?'':'s'} in ${slotShortName(selectedSlot)}…`;
        const slotItems = selectedSlot === '__all__' ? catalog.items().filter(i => i.bodies.includes(d.identity.bodyType)
            && (`${i.name} ${i.id} ${i.slot} ${slotShortName(i.slot)}`.toLowerCase().includes(query))) : catalog.items()
            .filter(i => i.slot === selectedSlot && i.bodies.includes(d.identity.bodyType) && (`${i.name} ${i.id}`.toLowerCase()
            .includes(query)));
        const crossSlot = selectedSlot !== '__all__' && query && !slotItems.length,
            items = crossSlot ? catalog.items().filter(i => i.bodies.includes(d.identity.bodyType) && (`${i.name} ${i.id} ${i.slot} ${slotShortName(i.slot)}`.toLowerCase()
                .includes(query))) : slotItems;
        const maxShown = showAllItems ? items.length : 60;
        showMoreBtn.hidden = items.length <= maxShown;
        if (!showMoreBtn.hidden) showMoreBtn.textContent = `Show all ${items.length} items`;
        count.textContent = crossSlot ? `0 in ${slotShortName(selectedSlot)} · ${items.length} across all slots${items.length>maxShown?` (first ${maxShown} shown)`:''}`
            : items.length > maxShown ? `${items.length} items in ${selectedSlot==='__all__'?'all slots':slotShortName(selectedSlot)} · first ${maxShown} shown.`
            : `${items.length} item${items.length===1?'':'s'} in ${selectedSlot==='__all__'?'all slots':slotShortName(selectedSlot)}`;
        results.replaceChildren();
        for (const item of items.slice(0, maxShown)) {
            const fullItem = catalog.item(item.id);
            const isIdentity = SOURCE_IDENTITY_SLOTS.includes(item.slot);
            const activeSel = d.identity.selections[item.slot] ?? o.selections[item.slot];
            const isCurrentlyEquipped = activeSel?.itemId === item.id;
            const canUnequip = item.slot !== 'body' && item.slot !== 'head';
            const activeClosetKey = isCurrentlyEquipped ? closetKeyForSelection(item.slot, activeSel) : '';
            const closetMatch = closetEntries.find(e => e.itemId === item.id && (!activeClosetKey || e.key === activeClosetKey))
                ?? closetEntries.find(e => e.itemId === item.id);
            const label = selectedSlot === '__all__' || crossSlot ? `${item.name} (${slotShortName(item.slot)})`
                : item.name;
            const row = el('div', undefined, 'lpc-studio-item-row');
            const b = button(label, () => {
                change(() => {
                    if (isCurrentlyEquipped && canUnequip) {
                        draft.setItem(item.slot, null);
                        return;
                    }
                    draft.setItem(item.slot, item.id);
                    if (closetMatch?.variant && fullItem.variants?.includes(closetMatch.variant)) {
                        draft.setVariant(item.slot, closetMatch.variant);
                    }
                });
                results.querySelector(`[data-item-id="${item.id}"]`)?.focus({ preventScroll: true });
            });
            b.className = 'lpc-studio-item-btn';
            b.dataset.itemId = item.id;
            b.setAttribute('aria-pressed', String(isCurrentlyEquipped));
            b.title = isCurrentlyEquipped && canUnequip ? `Currently wearing ${item.name} — click to take off`
                : `Click to preview ${item.name} on your character`;
            const rowActions = el('div', undefined, 'lpc-studio-row-swatches');
            for (const ch of swatchChannelsForItem(catalog, fullItem)) {
                const currentColor = ch.isVariant ? (isCurrentlyEquipped ? (activeSel.variant || fullItem.variants[0])
                    : (closetMatch?.variant || fullItem.variants[0] || '')) : (isCurrentlyEquipped ? (activeSel.colors?.[ch.channel]
                    ?? '') : (closetMatch?.colors?.[ch.channel] ?? d.identity.colorMemory[item.slot]?.[ch.channel]
                    ?? ''));
                const swatchDropdown = createInlineSwatchDropdown({
                    document,
                    catalog,
                    itemId: item.id,
                    channel: ch,
                    currentColor,
                    rootContainer: root,
                    onPickColor: chosenColor => {
                        change(() => {
                            const cur = (isIdentity ? draft.read().identity.selections : draft.outfit().selections)[item.slot];
                            if (!cur || cur.itemId !== item.id) draft.setItem(item.slot, item.id);
                            if (ch.isVariant) draft.setVariant(item.slot, chosenColor);
                            else draft.setColor(item.slot, ch.channel, chosenColor);
                        });
                    },
                });
                rowActions.append(swatchDropdown);
            }
            if (!isIdentity) {
                const exactInCloset = isCurrentlyEquipped ? closetEntries.some(e => e.key === activeClosetKey)
                    : Boolean(closetMatch);
                const closetBtn = decorateButton(
                    document,
                    button(
                        'Closet',
                        e => {
                            e.stopPropagation();
                            change(() => {
                                const selId = draft.selected();
                                if (exactInCloset) {
                                    const targetKey = isCurrentlyEquipped ? activeClosetKey : closetMatch?.key;
                                    if (targetKey) {
                                        const d = draft.read();
                                        removeClosetEntry(d, targetKey, catalog, null);
                                        draft.replace(d);
                                        draft.select(selId);
                                    }
                                    return;
                                }
                                const cur = draft.outfit().selections[item.slot];
                                if (!cur || cur.itemId !== item.id) draft.setItem(item.slot, item.id);
                                const eq = draft.outfit().selections[item.slot];
                                if (eq) {
                                    const d = draft.read();
                                    addClosetEntry(d, { slot: item.slot, ...eq }, catalog, null);
                                    draft.replace(d);
                                    draft.select(selId);
                                }
                            });
                        },
                        `row-closet-${item.id}`
                    ),
                    exactInCloset ? 'check' : 'plus',
                    'Closet'
                );
                closetBtn.className = 'lpc-row-closet-btn';
                closetBtn.dataset.inCloset = String(exactInCloset);
                closetBtn.title = exactInCloset ? 'Saved in character closet (click to remove from closet)' : 'Add this item & color to your character closet';
                rowActions.append(closetBtn);
            }
            row.append(b, rowActions);
            results.append(row);
        }
        results.scrollTop = scroll;
    }
    function change(operation) {
        if (disposed || busy) return;
        importRead++;
        try {
            const identity = JSON.stringify(draft.read().identity);
            draftNotices = [];
            operation();
            const consumed = draft.consumeNotices();
            if (consumed.length) draftNotices = consumed;
            if (JSON.stringify(draft.read().identity) !== identity) importNotices = [];
            sync();
            void preview();
        } catch (error) {
            valid = false;
            apply.disabled = true;
            status.textContent = sourceProblem(error, catalog);
        }
    }
    async function preview() {
        const token = ++epoch;
        valid = false;
        apply.disabled = true;
        try {
            draft.canonicalize();
            const definition = state.validateDefinition(draft.read()),
                p = draft.presentation(),
                current = () => !disposed && token === epoch;
            const [prepared, background] = await Promise.all([
                renderer.prepare(definition, p, { current, actionId: loop.checked ? p.playback.actionId : null }),
                stage.prepare(p.scene)
            ]);
            if (!current()) return;
            player.publish(prepared.sheet, p.facing);
            stage.publish(background);
            valid = true;
            status.textContent = [sourcePresentationNotice(prepared, true), ...draftNotices, ...importNotices].join(' ');
            apply.disabled = busy;
        } catch (error) {
            if (!disposed && token === epoch) status.textContent = sourceProblem(error, catalog);
        }
    }
    async function importText() {
        if (busy || disposed) return;
        importRead++;
        try {
            if (paste.value.length > 2_000_000) throw Error('Import exceeds 2 MB.');
            const isPackage = JSON.parse(paste.value)?.kind === SOURCE_PACKAGE_KIND,
                imported = isPackage ? runtime.packages.importDocument(paste.value, draft.read().characterId)
                    : runtime.state.importDefinition(
                    paste.value,
                    draft.read().characterId,
                    {
                        restActionId: action.input.value,
                        restFrame: Number(frame.value),
                        facing: facing.input.value
                    }
                );
            draft.replace(imported.definition);
            draftNotices = [];
            importedAssets = imported.embeddedAssets ?? {};
            importNotices = [...new Set((imported.warnings ?? []).filter(
                w => w.code === 'reviewed_shared_eye_color' || w.code === 'fallback_rest_action'
            ).map(w => w.message))];
            sync();
            await preview();
        } catch (error) {
            status.textContent = sourceProblem(error, catalog);
        }
    }
    async function save() {
        if (!valid || busy || disposed) return;
        busy = true;
        const token = ++epoch;
        controls(true);
        try {
            const definition = state.validateDefinition(draft.canonicalize()),
                presentation = definition.startingPresentation,
                current = () => !disposed && token === epoch;
            for (const o of definition.outfits)
                await renderer.prepare(
                    definition,
                    { ...presentation, outfitId: o.id, playback: { mode: 'hold', ...o.rest } },
                    { current }
                );
            await Promise.all([
                renderer.prepare(definition, presentation, { current }),
                stage.prepare(presentation.scene),
                stage.prepare(partyScene(presentation.partySceneId))
            ]);
            if (!current()) return;
            await onApply({
                definition,
                presentation,
                mode: scope.input.value,
                embeddedAssets: importedAssets
            }, current);
            if (!disposed) remove();
        } catch (error) {
            if (!disposed) status.textContent = sourceProblem(error, catalog);
        } finally {
            busy = false;
            if (!disposed) controls(false);
        }
    }
    function remove() {
        if (disposed) return;
        disposed = true;
        epoch++;
        disconnect();
        player.dispose();
        renderer.dispose();
        stage.dispose();
        root.remove();
        if (focus?.isConnected) focus.focus();
    }
    function cancel() {
        remove();
        onCancel();
    }
    body.input.onchange = () => change(() => {
        const nextBody = body.input.value;
        draft.body(nextBody);
        const curHead = draft.read().identity.selections.head?.itemId;
        if (nextBody === 'female' && curHead === 'heads_human_male') draft.setItem('head', 'heads_human_female');
        else if (nextBody === 'male' && curHead === 'heads_human_female') draft.setItem('head', 'heads_human_male');
    });
    outfits.input.onchange = () => change(() => draft.select(outfits.input.value));
    name.onchange = () => change(() => draft.rename(name.value));
    slots.input.onchange = changedSlot;
    search.oninput = () => {
        showAllItems = false;
        renderSelection(true);
    };
    action.input.onchange = frame.onchange = () => change(() => draft.rest(action.input.value, Number(frame.value)));
    startingActivity.input.onchange = () => change(() => draft.startingActivity(startingActivity.input.value));
    facing.input.onchange = () => change(() => draft.facing(facing.input.value));
    startingMood.input.onchange = () => change(() => draft.mood(startingMood.input.value));
    match.onchange = () => change(() => draft.options({ matchBodyColor: match.checked }));
    mask.onchange = () => change(() => draft.options({ applyMask: mask.checked }));
    loop.onchange = () => void preview();
    root.onkeydown = event => {
        if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            cancel();
            return;
        }
        if (event.key !== 'Tab') return;
        const nodes = [...root.querySelectorAll('button,input,select,textarea')].filter(n => !n.disabled && n.getClientRects()
                .length),
            first = nodes[0],
            last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    };
    sync();
    void preview();
    if (openImport) imports.querySelector('summary')?.focus();
    else root.querySelector('button')?.focus();
    return { remove };
}
