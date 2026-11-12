import { SOURCE_ART_PREFIX, encodePng, validateEmbeddedAssets } from '../state/portable-assets.mjs';
import { createSourceRenderer } from './source-renderer.mjs';
import { createPlayer, CUE_REPEAT_MS } from './player.mjs';
import { createStage } from './stage.mjs';
import { createPresence, MOODS, moodLabel } from './presence.mjs';
import { createSourceModelContracts } from '../state/source-model-contract.mjs';
import { equal } from '../state/history.mjs';
import {
    sourceUI,
    sourcePlacementControls,
    observeSourceCanvas,
    sourcePresentationNotice,
    formatSourceActionLabel,
    SOURCE_POSE_PRESETS
} from './source-ui.mjs';
import { BACKGROUNDS, LIGHTS } from '../catalog/scenes.mjs';
import { PARTY_SCENES } from '../state/party.mjs';
import {
    ACTION_ICONS,
    createBlockerBanner,
    createControlGroup,
    createIcon,
    createLuciteIcon,
    createSectionHeader,
    createToggleRow,
    decorateButton,
    decorateIconButton
} from './molecules.mjs';
import { readRepertoire, isActionEnabledInRepertoire, applyRepertoireToDefinition } from '../state/repertoire.mjs';
import { createRepertoireCustomizer } from './repertoire-ui.mjs';
import { createLiveClosetBar } from './closet-ui.mjs';
import { toggleClosetLayer, unequipOutfitSlot, saveWornAsOutfit } from '../state/closet.mjs';
import { attachTamagotchiBehaviors } from './floating-launcher.mjs';

/** Source-format inspector; persistence still belongs to the shared continuity adapter. */
export function createSourceView({
    document,
    window,
    active,
    sessions,
    baseUrl,
    fullRuntime,
    initialRecord,
    onSourceStudio,
    onReload,
    settingsContainer,
    settingsId,
    viewId = 'lpc-companion',
    title = 'LPC Companion',
    chatOnly = false,
    isGenerating = () => false,
    revealSettings = () => {},
    onSpeech = () => {},
    onPanelClosed = () => {},
    onPanelOpened = () => {},
    canAutoOpen = () => true,
    returnFocus = null,
    whenContextReady = async () => {},
    toolHub,
    preferences,
    uiConfig = {},
    createModelControl,
    modelOptions = {},
    preparePresentation = async () => null,
    onPresentation = () => {},
    onSequence = () => false,
    onStopSequence = () => {},
    onPause = () => {},
    onModelEnabled = () => {}
}) {
    const autoMinimizeDesktop = uiConfig.autoMinimizeDesktop !== false,
        tamagotchiInteractive = uiConfig.tamagotchiInteractive !== false;
    const { el, button, select } = sourceUI(document),
        root = el('section', undefined, 'lpc-companion lpc-settings-card lpc-source-settings');
    root.id = settingsId ?? viewId;
    let record = initialRecord,
        panel = null,
        renderer = null,
        player = null,
        stage = null,
        presence = null,
        disconnect = null,
        tamaBehaviors = null,
        managed = null,
        disposed = false,
        epoch = 0,
        busy = false,
        status,
        controls,
        outfit,
        facing,
        activity,
        background,
        light,
        cue,
        program = [],
        replay = null,
        runtime,
        running = null,
        modelControl = null,
        sourceModels = null,
        modelToggle = null,
        modelStatus = null,
        pose = null,
        poseFrame = null,
        placement = null,
        sequenceReplay = null,
        sequenceStop = null,
        quickButtons = [],
        posePresetButtons = [],
        repertoireCustomizer = null,
        liveClosetBar = null,
        outfitHeading = null,
        activityReadout = null,
        sourceBlocker = null,
        sourceCapBadge = null,
        urls = new Set(),
        pendingModelConsent = false;
    const toolsAllowed = () => !preferences || (preferences.get().enabled !== false && preferences.get().toolCalling === true);
    function enableModel(value) {
        pendingModelConsent = false;
        if (disposed || !panel || !modelControl) return false;
        const requested = Boolean(value) && toolsAllowed();
        modelToggle.checked = requested;
        modelToggle.disabled = busy || reconciliationDepth > 0 || !toolsAllowed();
        try {
            modelControl.enable(requested);
            onModelEnabled(requested);
            return !value || requested;
        } catch (e) {
            modelToggle.checked = false;
            modelControl.enable(false);
            onModelEnabled(false);
            modelStatus.textContent = e.message;
            return false;
        }
    }
    const unsubscribePreferences = preferences?.subscribe((next, previous) => {
        if (disposed) return;
        if (next.toolCalling !== previous?.toolCalling || next.enabled !== previous?.enabled) {
            pendingModelConsent = next.enabled !== false && next.toolCalling === true;
            if (panel) enableModel(pendingModelConsent);
        }
        if (next.dock && next.dock !== previous?.dock) {
            if (record) record.dock = next.dock;
            const d = panel?.querySelector('[data-control=dock]');
            if (d) d.value = next.dock;
            if (panel && !managed) {
                panel.dataset.dock = next.dock;
                (next.dock === 'inline' ? root : document.body).append(panel);
                tamaBehaviors?.sync();
            }
        }
    });
    const cardHead = createSectionHeader(document, {
        icon: 'sparkles',
        title: title === 'LPC Companion' ? 'Current companion' : title,
        subtitle: chatOnly ? 'Chat-local source companion' : 'Full-source v2 character continuity'
    });
    const notice = el('p', 'Appearance follows this chat. Future defaults stay separate.', 'lpc-note'),
        error = el('p', undefined, 'lpc-status-banner');
    error.setAttribute('role', 'status');
    const launch = decorateButton(document, button('Open companion', () => void open(), 'open'), 'sparkles'),
        studio = decorateButton(
            document,
            button(
                'Catalog studio',
                () => void onSourceStudio(record?.definition, record?.presentation),
                'source-studio'
            ),
            'sliders'
        ),
        reload = decorateButton(document, button('Reload saved companion', () => void refresh(), 'reload'), 'refresh');
    const importJson = decorateButton(
        document,
        button(
            'Import JSON',
            () => void onSourceStudio(record?.definition, record?.presentation, undefined, true),
            'import-generator-json'
        ),
        'upload'
    );
    importJson.setAttribute('aria-label', 'Import generator JSON');
    importJson.title = 'Paste or choose a .json character exported by the official LPC generator';
    const credits = el('a', 'Full artwork credits');
    credits.href = new URL('assets/lpc/full-source/credits.html', baseUrl).href;
    credits.target = '_blank';
    credits.rel = 'noopener';
    const actions = el('div', undefined, 'lpc-settings-primary-actions');
    actions.append(launch, studio, importJson);
    launch.classList.add('lpc-primary-wide');
    const more = el('details', undefined, 'lpc-settings-more'),
        moreBody = el('div', undefined, 'lpc-settings-stack');
    more.dataset.control = 'source-settings-management';
    more.append(el('summary', 'More options'), moreBody);
    moreBody.append(reload, decorateButton(document, button('Export recovery backup', () => void backup(), 'backup'),
        'download'));
    if (!chatOnly)
        moreBody.append(decorateButton(
            document,
            button(
                'Edit future defaults',
                () => void onSourceStudio(record?.defaults, record?.defaults?.startingPresentation, 'defaults'),
                'edit-defaults'
            ),
            'sliders'
        ));
    moreBody.append(credits);
    root.append(cardHead.element, notice, actions, error, more);
    (settingsContainer ?? document.querySelector('#extensions_settings'))?.append(root);
    const fork = button('Make this copy independent', () => void resolve('fork'), 'fork'),
        rename = button('Confirm missed rename', () => void resolve('rename'), 'rename');
    fork.hidden = rename.hidden = !record?.conflict;
    root.append(fork, rename);
    async function resolve(choice) {
        let check = null, background = null;
        try {
            const saved = sessions.get(active), definition = saved?.defaults;
            if (!definition)
                throw Error('Export the saved data for recovery before replacing unsupported data.');
            const rt = await fullRuntime.get();
            if (disposed) return;
            check = createSourceRenderer({
                runtime: rt,
                document,
                getEmbeddedAssets: () => saved.binding?.embeddedAssets ?? {}
            });
            background = createStage({
                document,
                window,
                baseUrl,
                getEmbeddedAssets: () => saved.binding?.embeddedAssets ?? {}
            });
            await Promise.all([
                check.prepare(definition, definition.startingPresentation, { current: () => !disposed }),
                background.prepare(definition.startingPresentation.scene),
                preparePresentation(definition.startingPresentation, saved.binding?.embeddedAssets ?? {})
            ]);
            if (disposed) return;
            await sessions.resolve(active, choice);
            await (onReload?.() ?? refresh());
        } catch (e) {
            if (!disposed) error.textContent = e.message;
        } finally {
            check?.dispose();
            background?.dispose();
        }
    }
    function download(value, name) {
        for (const old of urls) window.URL.revokeObjectURL(old);
        urls.clear();
        const url = window.URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
        urls.add(url);
        const a = el('a');
        a.href = url;
        a.download = name;
        a.click();
    }
    async function exportPackage(complete) {
        if (!panel || busy) return;
        lock(true);
        const owner = panel,
            token = epoch,
            current = () => !disposed && panel === owner && epoch === token;
        try {
            const definition = structuredClone(record.definition), assets = embedded();
            const value = complete ? await runtime.packages.complete(definition, {
                current,
                loadBytes: async (key, sha) => {
                    if (key.startsWith(SOURCE_ART_PREFIX)) return runtime.packages.loadBytes(key, sha, assets);
                    if (Object.hasOwn(assets, key)) {
                        validateEmbeddedAssets({[key]: assets[key] });
                        return Uint8Array.from (atob(assets[key]), c => c.charCodeAt(0));
                    }
                    const response = await window.fetch(new URL('assets/lpc/' +key, baseUrl));
                    if (!response.ok) throw Error('Scene artwork is unavailable.');
                    const reader = response.body.getReader(), chunks = [];
                    let size = 0;
                    try {
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            size += value.length;
                            if (size > 9000 || !current()) throw Error('Scene export was cancelled or exceeds its size bound.');
                            chunks.push(value);
                        }
                    } finally {
                        await reader.cancel().catch (() => {});
                        reader.releaseLock();
                    }
                    const bytes = new Uint8Array(size);
                    let offset = 0;
                    for (const chunk of chunks) {
                        bytes.set(chunk, offset);
                        offset += chunk.length;
                    }
                    validateEmbeddedAssets({[key]: encodePng(bytes) });
                    return bytes;
                }
            }) : runtime.packages.config(definition);
            if (current()) {
                download(value, complete ? 'lpc-source-complete.json' : 'lpc-source-config.json');
                status.textContent = 'Package exported with verified artwork credits and full license notices.';
            }
        } catch (e) {
            if (current()) status.textContent = e.message;
        } finally {
            if (!disposed && panel === owner) lock(false);
        }
    }
    async function backup() {
        try {
            const data = await sessions.backup(active);
            if (disposed) return;
            for (const old of urls) window.URL.revokeObjectURL(old);
            urls.clear();
            const url = window.URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            urls.add(url);
            const a = el('a');
            a.href = url;
            a.download = 'lpc-companion-backup.json';
            a.click();
        } catch (e) {
            error.textContent = e.message;
        }
    }
    let reconciliationDepth = 0;
    const reconciliationWaiters = [];
    const waitForReconciliation = () => reconciliationDepth ? new Promise(resolve => reconciliationWaiters.push(resolve))
        : Promise.resolve();
    function beginReconciliation() {
        reconciliationDepth++;
        cancelActions();
        lock(busy);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            reconciliationDepth--;
            lock(busy);
            if (!reconciliationDepth)
                for (const resolve of reconciliationWaiters.splice(0)) resolve();
        };
    }
    function lock(value) {
        busy = value;
        for (const n of panel?.querySelectorAll('.lpc-panel-toolbar :is(button,input,select,textarea),.lpc-header-dock :is(select,input),.lpc-controls :is(button,input,select,textarea)') ?? []) n.disabled = value
            || reconciliationDepth > 0;
        studio.disabled = value || reconciliationDepth > 0;
        importJson.disabled = value || reconciliationDepth > 0;
        panel?.setAttribute('aria-busy', String(value || reconciliationDepth > 0));
        if (modelToggle)
            modelToggle.disabled = value || reconciliationDepth > 0 || !toolsAllowed();
        updateProgramControls();
    }
    function updateProgramControls() {
        if (sequenceReplay) sequenceReplay.disabled = busy || reconciliationDepth > 0 || !replay;
        if (sequenceStop) sequenceStop.disabled = busy || reconciliationDepth > 0;
        if (panel && record?.definition && runtime) {
            const rep = readRepertoire(record.definition, record.presentation.outfitId, window.localStorage);
            repertoireCustomizer?.sync();
            liveClosetBar?.sync();
            const supported = new Set(runtime.catalog.resolvableActions(runtime.state.recipeFor(record.definition,
                record.presentation.outfitId)));
            const blocked = [];
            let visibleCount = 0;
            for (const b of quickButtons) {
                const enabledInRep = isActionEnabledInRepertoire(b.dataset.quickAction, rep);
                b.hidden = !enabledInRep;
                if (!enabledInRep) continue;
                visibleCount++;
                const ok = supported.has(b.dataset.quickAction);
                b.disabled = busy || reconciliationDepth > 0 || !ok;
                if (!ok) blocked.push(b.textContent.trim());
            }
            for (const [preset, btn]of posePresetButtons) {
                btn.hidden = preset.id !== 'idle_stand' && !rep.poses.includes(preset.id.replace('_loop', ''));
                btn.disabled = busy || reconciliationDepth > 0 || !supported.has(preset.actionId);
            }
            const moodEl = panel.querySelector('[data-control=mood]');
            if (moodEl) {
                for (const opt of moodEl.options)
                    opt.hidden = opt.value !== 'none' && opt.value !== (record.presentation.moodId ?? 'none')
                        && !rep.expressions.includes(opt.value);
            }
            if (activity?.input) {
                for (const opt of activity.input.options)
                    opt.hidden = opt.value !== 'none' && opt.value !== 'idle' && opt.value !== record.presentation.playback?.actionId
                        && !rep.poses.includes(opt.value);
            }
            sourceBlocker?.set(blocked.length ? `Unavailable for current outfit layers: ${blocked.join(', ')}. Switch outfits or edit parts in Studio.`
                : '');
            if (sourceCapBadge) {
                sourceCapBadge.textContent = blocked.length ? `${visibleCount-blocked.length}/${visibleCount} ready`
                    : 'All ready';
                sourceCapBadge.dataset.tone = blocked.length ? 'warn' : 'ready';
                sourceCapBadge.prepend(createIcon(document, blocked.length ? 'alert' : 'check'));
            }
        }
    }
    function resetProgramView() {
        if (panel) {
            delete panel.dataset.sequenceStep;
            panel.dataset.animation = record?.presentation?.playback.actionId ?? '';
        }
    }
    function cancelActions() {
        epoch++;
        player?.cancel();
        resetProgramView();
        presence?.clearSpeech();
        onSpeech(null);
        onStopSequence();
        replay = null;
        updateProgramControls();
    }
    function close(focus = false) {
        pendingModelConsent = false;
        modelControl?.dispose();
        modelControl = null;
        sourceModels?.clear();
        sourceModels = null;
        cancelActions();
        tamaBehaviors?.dispose();
        tamaBehaviors = null;
        disconnect?.();
        disconnect = null;
        player?.dispose();
        renderer?.dispose();
        stage?.dispose();
        presence?.dispose();
        presence = null;
        panel?.remove();
        panel = renderer = player = stage = outfitHeading = activityReadout = sourceBlocker = sourceCapBadge = null;
        busy = false;
        onPause(false);
        onModelEnabled(false);
        onPanelClosed();
        if (focus && !disposed) {
            if (returnFocus) returnFocus();
            else {
                revealSettings();
                launch.focus();
            }
        }
    }
    function sync() {
        if (!panel || !record?.definition) return;
        const d = record.definition, p = record.presentation;
        outfit.input.replaceChildren();
        for (const o of d.outfits) {
            const option = el('option', o.name);
            option.value = o.id;
            outfit.input.append(option);
        }
        outfit.input.value = p.outfitId;
        facing.input.value = p.facing;
        activity.input.value = p.playback.mode === 'loop' ? p.playback.actionId : 'none';
        background.input.value = p.scene.backgroundId;
        light.input.value = p.scene.lightId ?? 'day';
        panel.dataset.outfit = p.outfitId;
        panel.dataset.companionId = d.characterId;
        panel.dataset.facing = p.facing;
        panel.dataset.animation = p.playback.actionId;
        panel.dataset.ready = 'true';
        delete panel.dataset.sequenceStep;
        placement?.set(p.scene);
        if (pose) {
            pose.input.value = p.playback.actionId;
            poseFrame.value = p.playback.mode === 'hold' ? p.playback.frame : 0;
        }
        if (outfitHeading) {
            const outfitLabel = d.outfits.find(o => o.id === p.outfitId)?.name ?? 'Outfit';
            outfitHeading.textContent = outfitLabel;
            outfitHeading.title = outfitLabel;
        }
        const facingLabel = { south: 'Front', west: 'Left', north: 'Back', east: 'Right' }[p.facing] ?? p.facing;
        if (activityReadout) {
            const actLabel = p.playback.mode === 'loop' ? `Activity · ${p.playback.actionId} (${facingLabel})`
                : `Pose · ${p.playback.actionId} (${facingLabel})`;
            activityReadout.textContent = actLabel;
            activityReadout.title = actLabel;
        }
        const mood = panel.querySelector('[data-control=mood]');
        if (mood) mood.value = p.moodId ?? 'none';
        const membership = panel.querySelector('[data-control=party-membership]');
        if (membership) membership.value = p.partySceneId ?? 'together';
        updateProgramControls();
    }
    function render(candidate, externalCurrent = () => true) {
        const work = executeRender(candidate, externalCurrent);
        running = work;
        return work.finally(() => {
            if (running === work) running = null;
        });
    }
    async function executeRender(candidate, externalCurrent) {
        if (disposed || !panel || busy || (reconciliationDepth > 0 && candidate.mode !== 'restore' && candidate.origin !== 'model')) return false;
        lock(true);
        const ownerPanel = panel,
            token = ++epoch,
            current = () => !disposed && panel === ownerPanel && token === epoch && externalCurrent();
        try {
            player.cancel();
            onStopSequence();
            const definition = runtime.state.validateDefinition(candidate.definition),
                presentation = runtime.state.validatePresentation(definition, definition.startingPresentation, candidate.presentation);
            const [prepared, preparedStage, preparedParty] = await Promise.all([
                renderer.prepare(definition, presentation, { current }),
                stage.prepare(presentation.scene),
                preparePresentation(presentation, embedded())
            ]);
            if (!current()) return false;
            const saved = await sessions.commit(active, { ...candidate, definition, presentation }, current);
            if (!current()) return false;
            record = sessions.get(active) ?? record;
            // Defaults-only edits do not replace the current accepted character.
            if (saved.defaultsOnly) return true;
            player.publish(prepared.sheet, presentation.facing);
            player.pause(record.paused ?? false);
            stage.publish(preparedStage, { transition: candidate.mode !== 'restore' });
            presence.setMood(presentation.moodId);
            onPresentation({ ...saved, ...prepared, preparedStage, preparedParty });
            onPause(record.paused ?? false);
            onModelEnabled(Boolean(modelToggle?.checked));
            sync();
            modelControl?.refresh();
            status.textContent = sourcePresentationNotice(prepared);
            return true;
        } catch (e) {
            if (current()) {
                status.textContent = e.message;
                sync();
            }
            return false;
        } finally {
            if (!disposed && panel === ownerPanel) lock(false);
        }
    }
    async function patch(patch) {
        if (busy || !record?.definition) return false;
        modelControl?.cancel();
        if (isGenerating()) {
            status.textContent = 'Wait for generation to finish.';
            sync();
            return false;
        }
        try {
            return await render({
                definition: record.definition,
                presentation: runtime.state.validatePresentation(record.definition, record.presentation, patch)
            });
        } catch (e) {
            status.textContent = e.message;
            sync();
            return false;
        }
    }
    const embedded = () => record?.binding?.embeddedAssets ?? {};
    async function prepareProgram(actions, definition, presentation, current = () => !disposed && Boolean(panel)) {
        const checked = sourceModels.programFor(actions.map(actionId => ({ actionId })), definition, presentation),
            steps = [];
        for (const { actionId } of checked) {
            const result = await renderer.prepare(definition, presentation, { current, actionId });
            steps.push({ sheet: result.sheet, durationMs: result.durationMs, actionId });
        }
        return steps;
    }
    function startProgram(steps, presentation, current = () => true) {
        if (!panel || !current()) return false;
        const token = ++epoch, live = () => !disposed && Boolean(panel) && token === epoch;
        const done = reason => {
            if (live()) {
                resetProgramView();
                status.textContent = reason === 'reduced-motion' ? 'Cue skipped for reduced motion.' : 'Returned to saved presentation.';
            }
        };
        const progress = (index, total) => {
            if (live()) {
                panel.dataset.sequenceStep = String(index);
                panel.dataset.animation = steps[index].actionId;
                status.textContent = `${index+1}/${total} · ${steps[index].actionId} · returns to the accepted presentation.`;
            }
        };
        replay = steps.map(s => s.actionId);
        status.textContent = 'Playing · hidden panels suspend active time.';
        updateProgramControls();
        const hidden = Boolean(managed?.hidden),
            shared = onSequence(steps, presentation.facing, hidden ? done : undefined, hidden ? progress : undefined);
        if (!hidden || !shared)
            player.playSequence(steps, presentation.facing, done, progress, { repeatMs: CUE_REPEAT_MS });
        return true;
    }
    async function play(actions) {
        if (!panel || busy || !record?.definition) return false;
        modelControl?.cancel();
        lock(true);
        const ownerPanel = panel,
            token = ++epoch,
            current = () => !disposed && panel === ownerPanel && token === epoch;
        try {
            player.cancel();
            onStopSequence();
            resetProgramView();
            const steps = await prepareProgram(actions, record.definition, record.presentation, current);
            if (!current()) return false;
            return startProgram(steps, record.presentation);
        } catch (e) {
            if (current()) status.textContent = e.message;
            return false;
        } finally {
            if (!disposed && panel === ownerPanel) lock(false);
        }
    }
    function setupModelControls() {
        modelToggle = el('input');
        modelToggle.type = 'checkbox';
        modelToggle.dataset.control = 'model-controls';
        modelToggle.hidden = true;
        modelStatus = el('p', '', 'lpc-note');
        modelStatus.dataset.control = 'model-status';
        modelStatus.setAttribute('role', 'status');
        panel.append(modelToggle, modelStatus);
        const ownerPanel = panel, ownerStatus = modelStatus;
        modelControl = createModelControl ? createModelControl({
            toolPolicy: preferences,
            active,
            getContext: () => window.SillyTavern.getContext(),
            getRecord: () => record,
            isGenerating,
            crypto: window.crypto,
            hub: toolHub,
            ownerKey: viewId,
            label: title,
            ...modelOptions,
            ...sourceModels,
            prepare: async (definition, presentation, _actionId, sequence) => {
                const current = () => !disposed && Boolean(panel);
                await Promise.all([
                    renderer.prepare(definition, presentation, { current }),
                    stage.prepare(presentation.scene),
                    preparePresentation(presentation, embedded())
                ]);
                if (sequence)
                    await prepareProgram(sequence.map(s => s.actionId), definition, presentation, current);
            },
            apply: async (pending, current) => {
                await (sessions.whenIdle?.() ?? Promise.resolve());
                await Promise.resolve();
                while (reconciliationDepth > 0 || running) {
                    await whenContextReady();
                    await waitForReconciliation();
                    await running;
                }
                await whenContextReady();
                await waitForReconciliation();
                await running;
                if (!current() || !panel) throw Error('The accepted response changed.');
                const steps = pending.sequence ? await prepareProgram(
                    pending.sequence.map(s => s.actionId),
                    pending.definition,
                    pending.presentation,
                    current
                ) : null;
                if (!current()) throw Error('The accepted response changed during preparation.');
                while (reconciliationDepth > 0 || running) {
                    await whenContextReady();
                    await waitForReconciliation();
                    await running;
                }
                const applied = await render({
                    definition: pending.definition,
                    expectedDefinition: pending.baselineDefinition,
                    presentation: pending.presentation,
                    origin: 'model',
                    response: pending.target
                }, current);
                if (!applied || !current()) throw Error('The response update could not be confirmed.');
                const same = () => current() && equal(record.definition, pending.definition) && equal(record.presentation,
                    pending.presentation);
                if (!same()) throw Error('The accepted presentation changed.');
                const played = steps ? startProgram(steps, pending.presentation, same) : true;
                if (pending.speech && same()) {
                    presence.showSpeech(pending.speech);
                    onSpeech(pending.speech);
                }
                return { actionFailed: !played };
            },
            report: message => {
                if (!disposed && panel === ownerPanel) ownerStatus.textContent = message;
            }
        }) : null;
        modelToggle.onchange = () => enableModel(modelToggle.checked);
        if (preferences && modelControl) enableModel(pendingModelConsent || toolsAllowed());
    }
    async function open(quiet = false) {
        if (disposed) return;
        if (panel) {
            onPanelOpened({ automatic: quiet });
            return;
        }
        const token = ++epoch;
        try {
            runtime = await fullRuntime.get();
            if (disposed || token !== epoch) return;
            if (!record) record = await sessions.create(active);
            if (disposed || token !== epoch) return;
            if (record.conflict) throw Error(record.conflict);
            if (!record.definition) throw Error('Reload companion state before opening.');
            record.dock = preferences?.get().dock ?? record.dock ?? 'left';
            panel = el('section', undefined, 'lpc-companion lpc-panel');
            panel.id = viewId +'-panel';
            panel.dataset.dock = managed ? 'inline' : record.dock;
            const h = el('header'),
                hLead = el('div', undefined, 'lpc-panel-title-wrap'),
                hCopy = el('div', undefined, 'lpc-header-copy');
            const resolveAvatarTitle = () => {
                if (chatOnly && title && title !== 'LPC Companion') {
                    const clean = title.replace(/^Companion\s*·\s*/i, '').trim();
                    return clean ? `${clean}'s avatar` : title;
                }
                const ctx = window.SillyTavern?.getContext?.(),
                    charName = ctx?.characters?.[active?.characterIndex]?.name?.trim() || ctx?.name2?.trim() || (title
                        && title !== 'LPC Companion' && title !== 'Primary companion' ? title.trim() : '');
                return charName ? `${charName}'s avatar` : 'Character avatar';
            };
            hCopy.append(el('span', chatOnly ? 'Companion avatar' : 'Character avatar', 'lpc-header-kicker'), el('h3',
                resolveAvatarTitle(), 'lpc-eyebrow'));
            hLead.append(createLuciteIcon(document, 'shirt', 'lpc-lucite-icon-sm'), hCopy);
            const dock = select(
                'Panel position',
                [['left', 'Left dock'], ['right', 'Right dock'], ['inline', 'In settings']],
                'dock'
            );
            dock.input.value = record.dock;
            dock.input.disabled = Boolean(managed);
            dock.input.setAttribute('aria-label', 'Panel position');
            dock.wrap.classList.add('lpc-toolbar-dock', 'lpc-header-dock');
            dock.wrap.hidden = Boolean(managed);
            dock.input.onchange = () => {
                record.dock = dock.input.value;
                if (!managed) preferences?.set({ dock: dock.input.value });
                panel.dataset.dock = managed ? 'inline' : record.dock;
                (managed ?? (record.dock === 'inline' ? root : document.body)).append(panel);
                tamaBehaviors?.sync();
                if (!managed && record.dock === 'inline') revealSettings();
            };
            const setMinimized = value => {
                record.minimized = Boolean(value);
                if (record.minimized) panel.dataset.minimized = 'true';
                else delete panel.dataset.minimized;
                minimizeBtn.setAttribute('aria-pressed', String(record.minimized));
                decorateIconButton(
                    document,
                    minimizeBtn,
                    record.minimized ? 'maximize' : 'minus',
                    record.minimized ? 'Expand companion controls' : 'Minimize to compact view'
                );
                if (stageEl)
                    stageEl.title = record.minimized ? 'Click to expand · drag to move · corner to resize' : '';
                tamaBehaviors?.sync();
                player?.redraw();
            };
            const minimizeBtn = decorateIconButton(
                document,
                button('', e => {
                    e.stopPropagation();
                    setMinimized(!record.minimized);
                }, 'minimize'),
                'minus',
                'Minimize to compact view'
            );
            const closeBtn = decorateIconButton(document, button('', () => close(true), 'close'), 'x', 'Close panel');
            const hActions = el('div', undefined, 'lpc-header-actions');
            hActions.append(dock.wrap, minimizeBtn, closeBtn);
            h.append(hLead, hActions);
            status = el('p', undefined, 'lpc-status');
            status.setAttribute('role', 'status');
            status.dataset.control = 'status';
            const stageCard = el('div', undefined, 'lpc-stage-card');
            const stageEl = el('div', undefined, 'lpc-stage lpc-source-stage'),
                canvas = el('canvas');
            canvas.dataset.control = 'character';
            canvas.setAttribute('aria-label', 'Current companion');
            stageEl.onclick = e => {
                if ((record?.minimized || panel?.dataset.minimized === 'true') && !tamaBehaviors?.shouldSuppressStageClick?.()
                    && !e.target.closest('button,[data-control=tama-resize]')) setMinimized(false);
            };
            if (quiet && record.minimized === undefined && autoMinimizeDesktop && !managed && (window.visualViewport?.width
                ?? window.innerWidth) > 700) record.minimized = true;
            setMinimized(Boolean(record.minimized));
            const stageCaption = el('span', 'Plain stage · visual backdrop', 'lpc-stage-caption');
            stageCaption.prepend(createIcon(document, 'trees'));
            presence = createPresence({
                document,
                onDismiss: () => {
                    onSpeech(null);
                    panel?.querySelector('[data-control=close]')?.focus();
                }
            });
            stageEl.append(stageCaption, presence.mood, canvas);
            const panelToolbar = el('div', undefined, 'lpc-stage-footer lpc-panel-toolbar');
            const stageMeta = el('div', undefined, 'lpc-stage-meta'),
                stageTitleRow = el('div', undefined, 'lpc-stage-title-row');
            outfitHeading = el('h3', 'Outfit', 'lpc-outfit-name');
            activityReadout = el('p', 'Activity · Idle', 'lpc-activity');
            stageTitleRow.append(createIcon(document, 'star', 'lpc-svg-icon lpc-stage-star'), outfitHeading);
            stageMeta.append(stageTitleRow, activityReadout);
            const pause = decorateButton(
                document,
                button(
                    record.paused ? 'Resume' : 'Pause',
                    () => {
                        record.paused = !record.paused;
                        player.pause(record.paused);
                        onPause(record.paused);
                        decorateButton(document, pause, record.paused ? 'play' : 'pause', record.paused ? 'Resume'
                            : 'Pause');
                        pause.setAttribute('aria-pressed', String(record.paused));
                    },
                    'pause'
                ),
                record.paused ? 'play' : 'pause'
            );
            pause.setAttribute('aria-pressed', String(Boolean(record.paused)));
            const editBtn = decorateButton(
                document,
                button('Edit', () => void onSourceStudio(record.definition, record.presentation), 'edit'),
                'sliders'
            );
            editBtn.title = 'Edit character in Catalog Studio';
            editBtn.setAttribute('aria-label', 'Edit character');
            const stageTransport = el('div', undefined, 'lpc-stage-transport');
            stageTransport.append(pause, editBtn);
            panelToolbar.append(stageMeta, stageTransport);
            stageCard.append(stageEl, panelToolbar);
            controls = el('div', undefined, 'lpc-controls');
            panel.append(h, stageCard, controls, status);
            sourceModels = createSourceModelContracts(runtime);
            renderer = createSourceRenderer({ runtime, document, getEmbeddedAssets: embedded });
            player = createPlayer(
                canvas,
                stageEl,
                window,
                { placement: () => {
                    const s = record.presentation.scene;
                    if (!record?.minimized && panel?.dataset.minimized !== 'true') return s;
                    const h = stageEl?.offsetHeight || 176;
                    return h > 236 ? { ...s, scale: (s.scale ?? 1) * (h / 236) } : s;
                }
                }
            );
            stage = createStage({ document, window, baseUrl, element: stageEl, getEmbeddedAssets: embedded });
            outfit = select('Outfit', [], 'outfit');
            facing = select(
                'Facing',
                [
                    ['north', 'Back (north)'],
                    ['west', 'Left (west)'],
                    ['south', 'Front (south)'],
                    ['east', 'Right (east)']
                ],
                'facing'
            );
            activity = select(
                'Activity',
                [
                    ['none', 'Saved held pose'],
                    ['idle', 'Standing idle'],
                    ['walk', 'Walking'],
                    ['run', 'Running']
                ],
                'activity'
            );
            background = select('Backdrop', BACKGROUNDS, 'scene-background');
            light = select('Background light', LIGHTS, 'scene-light');
            cue = select(
                'Brief source action',
                runtime.catalog.actionIds().map(s => [s, formatSourceActionLabel(s)]),
                'source-cue'
            );
            pose = select(
                'Held pose',
                runtime.catalog.actionIds().map(s => [s, formatSourceActionLabel(s)]),
                'source-held-pose'
            );
            const frameLabel = el('label', undefined, 'lpc-field');
            poseFrame = el('input');
            poseFrame.type = 'number';
            poseFrame.min = 0;
            poseFrame.max = 63;
            poseFrame.dataset.control = 'source-held-frame';
            frameLabel.append(el('span', 'Pose frame (from 0)'), poseFrame);
            pose.input.onchange = poseFrame.onchange = () => void patch({ playback: {
                mode: 'hold',
                actionId: pose.input.value,
                frame: Number(poseFrame.value)
            } });
            const mood = select('Mood / expression', MOODS.map(id => [id, moodLabel(id)]), 'mood');
            mood.input.value = record.presentation.moodId ?? 'none';
            mood.input.onchange = () => void patch({ moodId: mood.input.value });
            const quickPosesWrap = el('div', undefined, 'lpc-studio-pose-presets');
            quickPosesWrap.dataset.control = 'source-panel-pose-presets';
            posePresetButtons = SOURCE_POSE_PRESETS.map(preset => {
                const b = button(
                    preset.label,
                    () => {
                        if (preset.loop !== 'none')
                            void patch({ playback: { mode: 'loop', actionId: preset.loop } });
                        else
                            void patch({ playback: { mode: 'hold', actionId: preset.actionId, frame: preset.frame } });
                    },
                    `source-panel-pose-${preset.id}`
                );
                b.className = 'lpc-studio-pose-preset-btn';
                quickPosesWrap.append(b);
                return [preset, b];
            });
            const appearanceGroup = createControlGroup(document, {
                icon: 'shirt',
                title: 'Appearance & Pose',
                rightNode: el('p', 'Saved chat appearance', 'lpc-note lpc-group-note')
            });
            const presentationForUpdatedOutfit = nextDef => {
                try {
                    return runtime.state.validatePresentation(nextDef, record.presentation, {});
                } catch {
                    const updatedOutfit = nextDef.outfits.find(o => o.id === record.presentation.outfitId) ?? nextDef.outfits[0];
                    return {
                        ...record.presentation,
                        outfitId: updatedOutfit.id,
                        playback: { mode: 'hold', ...updatedOutfit.rest },
                    };
                }
            };
            liveClosetBar = createLiveClosetBar({
                document,
                window,
                catalog: runtime.catalog,
                getDefinition: () => record?.definition,
                getOutfitId: () => record?.presentation?.outfitId,
                onToggleEntry: entry => {
                    if (busy || !record?.definition) return;
                    if (isGenerating()) {
                        status.textContent = 'Wait for generation to finish.';
                        return;
                    }
                    try {
                        const nextDef = toggleClosetLayer(
                            record.definition,
                            record.presentation.outfitId,
                            entry,
                            runtime.catalog,
                            window.localStorage
                        );
                        void render({ definition: nextDef, presentation: presentationForUpdatedOutfit(nextDef) });
                    } catch (e) {
                        status.textContent = e.message;
                    }
                },
                onUnequipSlot: slot => {
                    if (busy || !record?.definition) return;
                    if (isGenerating()) {
                        status.textContent = 'Wait for generation to finish.';
                        return;
                    }
                    try {
                        const nextDef = unequipOutfitSlot(
                            record.definition,
                            record.presentation.outfitId,
                            slot,
                            runtime.catalog,
                            window.localStorage
                        );
                        void render({ definition: nextDef, presentation: presentationForUpdatedOutfit(nextDef) });
                    } catch (e) {
                        status.textContent = e.message;
                    }
                },
                onSaveAsOutfit: () => {
                    if (busy || !record?.definition) return;
                    if (isGenerating()) {
                        status.textContent = 'Wait for generation to finish.';
                        return;
                    }
                    try {
                        const { definition: nextDef, outfitId: newId } = saveWornAsOutfit(record.definition, record.presentation.outfitId,
                            '', runtime.catalog);
                        void render({
                            definition: nextDef,
                            presentation: { ...record.presentation, outfitId: newId }
                        });
                    } catch (e) {
                        status.textContent = e.message;
                    }
                },
            });
            const poseGrid = el('div', undefined, 'lpc-field-grid');
            poseGrid.append(activity.wrap, facing.wrap, pose.wrap, frameLabel);
            appearanceGroup.element.append(outfit.wrap, liveClosetBar.element, quickPosesWrap, poseGrid, mood.wrap);
            sourceCapBadge = el('span', 'All ready', 'lpc-badge');
            const actionsGroup = createControlGroup(document, { icon: 'wand', title: 'Actions & Sequences', rightNode: sourceCapBadge });
            const quickActions = el('div', undefined, 'lpc-actions');
            quickButtons = [
                ['spellcast', 'Cast gesture'],
                ['jump', 'Jump'],
                ['emote', 'Expressive'],
                ['watering', 'Watering'],
                ['thrust', 'Thrust'],
                ['slash', 'Slash'],
                ['shoot', 'Shoot'],
                ['hurt', 'Hurt']
            ].map(([id, text]) => {
                const b = decorateButton(
                    document,
                    button(text, () => void play([id]), 'quick-' +id),
                    ACTION_ICONS[id] ?? 'wand'
                );
                b.dataset.quickAction = id;
                return b;
            });
            quickActions.append(...quickButtons);
            sourceBlocker = createBlockerBanner(document);
            const cueWell = el('div', undefined, 'lpc-recessed-well');
            const cueBtns = el('div', undefined, 'lpc-sequence-buttons');
            cueBtns.append(
                decorateButton(
                    document,
                    button('Play once', () => void play([cue.input.value]), 'source-play'),
                    'play'
                ),
                decorateButton(
                    document,
                    button(
                        'Add sequence step',
                        () => {
                            if (program.length === 4) {
                                status.textContent = 'A sequence allows at most four steps.';
                                return;
                            }
                            program.push(cue.input.value);
                            status.textContent = program.join(' → ');
                        },
                        'source-add-step'
                    ),
                    'plus'
                ),
                decorateButton(document, button('Play sequence', () => void play(program), 'source-play-sequence'),
                    'play'),
                decorateButton(
                    document,
                    button(
                        'Clear steps',
                        () => {
                            program = [];
                            status.textContent = 'Sequence cleared.';
                        },
                        'source-clear'
                    ),
                    'trash'
                ),
                (sequenceReplay = decorateButton(document, button('Replay', () => replay && void play(replay), 'replay'),
                    'rotate')),
                (sequenceStop = decorateButton(
                    document,
                    button(
                        'Stop cue',
                        () => {
                            modelControl?.cancel();
                            epoch++;
                            player.cancel();
                            onStopSequence();
                            resetProgramView();
                            status.textContent = 'Returned to saved presentation.';
                            updateProgramControls();
                        },
                        'stop'
                    ),
                    'stop'
                ))
            );
            cueWell.append(cue.wrap, cueBtns);
            repertoireCustomizer = createRepertoireCustomizer({
                document,
                window,
                getDefinition: () => record?.definition,
                getOutfitId: () => record?.presentation?.outfitId,
                onWrite: next => {
                    if (busy || !record?.definition) return;
                    if (isGenerating()) {
                        status.textContent = 'Wait for generation to finish.';
                        sync();
                        return;
                    }
                    void render({
                        definition: applyRepertoireToDefinition(record.definition, next),
                        presentation: record.presentation
                    });
                },
                onChange: () => {
                    updateProgramControls();
                    modelControl?.refresh();
                },
            });
            actionsGroup.element.append(quickActions, sourceBlocker.element, cueWell, repertoireCustomizer.element);
            const stageGroup = createControlGroup(document, { icon: 'trees', title: 'Stage, Lighting & Placement' });
            const stageGrid = el('div', undefined, 'lpc-field-grid');
            stageGrid.append(background.wrap, light.wrap);
            placement = sourcePlacementControls({
                document,
                initial: record.presentation.scene,
                changed: scene => void patch({ scene })
            });
            const layout = el('details');
            layout.append(el('summary', 'Stage placement'), placement.element);
            const scenes = select('Shared scene', PARTY_SCENES, 'party-membership');
            scenes.input.value = record.presentation.partySceneId ?? 'together';
            scenes.input.onchange = () => void patch({ partySceneId: scenes.input.value });
            stageGroup.element.append(stageGrid, scenes.wrap, layout);
            controls.append(appearanceGroup.element, actionsGroup.element, stageGroup.element);
            const packageGroup = createControlGroup(document, { icon: 'download', title: 'Packages & Attribution' });
            const packageBtns = el('div', undefined, 'lpc-editor-launches');
            packageBtns.append(decorateButton(
                document,
                button('Export source configuration', () => void exportPackage(false), 'source-export-config'),
                'download'
            ), decorateButton(
                document,
                button('Export complete source package', () => void exportPackage(true), 'source-export-complete'),
                'download'
            ));
            packageGroup.element.append(packageBtns);
            controls.append(packageGroup.element);
            setupModelControls();
            panel.append(el(
                'p',
                'Source actions are visual only. Packages include verified per-path credits and full notices; complete packages also include original artwork.',
                'lpc-note'
            ));
            outfit.input.onchange = () => void patch({ outfitId: outfit.input.value });
            facing.input.onchange = () => void patch({ facing: facing.input.value });
            activity.input.onchange = () => {
                const o = record.definition.outfits.find(o => o.id === record.presentation.outfitId);
                void patch({ playback: activity.input.value === 'none' ? { mode: 'hold', ...o.rest } : { mode: 'loop',
                actionId: activity.input.value } });
            };
            background.input.onchange = light.input.onchange = () => void patch({ scene: {
                ...record.presentation.scene,
                backgroundId: background.input.value,
                lightId: light.input.value
            } });
            (managed ?? (record.dock === 'inline' ? root : document.body)).append(panel);
            tamaBehaviors = attachTamagotchiBehaviors({
                document,
                window,
                panel,
                stageEl,
                isMinimized: () => Boolean(record?.minimized || panel?.dataset.minimized === 'true'),
                isManaged: () => Boolean(managed),
                onRedraw: () => player?.redraw(),
                interactive: tamagotchiInteractive
            });
            disconnect = observeSourceCanvas(window, canvas, stageEl, player);
            sync();
            onPanelOpened({ automatic: quiet });
            await render({
                definition: record.definition,
                presentation: record.presentation,
                mode: 'restore'
            });
        } catch (e) {
            if (!disposed) {
                error.textContent = e.message;
                if (panel) close();
            }
        }
    }
    async function refresh(loaded) {
        const release = beginReconciliation();
        try {
            cancelActions();
            await running;
            record = loaded ?? await sessions.load(active);
            if (disposed) return;
            if (panel && record.minimized === undefined) record.minimized = panel.dataset.minimized === 'true';
            fork.hidden = rename.hidden = !record.conflict;
            if (record.conflict) {
                cancelActions();
                error.textContent = record.conflict;
                return;
            }
            error.textContent = '';
            if (panel)
                await render({
                    definition: record.definition,
                    presentation: record.presentation,
                    mode: 'restore'
                });
            else if (canAutoOpen()) await open(true);
        } catch (e) {
            if (!disposed) error.textContent = e.message;
        } finally {
            release();
        }
    }
    void refresh(initialRecord);
    return {
        refresh,
        beginReconciliation,
        open: () => open(),
        openQuiet: () => open(true),
        hide: close,
        isOpen: () => Boolean(panel),
        cancelActions,
        clearSpeech() {
            presence?.clearSpeech();
            onSpeech(null);
        },
        endInspectorCue() {
            player?.cancel();
        },
        setManagedDock(node) {
            managed = node;
            const fallbackDock = preferences?.get().dock ?? record?.dock ?? sessions.get(active)?.dock ?? 'left';
            if (record) record.dock = fallbackDock;
            if (panel) {
                panel.dataset.dock = node ? 'inline' : fallbackDock;
                (node ?? (fallbackDock === 'inline' ? root : document.body)).append(panel);
                const dock = panel.querySelector('[data-control=dock]');
                if (dock) {
                    dock.value = fallbackDock;
                    dock.disabled = Boolean(node);
                    const label = dock.closest('label');
                    if (label) label.hidden = Boolean(node);
                }
                tamaBehaviors?.sync();
                player?.redraw();
            }
        },
        setPartyScene: id => patch({ partySceneId: id }),
        enableModel,
        remove() {
            disposed = true;
            unsubscribePreferences?.();
            close();
            for (const url of urls) window.URL.revokeObjectURL(url);
            urls.clear();
            root.remove();
        }
    };
}
