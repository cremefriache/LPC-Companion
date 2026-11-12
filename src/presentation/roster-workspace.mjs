import { createFloatingLauncher } from './floating-launcher.mjs';
import { createSettingsDrawer } from './settings-drawer.mjs';
import { composeActivity } from './animation-sheets.mjs';
import { activityAnimation } from '../state/animation-program.mjs';
import { partyScene } from '../state/party.mjs';
import { createPartyView } from './party-view.mjs';
import { createAdaptiveView as createCompanionView } from './adaptive-view.mjs';
import { createBrowserComposer } from './browser-composer.mjs';
import { createSourceRenderer } from './source-renderer.mjs';
import { createStage, drawScenePreview } from './stage.mjs';
import { selectionsFor } from '../catalog/catalog.mjs';
import { matchesMemberResponse } from '../state/model-contract.mjs';
import { createButton, createLuciteIcon, createSectionHeader } from './molecules.mjs';

/** At most two panels share one dock, so narrow views cannot cover each other. */
export function createRosterWorkspace({
    document,
    window,
    active,
    primarySessions,
    rosters,
    toolHub,
    fullRuntime,
    preferences,
    settingsDrawer: sharedDrawer,
    uiConfig = {},
    baseUrl,
    isGenerating,
    revealSettings,
    readChatContext,
    sessionKey,
    readRosterContext,
    rosterKey,
    createModelControl
}) {
    const hostContainer = document.querySelector('#extensions_settings');
    if (!hostContainer) return null;
    const scope = readRosterContext ? readRosterContext(window.SillyTavern.getContext()) : active;
    if (!scope) return null;
    const settingsDrawer = sharedDrawer ?? createSettingsDrawer({ document, container: hostContainer }),
        container = document.createElement('div'),
        reveal = () => {
            revealSettings();
            settingsDrawer.reveal();
        };
    settingsDrawer.content.append(container);
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const button = (text, handler, id) => {
        const node = el('button', text);
        node.type = 'button';
        node.onclick = handler;
        if (id) node.dataset.control = id;
        return node;
    };
    const root = el('section', undefined, 'lpc-companion lpc-roster-settings');
    root.id = 'lpc-companion-roster';
    const cardHead = createSectionHeader(document, {
        icon: 'users',
        title: scope.kind === 'group' ? 'Group companions' : 'Additional companion',
        subtitle: scope.kind === 'group' ? 'Independent group member snapshots' : 'Add a second companion to this chat'
    });
    const note = el(
        'p',
        scope.kind === 'group' ? 'Bring up to two configured companions into this chat. Their appearances and scenes stay independent.'
            : 'Add a second companion from a configured character. Changes stay in this chat.',
        'lpc-note'
    );
    const status = el('p', 'Reading verified roster…', 'lpc-roster-status lpc-status-banner');
    status.setAttribute('role', 'status');
    status.dataset.control = 'roster-status';
    const sourceLabel = el('label', 'Source character', 'lpc-field'), source = el('select');
    source.dataset.control = 'roster-source';
    sourceLabel.append(source);
    const previewCanvas = el('canvas');
    previewCanvas.width = previewCanvas.height = 128;
    previewCanvas.hidden = true;
    previewCanvas.dataset.control = 'roster-preview';
    previewCanvas.setAttribute('aria-label', 'Additional companion setup preview');
    previewCanvas.setAttribute('role', 'img');
    const previewButton = button('Preview companion', () => void previewSource(), 'roster-preview-source');
    const addButton = button('Add to this chat', () => void add(), 'roster-add');
    addButton.disabled = true;
    const cancelButton = button('Cancel preview', () => clearPreview(), 'roster-cancel-preview');
    const reload = button('Refresh list', () => void refresh(), 'roster-reload');
    const launch = button('Open companions', () => void openAll(), 'roster-open');
    launch.hidden = true;
    const recovery = el('div'), entries = el('div');
    entries.dataset.control = 'roster-entries';
    const setup = el('details', undefined, 'lpc-roster-setup');
    setup.dataset.control = 'roster-setup';
    const setupBody = el('div', undefined, 'lpc-settings-stack'),
        previewActions = el('div', undefined, 'lpc-settings-preview-actions');
    previewActions.append(previewButton, cancelButton);
    setupBody.append(sourceLabel, previewActions, previewCanvas, addButton);
    setup.append(el('summary', 'Add a companion'), setupBody);
    const settingsActions = el('div', undefined, 'lpc-settings-actions');
    settingsActions.append(launch, reload);
    const management = el('details', undefined, 'lpc-files');
    management.dataset.control = 'roster-management';
    management.append(el('summary', 'Manage companions & backups'), entries);
    root.append(cardHead.element, note, status, settingsActions, setup, recovery, management);
    container.append(root);
    const initialDock = preferences?.get().dock ?? primarySessions?.get(active)?.dock ?? 'left';
    const workspace = el('section', undefined, 'lpc-companion lpc-roster-workspace');
    workspace.id = 'lpc-companion-workspace';
    workspace.hidden = true;
    workspace.dataset.dock = initialDock;
    workspace.setAttribute('aria-label', 'Companion workspace');
    const header = el('header'),
        headerLead = el('div', undefined, 'lpc-panel-title-wrap'),
        dock = el('select');
    dock.dataset.control = 'workspace-dock';
    dock.setAttribute('aria-label', 'Companion workspace position');
    for (const [id, name]of [['left', 'Left dock'], ['right', 'Right dock'], ['inline', 'In settings']]) {
        const option = el('option', name);
        option.value = id;
        dock.append(option);
    }
    dock.value = initialDock;
    const detailBar = el('div', undefined, 'lpc-party-detailbar');
    detailBar.hidden = true;
    const detailMain = el('div', undefined, 'lpc-party-detailbar-main'),
        detailLead = el('div', undefined, 'lpc-panel-title-wrap'),
        detailTitle = el('strong', 'Companion controls'),
        detailActions = el('div', undefined, 'lpc-party-detailbar-actions'),
        partyRemoveBtn = createButton(document, {
            label: 'Remove from chat',
            icon: 'trash',
            variant: 'ghost',
            size: 'sm',
            control: 'party-remove',
            onClick: () => {
                if (!selected || selected === 'primary' || !children.has(selected)) return;
                pendingRemoveId = pendingRemoveId === selected ? null : selected;
                updateSlots();
            },
        }),
        collapse = button(
            'Hide details',
            () => {
                const previous = selected;
                selected = null;
                pendingRemoveId = null;
                updateSlots();
                party?.element.querySelector(`[data-party-member="${previous}"] [data-control=party-details]`)?.focus();
            },
            'party-collapse'
        );
    partyRemoveBtn.hidden = true;
    const detailConfirm = el('div', undefined, 'lpc-roster-remove-confirm');
    detailConfirm.hidden = true;
    detailConfirm.dataset.control = 'party-remove-prompt';
    const detailConfirmNote = el('p', 'Removes from this chat only; character card defaults are kept.', 'lpc-note');
    const detailConfirmActions = el('div', undefined, 'lpc-roster-remove-actions');
    const partyConfirmRemoveBtn = createButton(document, {
        label: 'Confirm remove',
        icon: 'trash',
        variant: 'danger',
        size: 'sm',
        control: 'party-remove-confirm',
        onClick: () => {
            if (!selected || selected === 'primary' || !children.has(selected)) return;
            const targetId = selected;
            const targetLabel = accepted.get(targetId)?.label
                ?? rosters.get(scope)?.roster?.companions.find(c => c.companionId === targetId)?.label
                ?? 'companion';
            void removeCompanion(targetId, targetLabel);
        },
    });
    const partyCancelRemoveBtn = createButton(document, {
        label: 'Cancel',
        variant: 'secondary',
        size: 'sm',
        control: 'party-remove-cancel',
        onClick: () => {
            pendingRemoveId = null;
            updateSlots();
            partyRemoveBtn.focus();
        },
    });
    detailConfirmActions.append(partyConfirmRemoveBtn, partyCancelRemoveBtn);
    detailConfirm.append(detailConfirmNote, detailConfirmActions);
    detailLead.append(createLuciteIcon(document, 'sliders', 'lpc-lucite-icon-sm'), detailTitle);
    detailActions.append(partyRemoveBtn, collapse);
    detailMain.append(detailLead, detailActions);
    detailBar.append(detailMain, detailConfirm);
    const grid = el('div', undefined, 'lpc-roster-grid');
    headerLead.append(createLuciteIcon(document, 'users', 'lpc-lucite-icon-sm'), el('strong', 'Companions'));
    header.append(headerLead, dock, button('Close companions', () => minimize(), 'workspace-hide'));
    workspace.append(header, detailBar, grid);
    (initialDock === 'inline' ? root : document.body).append(workspace);
    const applyWorkspaceDock = value => {
        dock.value = value;
        workspace.dataset.dock = value;
        (value === 'inline' ? root : document.body).append(workspace);
    };
    dock.onchange = () => {
        preferences?.set({ dock: dock.value });
        const rec = primarySessions?.get(active);
        if (rec) rec.dock = dock.value;
        applyWorkspaceDock(dock.value);
        if (dock.value === 'inline') reveal();
    };
    const unsubscribePreferences = preferences?.subscribe((next, previous) => {
        if (!disposed && next.dock && next.dock !== previous?.dock) applyWorkspaceDock(next.dock);
    });
    const isWideDesktop = () => Boolean(uiConfig.autoOpenDesktop !== false && (window.visualViewport?.width ?? window.innerWidth) > 700);
    let disposed = false,
        epoch = 0,
        preview = null,
        refreshing = null,
        primary = null,
        multi = false,
        wantsOpen = isWideDesktop(),
        loadingRoster = false,
        previewBusy = false,
        adding = false,
        removing = false,
        pendingRemoveId = null,
        party = null,
        selected = null;
    const accepted = new Map();
    const children = new Map(), slots = new Map();
    const allViews = () => [...(primary ? [primary] : []), ...children.values()];
    const floating = createFloatingLauncher({
        document,
        window,
        tamagotchi: uiConfig.tamagotchiLauncher !== false,
        onToggle: async () => {
            if (refreshing) await refreshing;
            if (disposed) return;
            if (allViews().some(view => view.isOpen()) || !workspace.hidden) minimize();
            else if (!multi && primary) {
                await primary.open();
                if (!disposed && !primary.isOpen()) reveal();
            } else if (!allViews().length) {
                reveal();
                setup.open = true;
                source.focus();
            } else {
                await openAll();
                if (!disposed && workspace.hidden) reveal();
            }
        }
    });
    function syncFloatingState() {
        if (disposed) return;
        const ctx = window.SillyTavern?.getContext?.();
        const charName = scope.kind === 'group' ? 'Group' : (ctx?.characters?.[active?.characterIndex]?.name?.trim()
            || ctx?.name2?.trim() || '');
        const rec = primarySessions?.get(active);
        const rosterRec = rosters.get(scope);
        const configured = scope.kind === 'group' ? Boolean(rosterRec?.roster?.companions?.length) : Boolean(rec?.definition
            || rec?.binding);
        floating.syncState?.({ charName, configured, isGroup: scope.kind === 'group' });
    }
    syncFloatingState();
    function minimize() {
        wantsOpen = false;
        for (const view of allViews()) view.hide();
        party?.dispose();
        party = null;
        accepted.clear();
        workspace.hidden = true;
        floating.setExpanded(false);
        syncFloatingState();
        floating.focus();
    }
    function updateSlots() {
        for (const [id, node]of slots) {
            node.hidden = id !== selected || (id === 'primary' ? !primary?.isOpen() : !children.get(id)?.isOpen());
            if (node.hidden) viewFor(id)?.endInspectorCue();
        }
        const removable = Boolean(selected && selected !== 'primary' && children.has(selected));
        if (!removable) pendingRemoveId = null;
        partyRemoveBtn.hidden = !removable;
        detailConfirm.hidden = !removable || pendingRemoveId !== selected;
        if (removable && pendingRemoveId === selected) {
            const label = accepted.get(selected)?.label
                ?? rosters.get(scope)?.roster?.companions.find(c => c.companionId === selected)?.label
                ?? 'this companion';
            detailConfirmNote.textContent = `Remove ${label} from this chat only? Their character card defaults are kept.`;
        }
        detailBar.hidden = !selected;
        for (const row of party?.element.querySelectorAll('[data-party-member]') ?? []) {
            const isSelected = row.dataset.partyMember === selected;
            row.dataset.selected = String(isSelected);
            row.querySelector('[data-control=party-details]')?.setAttribute('aria-expanded', String(isSelected));
        }
    }
    function closed() {
        if (!disposed) {
            floating.setExpanded(allViews().some(view => view.isOpen()));
            syncFloatingState();
        }
        if (selected && !viewFor(selected)?.isOpen()) selected = null;
        updateSlots();
        if (!disposed && !allViews().some(view => view.isOpen()) && !party) {
            workspace.hidden = true;
            wantsOpen = false;
        }
    }
    function opened(key, info = { automatic: true }) {
        floating.setExpanded(true);
        syncFloatingState();
        if (!info.automatic) wantsOpen = true;
        if (multi && !info.automatic) selected = key;
        updateSlots();
        if (!disposed && multi) {
            wantsOpen = true;
            workspace.hidden = false;
        }
    }
    function slot(id) {
        if (!slots.has(id)) {
            const node = el('div', undefined, 'lpc-roster-slot');
            node.dataset.companionSlot = id;
            grid.append(node);
            slots.set(id, node);
        }
        return slots.get(id);
    }
    function viewFor(key) {
        return key === 'primary' ? primary : children.get(key);
    }
    async function details(key) {
        selected = key;
        detailTitle.textContent = accepted.get(key)?.label ?? 'Companion controls';
        await viewFor(key)?.open();
        updateSlots();
        slots.get(key)?.scrollIntoView({ block: 'nearest' });
    }
    function ensureParty() {
        if (party || disposed) return party;
        party = createPartyView({
            document,
            window,
            baseUrl,
            preferences,
            getEmbeddedAssets: () => ({
                ...primarySessions.get(active)?.binding?.embeddedAssets,
                ...rosters.get(scope)?.roster?.embeddedAssets
            }),
            onSpeechDismiss: key => viewFor(key)?.clearSpeech(),
            onDetails: key => void details(key),
            onMove: async (key, id) => {
                await viewFor(key)?.openQuiet();
                return viewFor(key)?.setPartyScene(id);
            },
            onModel: async (key, value) => {
                if (value && preferences && !preferences.get().toolCalling) return false;
                await viewFor(key)?.openQuiet();
                return viewFor(key)?.enableModel(value);
            }
        });
        workspace.insertBefore(party.element, detailBar);
        for (const [key, { label, result, paused, model }]of accepted) {
            party.publish(key, label, result);
            party.pause(key, paused ?? false);
            party.model(key, model ?? false);
        }
        return party;
    }
    function presentationHooks(key, label) {
        return {
            preparePresentation: (presentation, assets) => multi ? ensureParty().prepare(presentation, assets)
                : Promise.resolve(null),
            onPresentation: result => {
                if (disposed) return;
                accepted.set(key, { ...accepted.get(key), label, result });
                if (multi) ensureParty().publish(key, label, result);
            },
            onCue: (...args) => party?.cue(key, ...args),
            onSequence: (...args) => party?.sequence(key, ...args) ?? false,
            onStopSequence: () => party?.stop(key),
            onPause: value => {
                const saved = accepted.get(key);
                if (saved) saved.paused = value;
                party?.pause(key, value);
            },
            onSpeech: text => party?.speech(key, text),
            onModelEnabled: value => {
                const saved = accepted.get(key);
                if (saved) saved.model = value;
                party?.model(key, value);
            },
        };
    }
    if (scope.kind === 'character')
        primary = createCompanionView({
            ...presentationHooks('primary', 'Primary companion'),
            document,
            window,
            active,
            sessions: primarySessions,
            toolHub,
            fullRuntime,
            preferences,
            uiConfig,
            createModelControl,
            resolveContext: readChatContext,
            contextKey: sessionKey,
            freshRead: Boolean(preferences),
            baseUrl,
            isGenerating,
            revealSettings: reveal,
            settingsContainer: container,
            returnFocus: () => floating.focus(),
            onPanelClosed: closed,
            onPanelOpened: info => opened('primary', info),
            canAutoOpen: () => wantsOpen,
            whenContextReady: () => refreshing ?? Promise.resolve()
        });
    function updateControls() {
        if (disposed) return;
        const record = rosters.get(scope),
            full = (record?.roster?.companions.length ?? 0) >= (scope.kind === 'group' ? 2 : 1),
            blocked = Boolean(record?.conflict),
            busy = loadingRoster || adding || removing;
        source.disabled = busy || full || blocked;
        previewButton.disabled = busy || previewBusy || full || blocked || !source.options.length;
        addButton.disabled = busy || !preview?.ready || blocked;
        addButton.hidden = !preview?.ready;
        cancelButton.disabled = adding || removing;
        cancelButton.hidden = !preview;
        reload.disabled = busy;
        partyRemoveBtn.disabled = busy || blocked;
        partyConfirmRemoveBtn.disabled = busy || blocked;
        partyCancelRemoveBtn.disabled = removing;
        for (const btn of entries.querySelectorAll('button')) {
            btn.disabled = busy || (btn.dataset.control !== 'roster-remove-cancel' && blocked);
        }
        syncFloatingState();
    }
    async function removeCompanion(id, label) {
        if (removing || disposed) return;
        removing = true;
        updateControls();
        try {
            await rosters.remove(scope, id, () => !disposed);
            if (disposed) return;
            pendingRemoveId = null;
            if (selected === id) selected = null;
            await refresh();
            if (!disposed) {
                status.textContent = `Removed ${label} from this chat. Their character card defaults were not changed.`;
            }
        } catch (error) {
            if (!disposed) status.textContent = error.message;
        } finally {
            removing = false;
            updateControls();
        }
    }
    function clearPreview() {
        epoch++;
        preview?.composer.dispose();
        preview?.stage.dispose();
        preview = null;
        previewBusy = false;
        previewCanvas.hidden = true;
        updateControls();
    }
    function download(value) {
        const url = window.URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })),
            link = el('a');
        link.href = url;
        link.download = 'lpc-companion-roster-backup.json';
        link.click();
        const timer = window.setTimeout(() => {
            window.URL.revokeObjectURL(url);
            urls.delete (url);
        }, 1000);
        urls.set(url, timer);
    }
    const urls = new Map();
    management.append(button(
        'Export roster recovery backup',
        async () => {
            try {
                download(await rosters.backup(scope));
            } catch (error) {
                status.textContent = error.message;
            }
        },
        'roster-backup'
    ));
    settingsActions.append(button(
        'Reload chat & recover',
        async () => {
            try {
                await rosters.whenIdle();
                if (isGenerating())
                    throw Error('Wait for generation to finish before reloading the host chat.');
                await window.SillyTavern.getContext().reloadCurrentChat();
                if (!disposed) await refresh();
            } catch (error) {
                if (!disposed) status.textContent = error.message;
            }
        },
        'roster-reload-host'
    ));
    async function previewSource() {
        clearPreview();
        const current = epoch;
        previewBusy = true;
        updateControls();
        try {
            const selected = source.value, data = await rosters.previewSource(scope, selected);
            if (disposed || current !== epoch) return;
            const assets = data.binding.embeddedAssets ?? {},
                isSource = data.binding.definition.schemaVersion === 2,
                runtime = isSource ? await fullRuntime.get() : null;
            if (disposed || current !== epoch) return;
            const job = {
                ...data,
                avatar: selected,
                composer: isSource ? createSourceRenderer({ runtime, document, getEmbeddedAssets: () => assets })
                    : createBrowserComposer(document, baseUrl, () => assets, { fullRuntime }),
                stage: createStage({ document, window, baseUrl, getEmbeddedAssets: () => assets })
            };
            preview = job;
            job.prepare = definition => isSource ? job.composer.prepare(definition, definition.startingPresentation).then(value => value.sheet)
                : composeActivity(
                job.composer,
                selectionsFor(definition, definition.startingPresentation.outfitId),
                definition.startingPresentation
            );
            const definition = data.binding.definition,
                [sheet, stage] = await Promise.all([
                    job.prepare(definition),
                    job.stage.prepare(definition.startingPresentation.scene),
                    job.stage.prepare(partyScene(definition.startingPresentation.partySceneId))
                ]);
            if (disposed || preview !== job || current !== epoch) return;
            drawScenePreview(previewCanvas, sheet, definition.startingPresentation, stage);
            previewCanvas.hidden = false;
            job.ready = true;
            updateControls();
            status.textContent = `Preview ready for ${job.label}. Add copies these defaults once into this chat; Cancel writes nothing.`;
        } catch (error) {
            if (!disposed && current === epoch) {
                status.textContent = error.message;
                clearPreview();
            }
        } finally {
            if (current === epoch) previewBusy = false;
            updateControls();
        }
    }
    source.onchange = () => {
        clearPreview();
        status.textContent = source.selectedOptions[0]?.dataset.error ?? 'Preview the selected source before adding.';
    };
    async function add() {
        const job = preview;
        if (!job?.ready) return;
        adding = true;
        updateControls();
        try {
            await rosters.add(
                scope,
                job.avatar,
                async definition => {
                    await Promise.all([
                        job.prepare(definition),
                        job.stage.prepare(definition.startingPresentation.scene),
                        job.stage.prepare(partyScene(definition.startingPresentation.partySceneId))
                    ]);
                },
                () => !disposed && preview === job,
                job.binding
            );
            if (disposed) return;
            clearPreview();
            await refresh();
            await openAll();
        } catch (error) {
            if (!disposed) {
                status.textContent = error.message;
            }
        } finally {
            adding = false;
            updateControls();
        }
    }
    async function openAll() {
        if (disposed) return;
        wantsOpen = true;
        workspace.hidden = false;
        if (multi) ensureParty();
        if (primary && multi) primary.setManagedDock(slot('primary'));
        for (const [id, view]of children) view.setManagedDock(slot(id));
        await Promise.all(allViews().map(view => view.openQuiet()));
        if (disposed) return;
        workspace.hidden = !wantsOpen || !allViews().some(view => view.isOpen());
        updateSlots();
    }
    async function recover(choice) {
        try {
            await rosters.recover(scope, choice);
            await refresh();
        } catch (error) {
            if (!disposed) status.textContent = error.message;
        }
    }
    async function refreshImpl() {
        clearPreview();
        try {
            const record = await rosters.load(scope);
            if (disposed) return;
            recovery.replaceChildren();
            if (record.conflict) {
                status.textContent = record.conflict;
                recovery.append(button('Fork independent roster for this copy', () => void recover('fork'), 'roster-fork'),
                    button('Confirm missed roster rename', () => void recover('rename'), 'roster-confirm-rename'));
                return;
            }
            const sources = await rosters.sources(scope);
            if (disposed) return;
            const previousSource = source.value;
            source.replaceChildren();
            for (const row of sources) {
                const option = el('option', `${row.name}${row.error?' · setup/recovery required':''}`);
                option.value = row.avatar;
                if (row.error) option.dataset.error = row.error;
                source.append(option);
            }
            if ([...source.options].some(option => option.value === previousSource)) source.value = previousSource;
            const ids = new Set(record.roster?.companions.map(entry => entry.companionId) ?? []);
            for (const [id, view]of children)
                if (!ids.has(id)) {
                    view.remove();
                    children.delete (id);
                    slots.get(id)?.remove();
                    slots.delete (id);
                }
            multi = scope.kind === 'group' || ids.size > 0;
            launch.hidden = !multi;
            if (multi && wantsOpen) ensureParty();
            if (primary && multi) primary.setManagedDock(slot('primary'));
            if (!multi) {
                selected = null;
                pendingRemoveId = null;
                party?.dispose();
                party = null;
                accepted.clear();
                workspace.hidden = true;
                if (primary) {
                    primary.setManagedDock(null);
                    slots.get('primary')?.remove();
                    slots.delete('primary');
                }
                updateSlots();
                floating.setExpanded(Boolean(primary?.isOpen()));
            }
            for (const entry of record.roster?.companions ?? [])
                if (!children.has(entry.companionId)) {
                    const sessions = rosters.facade(scope, entry.companionId),
                        viewId = `lpc-companion-${entry.companionId}`;
                    const view = createCompanionView({
                        ...presentationHooks(entry.companionId, entry.label),
                        document,
                        window,
                        active: scope,
                        sessions,
                        toolHub,
                        fullRuntime,
                        preferences,
                        uiConfig,
                        createModelControl,
                        resolveContext: readRosterContext,
                        contextKey: rosterKey,
                        baseUrl,
                        isGenerating,
                        revealSettings: reveal,
                        settingsContainer: container,
                        returnFocus: () => floating.focus(),
                        viewId,
                        title: `Companion · ${entry.label}`,
                        chatOnly: true,
                        onPanelClosed: closed,
                        onPanelOpened: info => opened(entry.companionId, info),
                        canAutoOpen: () => wantsOpen,
                        whenContextReady: () => refreshing ?? Promise.resolve(),
                        modelOptions: {
                            resolveContext: readRosterContext,
                            contextKey: rosterKey,
                            explicitTarget: scope.kind === 'group',
                            defaultBindings: false,
                            deferGroupAcceptance: scope.kind === 'group',
                            ...(scope.kind === 'group' ? { matchesAccepted: (chat, response) => matchesMemberResponse(chat,
                                response, sessions.get(scope)?.source.sourceAvatar) } : {}),
                            canTarget: () => scope.kind !== 'group' || window.SillyTavern.getContext().characters[window.SillyTavern.getContext()
                                .characterId]?.avatar === sessions.get(scope)?.source.sourceAvatar,
                            responseAllowed: message => scope.kind !== 'group' || message?.original_avatar === sessions.get(scope)
                                ?.source.sourceAvatar
                        }
                    });
                    view.setManagedDock(slot(entry.companionId));
                    children.set(entry.companionId, view);
                }
            const validKeys = new Set([
                ...(primary ? ['primary'] : []),
                ...[...record.entries].filter(([, value]) => !value.conflict).map(([id]) => id)
            ]);
            party?.retain(validKeys);
            if (selected && !validKeys.has(selected)) selected = null;
            for (const key of accepted.keys())
                if (!validKeys.has(key)) accepted.delete (key);
            entries.replaceChildren();
            const rosterCompanions = record.roster?.companions ?? [];
            if (!rosterCompanions.length) {
                entries.append(el('p', 'No additional companions in this chat.', 'lpc-note'));
            }
            for (const entry of rosterCompanions) {
                const box = el('div', undefined, 'lpc-roster-entry');
                box.dataset.companionId = entry.companionId;
                const entryHead = el('div', undefined, 'lpc-roster-entry-head');
                const confirmWrap = el('div', undefined, 'lpc-roster-remove-confirm');
                confirmWrap.hidden = true;
                confirmWrap.dataset.control = 'roster-remove-prompt';
                const removeBtn = createButton(document, {
                    label: 'Remove from this chat',
                    icon: 'trash',
                    variant: 'ghost',
                    size: 'sm',
                    control: 'roster-remove',
                    onClick: () => {
                        confirmWrap.hidden = !confirmWrap.hidden;
                    },
                });
                const confirmNote = el('p', `Remove ${entry.label} from this chat only? Their character card defaults are kept.`, 'lpc-note lpc-roster-confirm-note');
                const confirmActions = el('div', undefined, 'lpc-roster-remove-actions');
                const confirmBtn = createButton(document, {
                    label: 'Confirm remove',
                    icon: 'trash',
                    variant: 'danger',
                    size: 'sm',
                    control: 'roster-remove-confirm',
                    onClick: () => void removeCompanion(entry.companionId, entry.label),
                });
                const cancelBtn = createButton(document, {
                    label: 'Cancel',
                    variant: 'secondary',
                    size: 'sm',
                    control: 'roster-remove-cancel',
                    onClick: () => {
                        confirmWrap.hidden = true;
                        removeBtn.focus();
                    },
                });
                confirmActions.append(confirmBtn, cancelBtn);
                confirmWrap.append(confirmNote, confirmActions);
                entryHead.append(el('strong', entry.label), removeBtn);
                box.append(entryHead, el('p', `Companion UUID: ${entry.companionId}`, 'lpc-note lpc-roster-entry-uuid'), confirmWrap);
                const problem = record.entries.get(entry.companionId)?.conflict;
                if (problem) {
                    box.append(el('p', problem, 'lpc-note'));
                    const choice = el('select');
                    choice.dataset.control = 'roster-rename-source';
                    for (const member of sources.filter(source => source.characterId === entry.sourceCharacterId)) {
                        const option = el('option', member.name);
                        option.value = member.avatar;
                        choice.append(option);
                    }
                    box.append(choice, button(
                        'Confirm source card rename',
                        async () => {
                            try {
                                await rosters.rebind(scope, entry.companionId, choice.value);
                                await refresh();
                            } catch (error) {
                                status.textContent = error.message;
                            }
                        },
                        'roster-rebind'
                    ));
                }
                entries.append(box);
            }
            const full = ids.size >= (scope.kind === 'group' ? 2 : 1);
            setup.hidden = full;
            status.textContent = full ? 'Your companions are ready. Open the workspace to change outfits, scenes or controls.'
                : source.options.length ? 'Preview a character, then add their starting appearance to this chat.'
                : 'Set up a companion in a character chat first, then return here.';
            if (multi) {
                workspace.hidden = !wantsOpen;
                await Promise.all([...children.values()].map(view => view.refresh()));
                if (disposed) return;
                updateSlots();
                workspace.hidden = !wantsOpen || !allViews().some(view => view.isOpen());
                updateSlots();
            }
        } catch (error) {
            if (!disposed) status.textContent = error.message;
        } finally {
            updateControls();
        }
    }
    function refresh(includePrimary = true) {
        if (disposed) return Promise.resolve();
        if (refreshing) return refreshing;
        loadingRoster = true;
        clearPreview();
        updateControls();
        refreshing = (async () => {
            if (includePrimary) await primary?.refresh();
            await refreshImpl();
        })().finally(() => {
            refreshing = null;
            loadingRoster = false;
            updateControls();
        });
        return refreshing;
    }
    void refresh(false);
    return {
        refresh,
        clearSpeech() {
            party?.clearSpeech();
            for (const view of allViews()) view.clearSpeech();
        },
        cancelActions() {
            party?.cancel();
            for (const view of allViews()) view.cancelActions();
        },
        remove() {
            if (disposed) return;
            disposed = true;
            unsubscribePreferences?.();
            clearPreview();
            party?.dispose();
            party = null;
            accepted.clear();
            for (const view of allViews()) view.remove();
            children.clear();
            for (const [url, timer]of urls) {
                window.clearTimeout(timer);
                window.URL.revokeObjectURL(url);
            }
            urls.clear();
            workspace.remove();
            container.remove();
            if (!sharedDrawer) settingsDrawer.remove();
            floating.remove();
        }
    };
}
