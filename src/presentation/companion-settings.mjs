import { createSettingsDrawer } from './settings-drawer.mjs';
import { createSectionHeader, createToggleRow } from './molecules.mjs';

/** Global switches survive chat/workspace teardown while the extension is enabled. */
export function createCompanionSettings({ document, preferences }) {
    const container = document.querySelector('#extensions_settings');
    if (!container) return null;
    const drawer = createSettingsDrawer({ document, container });
    const section = document.createElement('section');
    section.className = 'lpc-companion lpc-settings-card lpc-preferences';
    const header = createSectionHeader(document, {
        icon: 'sliders',
        title: 'Global controls',
        subtitle: 'Master switch, model tool gate & prompt sharing',
    });
    const list = document.createElement('div');
    list.className = 'lpc-toggle-list';
    const inputs = new Map();
    for (const [field, control, title, hint, icon] of [
        ['enabled', 'companion-enabled', 'Enable LPC Companion', 'Mount companion panels and floating launcher', 'sparkles'],
        ['toolCalling', 'tool-calling-enabled', 'Enable Tool Calling', 'Allow AI models to update clothing, pose, mood & stage', 'bot'],
        ['shareContext', 'share-context-enabled', 'Share Appearance Context', 'Include live outfit and pose in prompts', 'layers'],
    ]) {
        const { wrap, input } = createToggleRow(document, { control, title, hint, icon });
        input.onchange = () => preferences.set({ [field]: input.checked });
        list.append(wrap);
        inputs.set(field, input);
    }
    const scopeField = document.createElement('label');
    scopeField.className = 'lpc-field';
    const scopeLabel = document.createElement('span');
    scopeLabel.textContent = 'AI tool calling scope';
    const scopeSelect = document.createElement('select');
    scopeSelect.dataset.control = 'tool-calling-scope';
    for (const [id, text] of [
        ['off', 'Off (manual controls only)'],
        ['character', 'Character only (outfits, pose, actions & mood)'],
        ['scene', 'Character + stage backdrop & lighting'],
    ]) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = text;
        scopeSelect.append(option);
    }
    scopeSelect.onchange = () => preferences.set({ toolScope: scopeSelect.value });
    scopeField.append(scopeLabel, scopeSelect);
    list.append(scopeField);
    const status = document.createElement('p');
    status.className = 'lpc-note lpc-status-banner'; status.dataset.control = 'preferences-status';
    status.setAttribute('role', 'status');
    const note = document.createElement('p');
    note.className = 'lpc-note';
    note.textContent = 'Global controls are saved across reloads and chats. Character-only scope omits stage backdrops from the AI prompt.';
    section.append(header.element, list, status, note); drawer.content.append(section);
    const content = document.createElement('div');
    drawer.content.append(content);
    function update() {
        const state = preferences.get();
        for (const [field, input] of inputs) { input.checked = state[field]; input.disabled = field !== 'enabled' && !state.enabled; }
        scopeSelect.value = state.toolScope ?? (state.toolCalling ? 'character' : 'off');
        scopeSelect.disabled = !state.enabled;
        status.dataset.tone = !state.enabled ? 'muted' : state.toolCalling ? 'active' : 'ready';
        status.textContent = !state.enabled ? 'LPC Companion is disabled. Saved companions are retained.'
            : state.toolCalling ? `Tool calling (${scopeSelect.value === 'scene' ? 'character + stage' : 'character only'}) is permitted for selected companions. Appearance sharing is ${state.shareContext ? 'on' : 'off'}.`
            : state.shareContext ? 'Manual controls are available. Appearance sharing is read-only while tool calling is off.'
            : 'Manual controls are available. No LPC appearance summary is added to the model prompt.';
    }
    const unsubscribe = preferences.subscribe(update); update();
    return { ...drawer, content, remove() { unsubscribe(); drawer.remove(); } };
}
