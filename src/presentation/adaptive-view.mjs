import { createCompanionView as createLegacyView } from './companion-view.mjs';
import { modelContextData } from '../state/model-contract.mjs';

/** One live inspector, selected from replayed state rather than card defaults. */
export function createAdaptiveView(options) {
    const { document, window, sessions, active, viewId = 'lpc-companion', uiConfig = {} } = options;
    const studioDefault = (uiConfig.defaultSetupMode ?? 'studio') === 'studio',
        studioOwnsPanel = uiConfig.studioOwnsPanelState !== false;
    let inner = null,
        format = null,
        target = null,
        disposed = false,
        epoch = 0,
        switching = false,
        studio = null,
        studioOpening = false,
        backupUrl = null;
    const contextOwner = viewId +'-accepted-context';
    let contextRegistered = false;
    const clearContext = () => {
        if (contextRegistered) {
            contextRegistered = false;
            options.toolHub.remove(contextOwner);
        }
    };
    function describeAvailable() {
        if (disposed || !options.preferences?.get().enabled) return false;
        const record = sessions.get(active);
        if (!record?.binding || !record.definition || record.conflict) return false;
        try {
            const resolve = options.modelOptions?.resolveContext ?? options.resolveContext,
                key = options.modelOptions?.contextKey ?? options.contextKey;
            if (!resolve || !key) return false;
            const current = resolve(window.SillyTavern.getContext());
            return Boolean(current && key(current) === key(active));
        } catch {
            return false;
        }
    }
    async function registerContext(next, token) {
        if (!options.preferences || !options.toolHub) return;
        let contextDataFor = options.modelOptions?.contextDataFor,
            activityFor = options.modelOptions?.activityFor;
        if (next === 'source') {
            const runtime = await options.fullRuntime.get();
            if (disposed || token !== epoch) return;
            const describe = selection => ({
                ...structuredClone(selection),
                name: runtime.catalog.item(selection.itemId).name
            });
            contextDataFor = (definition, presentation) => definition.schemaVersion !== 2 ? modelContextData(definition,
                presentation) : ({
                format: 'lpc-source-v1',
                identity: {
                    bodyType: definition.identity.bodyType,
                    selections: Object.fromEntries(Object.entries(definition.identity.selections).map(([slot, value]) => [slot,
                        describe(value)]))
                },
                currentParts: Object.fromEntries(Object.entries(definition.outfits.find(outfit => outfit.id === presentation.outfitId)
                    .selections).map(([slot, value]) => [slot, describe(value)]))
            });
            activityFor = presentation => presentation.playback?.actionId ?? presentation.activityId ?? presentation.posture;
        }
        if (disposed || token !== epoch) return;
        options.toolHub.update(contextOwner, {
            label: options.title ?? 'Primary companion',
            record: () => sessions.get(active),
            available: () => false,
            describeAvailable: () => describeAvailable() && sessions.get(active)?.definition?.schemaVersion === (next === 'source'
                ? 2 : 1),
            state: () => null,
            contextDataFor,
            activityFor,
            explicit: options.modelOptions?.explicitTarget ?? false,
            defaultBindings: options.modelOptions?.defaultBindings ?? true
        });
        contextRegistered = true;
    }
    const wrapper = document.createElement('div');
    wrapper.id = viewId;
    const settings = options.settingsContainer ?? document.querySelector('#extensions_settings');
    if (viewId === 'lpc-companion') settings?.prepend(wrapper);
    else settings?.append(wrapper);
    const placeholder = document.createElement('section');
    placeholder.className = 'lpc-companion lpc-settings-card';
    placeholder.id = viewId +'-loading';
    const status = document.createElement('p');
    status.className = 'lpc-note lpc-status-banner';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading saved companion…';
    placeholder.append(status);
    wrapper.append(placeholder);
    const placeholderActions = document.createElement('div');
    placeholderActions.className = 'lpc-settings-primary-actions lpc-settings-actions';
    const launch = document.createElement('button');
    launch.type = 'button';
    launch.className = 'lpc-primary-wide';
    launch.dataset.control = 'open';
    launch.textContent = 'Open when ready';
    launch.onclick = () => {
        void ensure().then(view => view?.open());
    };
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Reload companion';
    retry.onclick = () => void refresh();
    const backup = document.createElement('button');
    backup.type = 'button';
    backup.textContent = 'Export recovery backup';
    backup.onclick = async () => {
        try {
            const value = await sessions.backup(active);
            if (disposed) return;
            if (backupUrl) window.URL.revokeObjectURL(backupUrl);
            backupUrl = window.URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = backupUrl;
            link.download = 'lpc-companion-backup.json';
            link.click();
        } catch (error) {
            if (!disposed) status.textContent = error.message;
        }
    };
    placeholderActions.append(launch, retry, backup);
    placeholder.append(placeholderActions);
    async function ensure(reload = false) {
        const token = ++epoch, release = reload ? inner?.beginReconciliation?.() : null;
        try {
            const record = await (reload || (!inner && options.freshRead) ? sessions.load(active) : sessions.create(active));
            if (disposed || token !== epoch) return null;
            const next = (record.definition ?? record.defaults ?? record.initial)?.schemaVersion === 2 ? 'source'
                : 'legacy';
            await registerContext(next, token);
            if (disposed || token !== epoch) return null;
            if (!inner || format !== next) {
                const wasOpen = inner?.isOpen();
                let factory = createLegacyView;
                if (next === 'source') factory = (await import ('./source-view.mjs')).createSourceView;
                if (disposed || token !== epoch) return null;
                switching = true;
                inner?.remove();
                switching = false;
                format = next;
                placeholder.id = viewId +'-loading';
                placeholder.remove();
                inner = factory({
                    ...options,
                    settingsContainer: wrapper,
                    settingsId: viewId +'-settings-card',
                    initialRecord: record,
                    onReload: refresh,
                    onSourceStudio: openStudio,
                    onPanelClosed() {
                        if (!switching) options.onPanelClosed?.();
                    }
                });
                if (target) inner?.setManagedDock(target);
                if (wasOpen) await inner?.openQuiet();
            } else if (reload) await inner.refresh(record);
            placeholder.remove();
            return inner;
        } catch (error) {
            if (!disposed && token === epoch) {
                clearContext();
                placeholder.hidden = false;
                if (!placeholder.isConnected) wrapper.append(placeholder);
                status.textContent = error.message;
                inner?.cancelActions();
            }
            return null;
        } finally {
            release?.();
        }
    }
    async function openStudio(seed, seedPresentation, scope, openImport = false) {
        if (disposed || studio || studioOpening) return;
        studioOpening = true;
        try {
            await sessions.whenIdle?.();
            if (disposed) return;
            const record = sessions.get(active);
            if (record?.conflict) throw Error(record.conflict);
            if (seed?.schemaVersion === 1 && scope === 'defaults' && record?.definition?.schemaVersion === 2) {
                await openCuratedDefaults(seed, scope);
                return;
            }
            const { createSourceStudio } = await import ('./source-studio.mjs');
            if (disposed) return;
            const resolvedSeed = seed?.schemaVersion === 2 ? seed : record?.definition?.schemaVersion === 2 ? record.definition
                : (record?.binding && studioDefault && (seed?.schemaVersion === 1 || record?.definition?.schemaVersion === 1))
                ? (seed ?? record.definition) : null;
            inner?.cancelActions();
            inner?.enableModel(false);
            const created = await createSourceStudio({
                ...options,
                getEmbeddedAssets: () => sessions.get(active)?.binding?.embeddedAssets ?? {},
                initialDefinition: resolvedSeed,
                initialPresentation: seedPresentation ?? record?.presentation,
                characterId: record?.definition?.characterId ?? record?.defaults?.characterId,
                hasDefaults: Boolean(record?.binding),
                initialScope: scope,
                openImport,
                onCancel() {
                    studio = null;
                    if (studioOwnsPanel && !inner?.isOpen()) options.onPanelClosed?.();
                },
                async onApply(candidate, current) {
                    const result = await sessions.commit(active, candidate, current);
                    if (disposed) return result;
                    studio?.remove();
                    studio = null;
                    await refresh();
                    await inner?.open();
                    return result;
                }
            });
            if (disposed) {
                created.remove();
                return;
            }
            studio = created;
            if (studioOwnsPanel) options.onPanelOpened?.({ automatic: false });
        } catch (error) {
            if (!disposed) {
                placeholder.hidden = false;
                if (!placeholder.isConnected) wrapper.append(placeholder);
                status.textContent = error.message;
            }
        } finally {
            studioOpening = false;
        }
    }
    async function openCuratedDefaults(seed, scope) {
        if (disposed) return;
        if (scope !== 'defaults') throw Error('Open the curated editor to edit this definition.');
        inner?.cancelActions();
        inner?.enableModel(false);
        // A different-format defaults editor must never impersonate the active chat snapshot.
        const projected = () => ({
            ...sessions.get(active),
            definition: seed,
            presentation: seed.startingPresentation,
            defaults: seed,
            paused: false,
            dock: options.preferences?.get().dock ?? sessions.get(active)?.dock ?? 'left'
        });
        const editorSessions = {
            get: projected,
            create: async () => projected(),
            load: async () => projected(),
            async commit(_active, candidate, current) {
                if (candidate.mode === 'restore' || candidate.mode === 'preview')
                    return { definition: candidate.definition, presentation: candidate.presentation };
                if (candidate.mode !== 'defaults') throw Error('This editor saves future defaults only.');
                return sessions.commit(active, candidate, current);
            }
        };
        const returnTarget = document.activeElement;
        const closeEditor = () => {
            const previous = studio;
            studio = null;
            previous?.remove();
            if (!disposed && returnTarget?.isConnected) returnTarget.focus();
        };
        const created = createLegacyView({
            ...options,
            preferences: undefined,
            sessions: editorSessions,
            initialRecord: projected(),
            settingsContainer: document.createElement('div'),
            viewId: viewId +'-defaults-editor',
            canAutoOpen: () => false,
            onSourceStudio: undefined,
            toolHub: { update() {}, remove() {}
            },
            onPresentation: () => {},
            preparePresentation: async () => null,
            onPause: () => {},
            onSpeech: () => {},
            onModelEnabled: () => {},
            onStopSequence: () => {},
            onSequence: () => false,
            onPanelOpened: () => {},
            onPanelClosed: closeEditor,
            async onEditorClosed({ saved }) {
                closeEditor();
                if (saved) await refresh();
            }
        });
        studio = created;
        try {
            await created.editDefinition(seed, 'defaults');
            if (disposed) closeEditor();
        } catch (error) {
            closeEditor();
            throw error;
        }
    }
    async function refresh() {
        await ensure(true);
    }
    void ensure();
    return {
        refresh,
        clearSpeech() {
            inner?.clearSpeech();
        },
        cancelActions() {
            inner?.cancelActions();
        },
        endInspectorCue() {
            inner?.endInspectorCue();
        },
        async open() {
            return inner ? inner.open() : (await ensure())?.open();
        },
        async openQuiet() {
            return inner ? inner.openQuiet() : (await ensure())?.openQuiet();
        },
        hide() {
            if (studio && studioOwnsPanel) {
                const prev = studio;
                studio = null;
                prev.remove();
                if (!inner?.isOpen()) options.onPanelClosed?.();
            }
            inner?.hide();
        },
        isOpen: () => Boolean(inner?.isOpen() || (studioOwnsPanel && (studio || studioOpening))),
        setManagedDock(node) {
            target = node;
            inner?.setManagedDock(target);
        },
        async setPartyScene(id) {
            return inner ? inner.setPartyScene(id) : (await ensure())?.setPartyScene(id);
        },
        enableModel: value => inner?.enableModel(value) ?? false,
        remove() {
            disposed = true;
            epoch++;
            clearContext();
            const previousStudio = studio;
            studio = null;
            previousStudio?.remove();
            switching = true;
            inner?.remove();
            if (backupUrl) window.URL.revokeObjectURL(backupUrl);
            placeholder.remove();
            wrapper.remove();
        }
    };
}
