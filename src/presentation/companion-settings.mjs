import {
    CHANGELOG_ENTRIES,
    EXTENSION_DISPLAY_NAME,
    EXTENSION_VERSION,
} from '../catalog/release-info.mjs';
import { createSettingsDrawer } from './settings-drawer.mjs';
import {
    createAccordion,
    createButton,
    createSectionHeader,
    createToggleRow,
    decorateButton,
} from './molecules.mjs';

function fallbackDiagnostics() {
    return {
        size: () => 0,
        clear() {},
        subscribe: () => () => {},
        buildReport: () => ({
            schemaVersion: 1,
            kind: 'lpc-companion-diagnostic-log',
            extension: { name: EXTENSION_DISPLAY_NAME, version: EXTENSION_VERSION },
            generatedAt: new Date().toISOString(),
            privacy: 'Sanitized technical diagnostics only; excludes chat messages, character prose, and credentials.',
            snapshot: null,
            entries: [],
        }),
        formatText: () => [
            `${EXTENSION_DISPLAY_NAME} v${EXTENSION_VERSION} — Diagnostic Log`,
            '------------------------------------------------------------------------',
            '(No diagnostic events recorded.)',
        ].join('\n'),
    };
}

async function copyTextWithFallback(document, text) {
    const clipboard = document.defaultView?.navigator?.clipboard ?? globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText === 'function') {
        try {
            await clipboard.writeText(text);
            return true;
        } catch { /* Plain-HTTP LAN hosts fall back to selection copy below. */ }
    }
    if (!document.body || typeof document.execCommand !== 'function') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.tabIndex = -1;
    textarea.setAttribute('aria-hidden', 'true');
    textarea.className = 'lpc-offscreen-copy';
    document.body.append(textarea);
    try {
        textarea.select?.();
        textarea.setSelectionRange?.(0, text.length);
        return Boolean(document.execCommand('copy'));
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
}

function appendBulletCopy(document, li, text) {
    const splitAt = text.indexOf(': ');
    if (splitAt > 0 && splitAt <= 48) {
        const lead = document.createElement('strong');
        lead.textContent = `${text.slice(0, splitAt + 1)} `;
        li.append(lead, document.createTextNode(text.slice(splitAt + 2)));
        return;
    }
    li.textContent = text;
}

/** Global switches survive chat/workspace teardown while the extension is enabled. */
export function createCompanionSettings({ document, preferences, diagnostics = null }) {
    const container = document.querySelector('#extensions_settings');
    if (!container) return null;
    const logSource = diagnostics ?? fallbackDiagnostics();
    const drawer = createSettingsDrawer({ document, container });
    const section = document.createElement('section');
    section.className = 'lpc-companion lpc-settings-card lpc-preferences';
    const versionBadgeText = `v${EXTENSION_VERSION}`;
    const header = createSectionHeader(document, {
        icon: 'sliders',
        title: 'Global controls',
        subtitle: 'Master switch, model tool gate & prompt sharing',
        badge: versionBadgeText,
        badgeTone: 'neutral',
    });
    if (header.badge) header.badge.dataset.control = 'extension-version';
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
    section.append(header.element, list, status, note);
    drawer.content.append(section);

    const content = document.createElement('div');
    drawer.content.append(content);

    const aboutCard = document.createElement('section');
    aboutCard.className = 'lpc-companion lpc-settings-card lpc-diagnostics-card';
    const aboutHeader = createSectionHeader(document, {
        icon: 'file-text',
        title: 'About & diagnostics',
        subtitle: 'Installed version, release notes & privacy-safe debug log',
        badge: versionBadgeText,
        badgeTone: 'accent',
    });
    if (aboutHeader.badge) aboutHeader.badge.dataset.control = 'about-version';

    const changelogWrap = document.createElement('div');
    changelogWrap.className = 'lpc-changelog-list';
    for (const entry of CHANGELOG_ENTRIES) {
        const article = document.createElement('div');
        article.className = 'lpc-changelog-entry';
        const head = document.createElement('div');
        head.className = 'lpc-changelog-entry-head';
        const ver = document.createElement('strong');
        ver.textContent = `Version ${entry.version}`;
        head.append(ver);
        if (entry.date) {
            const dateBadge = document.createElement('span');
            dateBadge.className = 'lpc-badge';
            dateBadge.dataset.tone = 'neutral';
            dateBadge.textContent = entry.date;
            head.append(dateBadge);
        }
        article.append(head);
        for (const group of entry.groups) {
            if (group.heading) {
                const groupTitle = document.createElement('p');
                groupTitle.className = 'lpc-changelog-group-title';
                groupTitle.textContent = group.heading;
                article.append(groupTitle);
            }
            const ul = document.createElement('ul');
            ul.className = 'lpc-changelog-items';
            ul.setAttribute('role', 'list');
            for (const item of group.items) {
                const li = document.createElement('li');
                appendBulletCopy(document, li, item);
                ul.append(li);
            }
            article.append(ul);
        }
        changelogWrap.append(article);
    }
    const changelogAcc = createAccordion(document, {
        title: "What's new",
        icon: 'sparkles',
        badge: EXTENSION_VERSION,
        open: false,
        control: 'changelog-drawer',
        children: [changelogWrap],
    });

    const debugIntro = document.createElement('p');
    debugIntro.className = 'lpc-note';
    debugIntro.textContent = 'Records extension lifecycle, runtime, and tool events in memory only. Chat messages, character prose, and credentials are never included.';

    const debugActions = document.createElement('div');
    debugActions.className = 'lpc-debug-log-actions';

    const debugFeedback = document.createElement('p');
    debugFeedback.className = 'lpc-note lpc-status-banner lpc-debug-log-feedback';
    debugFeedback.dataset.control = 'debug-log-status';
    debugFeedback.setAttribute('role', 'status');

    let feedbackTimer = null;
    let copyIconTimer = null;
    let lastAnnounced = '';
    const revokeTimers = new Set();

    function setDebugFeedback(message, tone = 'active') {
        if (feedbackTimer) clearTimeout(feedbackTimer);
        let announced = message;
        if (announced && announced === lastAnnounced) announced = `${announced}\u00A0`;
        lastAnnounced = announced;
        debugFeedback.dataset.tone = tone;
        debugFeedback.textContent = announced;
        if (announced) {
            feedbackTimer = setTimeout(() => {
                debugFeedback.textContent = '';
                feedbackTimer = null;
            }, 2200);
        }
    }

    const copyBtn = createButton(document, {
        label: 'Copy log',
        icon: 'copy',
        variant: 'secondary',
        size: 'sm',
        control: 'debug-log-copy',
        onClick: async () => {
            const ok = await copyTextWithFallback(document, logSource.formatText());
            if (copyIconTimer) clearTimeout(copyIconTimer);
            if (ok) {
                decorateButton(document, copyBtn, 'check', 'Copied');
                setDebugFeedback('Copied diagnostic log to clipboard.', 'active');
                copyIconTimer = setTimeout(() => {
                    decorateButton(document, copyBtn, 'copy', 'Copy log');
                    copyIconTimer = null;
                }, 2000);
            } else {
                setDebugFeedback('Clipboard access unavailable; use Download JSON instead.', 'muted');
            }
        },
    });

    const downloadBtn = createButton(document, {
        label: 'Download JSON',
        icon: 'download',
        variant: 'secondary',
        size: 'sm',
        control: 'debug-log-download',
        onClick: () => {
            const urlApi = document.defaultView?.URL ?? globalThis.URL;
            const BlobCtor = document.defaultView?.Blob ?? globalThis.Blob;
            if (typeof BlobCtor !== 'function' || typeof urlApi?.createObjectURL !== 'function') {
                setDebugFeedback('File download is unavailable in this environment.', 'muted');
                return;
            }
            const payload = JSON.stringify(logSource.buildReport(), null, 2);
            const blob = new BlobCtor([payload], { type: 'application/json' });
            const url = urlApi.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'lpc-companion-debug-log.json';
            link.hidden = true;
            (document.body ?? aboutCard).append(link);
            link.click();
            link.remove();
            const timer = setTimeout(() => {
                revokeTimers.delete(timer);
                urlApi.revokeObjectURL?.(url);
            }, 1000);
            revokeTimers.add(timer);
            setDebugFeedback('Downloaded lpc-companion-debug-log.json.', 'active');
        },
    });

    const clearBtn = createButton(document, {
        label: 'Clear',
        icon: 'trash',
        variant: 'ghost',
        size: 'sm',
        control: 'debug-log-clear',
        onClick: () => {
            logSource.clear();
            setDebugFeedback('Cleared diagnostic log.', 'muted');
        },
    });

    debugActions.append(copyBtn, downloadBtn, clearBtn);

    const debugPre = document.createElement('pre');
    debugPre.className = 'lpc-debug-log-view';
    debugPre.setAttribute('role', 'region');
    debugPre.setAttribute('aria-label', 'LPC Companion diagnostic log');
    debugPre.tabIndex = 0;
    const debugCode = document.createElement('code');
    debugCode.dataset.control = 'debug-log-output';
    debugPre.append(debugCode);

    const debugAcc = createAccordion(document, {
        title: 'Debug log',
        icon: 'terminal',
        badge: String(logSource.size()),
        open: false,
        control: 'debug-log-drawer',
        children: [debugIntro, debugActions, debugFeedback, debugPre],
    });
    if (debugAcc.badge) debugAcc.badge.dataset.control = 'debug-log-count';

    function renderDebugLog() {
        if (debugAcc.badge) debugAcc.badge.textContent = String(logSource.size());
        if (debugAcc.element.open || !debugCode.textContent) {
            debugCode.textContent = logSource.formatText();
        }
    }
    debugAcc.element.addEventListener('toggle', renderDebugLog);
    const unsubscribeDiagnostics = logSource.subscribe(renderDebugLog);
    renderDebugLog();

    aboutCard.append(aboutHeader.element, changelogAcc.element, debugAcc.element);
    drawer.content.append(aboutCard);

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
    return {
        ...drawer,
        content,
        remove() {
            unsubscribe();
            unsubscribeDiagnostics();
            if (feedbackTimer) clearTimeout(feedbackTimer);
            if (copyIconTimer) clearTimeout(copyIconTimer);
            for (const timer of revokeTimers) clearTimeout(timer);
            revokeTimers.clear();
            drawer.remove();
        },
    };
}
