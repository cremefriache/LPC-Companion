import { createSettingsDrawer } from './settings-drawer.mjs';
import { createSectionHeader } from './molecules.mjs';

/** Keep the extension discoverable without reading or initializing companion state. */
export function createNoChatSettings({ document, baseUrl, settingsContainer, disabled = false }) {
    const container = settingsContainer ?? document.querySelector('#extensions_settings');
    if (!container) return null;
    const drawer = settingsContainer ? null : createSettingsDrawer({ document, container });
    const section = document.createElement('section');
    section.id = 'lpc-companion-unavailable';
    section.className = 'lpc-companion lpc-settings-card';
    const header = createSectionHeader(document, {
        icon: 'lock',
        title: 'Companion controls',
        subtitle: disabled ? 'Global switch is currently off' : 'Waiting for an active character or group chat',
    });
    const status = document.createElement('p');
    status.id = 'lpc-companion-no-chat-status';
    status.className = 'lpc-note lpc-status-banner';
    status.dataset.control = 'no-chat-status';
    status.dataset.tone = 'muted';
    status.setAttribute('role', 'status');
    status.textContent = disabled ? 'Enable LPC Companion above to use companion controls.'
        : 'Select a character and open a chat to use companion controls. Group chats are also supported.';
    const actions = document.createElement('div');
    actions.className = 'lpc-settings-primary-actions lpc-settings-actions';
    for (const [control, label, wide] of [
        ['open', 'Open companion', true],
        ['source-studio', 'Catalog studio', false],
        ['import-generator', 'Import JSON', false],
    ]) {
        const button = document.createElement('button');
        button.type = 'button';
        if (wide) button.className = 'lpc-primary-wide';
        button.dataset.control = control;
        button.textContent = label;
        button.disabled = true;
        button.setAttribute('aria-describedby', status.id);
        actions.append(button);
    }
    const credits = document.createElement('a');
    credits.href = new URL('assets/lpc/credits.html', baseUrl).href;
    credits.target = '_blank';
    credits.rel = 'noopener';
    credits.textContent = 'Artwork & code credits';
    section.append(header.element, status, actions, credits);
    (drawer?.content ?? container).append(section);
    return { remove() { section.remove(); drawer?.remove(); } };
}
