import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebugLog, redactDiagnosticString, sanitizeDiagnosticValue } from '../src/adapter/debug-log.mjs';
import { createToolHub } from '../src/adapter/tool-hub.mjs';
import { createPreferences } from '../src/adapter/preferences.mjs';
import { createDefinition } from '../src/state/defaults.mjs';
import { EXTENSION_VERSION } from '../src/catalog/release-info.mjs';

test('createDebugLog enforces bounded FIFO capacity, monotonic sequences, clear, and subscriber safety', () => {
    let tick = 0;
    const log = createDebugLog({
        maxEntries: 3,
        now: () => `2026-11-10T21:00:0${tick++}.000Z`,
        getSnapshot: () => ({ fullLibraryLoaded: true, count: 2 }),
    });
    let notifications = 0;
    const unsubscribeBad = log.subscribe(() => { throw Error('subscriber failure'); });
    const unsubscribeGood = log.subscribe(() => { notifications++; });

    log.info('lifecycle', 'one', { step: 1 });
    log.warn('runtime', 'two', { step: 2 });
    log.error('model', 'three', { step: 3 });
    log.info('preferences', 'four', { step: 4 });

    assert.equal(log.size(), 3);
    assert.equal(notifications, 4);
    const entries = log.entries();
    assert.deepEqual(entries.map(e => e.seq), [2, 3, 4]);
    assert.deepEqual(entries.map(e => e.event), ['two', 'three', 'four']);

    const report = log.buildReport();
    assert.equal(report.kind, 'lpc-companion-diagnostic-log');
    assert.equal(report.extension.version, EXTENSION_VERSION);
    assert.deepEqual(report.snapshot, { fullLibraryLoaded: true, count: 2 });

    const formatted = log.formatText();
    assert.match(formatted, new RegExp(`v${EXTENSION_VERSION.replace(/\./g, '\\.')}`));
    assert.match(formatted, /WARN\s+runtime\s+two/);
    assert.match(formatted, /ERROR\s+model\s+three/);

    log.clear();
    assert.equal(log.size(), 0);
    assert.match(log.formatText(), /No diagnostic events recorded/);

    unsubscribeBad();
    unsubscribeGood();
    const prevNotifications = notifications;
    log.info('lifecycle', 'five');
    assert.equal(notifications, prevNotifications);
});

test('diagnostic sanitization strips chat prose, character card text, credentials, home paths, and LAN IPs', () => {
    const syntheticApiKey = ['sk', 'proj', 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4'].join('-');
    const syntheticPat = `ghp_${'Z'.repeat(24)}`;
    const syntheticHome = ['', 'home', 'tester', 'st-data', 'secret.json'].join('/');
    const syntheticLan = [192, 168, 4, 25].join('.');

    const redacted = redactDiagnosticString(`Failed at ${syntheticHome} via http://${syntheticLan}:8000 with ${syntheticApiKey} and ${syntheticPat}`);
    assert.equal(redacted.includes('tester'), false);
    assert.equal(redacted.includes(syntheticLan), false);
    assert.equal(redacted.includes('A1B2C3D4'), false);
    assert.equal(redacted.includes('ZZZZZZ'), false);
    assert.match(redacted, /\/home\/\[redacted\]/);
    assert.match(redacted, /\[lan-ip\]/);
    assert.match(redacted, /\[redacted-credential\]/);

    const sanitized = sanitizeDiagnosticValue({
        slot: 'primary',
        outfitId: 'everyday',
        mes: 'Private user roleplay message',
        content: 'Assistant narrative text',
        prompt: 'System prompt text',
        description: 'Character card description',
        first_mes: 'Character greeting',
        apiKey: syntheticApiKey,
        headers: { Authorization: `Bearer ${syntheticPat}` },
        nested: {
            ok: true,
            token: syntheticPat,
            deep: { deeper: 'clipped' },
        },
    });

    assert.deepEqual(sanitized, {
        slot: 'primary',
        outfitId: 'everyday',
        nested: {
            ok: true,
            deep: '[truncated]',
        },
    });
});

test('createToolHub reports registered tool syncs, refusals, and privacy-safe owner summaries', async () => {
    const events = [];
    const registered = new Map();
    const prefs = createPreferences({});
    prefs.set({ enabled: true, toolCalling: true, toolScope: 'character', shareContext: true });
    const context = {
        eventTypes: { CHAT_COMPLETION_PROMPT_READY: 'prompt_ready' },
        eventSource: { on() {}, removeListener() {} },
        registerFunctionTool(def) { registered.set(def.name, def); },
        unregisterFunctionTool(name) { registered.delete(name); },
    };
    const definition = createDefinition('11111111-1111-4111-8111-111111111111');
    const hub = createToolHub({
        getContext: () => context,
        toolPolicy: prefs,
        onDiagnostic: (level, category, event, detail) => events.push({ level, category, event, detail }),
    });
    hub.start();
    hub.update('primary', {
        label: 'Private Character Name',
        available: () => true,
        describeAvailable: () => true,
        record: () => ({ definition, presentation: definition.startingPresentation }),
        invoke: async op => JSON.stringify({ status: op.mood === 'bad' ? 'error' : 'prepared', error: op.mood === 'bad' ? 'Unsupported mood' : undefined }),
    });

    assert.deepEqual(hub.registeredTools(), ['lpc_outfit', 'lpc_pose', 'lpc_emote']);
    const owners = hub.inspectOwners();
    assert.equal(owners.length, 1);
    assert.equal(JSON.stringify(owners).includes('Private Character Name'), false);
    assert.equal(owners[0].slot, 'primary');
    assert.equal(owners[0].outfitId, definition.startingPresentation.outfitId);

    const emoteTool = registered.get('lpc_emote');
    await emoteTool.action(null);
    await emoteTool.action({ mood: 'bad' });
    await emoteTool.action({ mood: 'warm' });

    assert.ok(events.some(e => e.event === 'tools-synced'));
    assert.ok(events.some(e => e.event === 'tool-refused'));
    assert.ok(events.some(e => e.event === 'tool-rejected'));
    assert.ok(events.some(e => e.event === 'tool-prepared'));
    hub.stop();
    assert.deepEqual(hub.registeredTools(), []);
});
