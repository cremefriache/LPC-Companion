import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferences } from '../src/adapter/preferences.mjs';

test('master, tool calling and sharing preferences survive reload while master disable clears tool calling', () => {
    const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const first = createPreferences({ storage });
    assert.deepEqual(first.get(), { enabled: true, toolCalling: false, shareContext: true });
    let notifications = 0;
    const unsubscribe = first.subscribe(() => { notifications++; });
    first.set({ toolCalling: true, shareContext: false });
    assert.deepEqual(createPreferences({ storage }).get(), { enabled: true, toolCalling: true, shareContext: false });
    first.set({ enabled: false });
    assert.deepEqual(first.get(), { enabled: false, toolCalling: false, shareContext: false });
    assert.deepEqual(createPreferences({ storage }).get(), { enabled: false, toolCalling: false, shareContext: false });
    first.set({ toolCalling: true });
    assert.equal(notifications, 2, 'A disabled companion cannot retain tool consent');
    unsubscribe(); first.set({ enabled: true }); assert.equal(notifications, 2);
});

test('malformed stored values and unavailable browser storage cannot bypass permissions', () => {
    for (const raw of ['null', '{', JSON.stringify({ schemaVersion: 1, enabled: 'yes', shareContext: true, toolCalling: true }), JSON.stringify({ schemaVersion: 1, enabled: true, shareContext: true, toolCalling: 'yes' }), 'x'.repeat(1025)]) {
        const prefs = createPreferences({ storage: { getItem: () => raw } });
        assert.deepEqual(prefs.get(), { enabled: true, toolCalling: false, shareContext: true });
        assert.throws(() => prefs.set({ toolCalling: 'true' }));
        assert.throws(() => prefs.set({ unknown: true }));
        assert.equal(prefs.get().toolCalling, false);
    }
    const prefs = createPreferences({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
    prefs.set({ enabled: false }); assert.equal(prefs.get().enabled, false);
});

test('toolScope selector supports off, character and scene modes and persists across reloads', () => {
    const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const prefs = createPreferences({ storage });
    assert.equal(prefs.get().toolScope, 'off');
    assert.equal(prefs.get().preferredToolScope, 'character');
    prefs.set({ toolScope: 'scene' });
    assert.equal(prefs.get().toolCalling, true);
    assert.equal(prefs.get().toolScope, 'scene');
    assert.equal(prefs.get().preferredToolScope, 'scene');
    const reloaded = createPreferences({ storage });
    assert.equal(reloaded.get().toolCalling, true);
    assert.equal(reloaded.get().toolScope, 'scene');
    assert.equal(reloaded.get().preferredToolScope, 'scene');
    reloaded.set({ toolScope: 'off' });
    assert.equal(reloaded.get().toolCalling, false);
    assert.equal(reloaded.get().toolScope, 'off');
    const reloadedOff = createPreferences({ storage });
    assert.equal(reloadedOff.get().toolCalling, false);
    assert.equal(reloadedOff.get().toolScope, 'off');
    assert.equal(reloadedOff.get().preferredToolScope, 'scene');
});

test('dock defaults to left and persists globally across reloads', () => {
    const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const prefs = createPreferences({ storage });
    assert.equal(prefs.get().dock, 'left');
    assert.throws(() => prefs.set({ dock: 'bottom' }));
    prefs.set({ dock: 'right' });
    assert.equal(prefs.get().dock, 'right');
    const reloaded = createPreferences({ storage });
    assert.equal(reloaded.get().dock, 'right');
    reloaded.set({ dock: 'inline' });
    assert.equal(createPreferences({ storage }).get().dock, 'inline');
    reloaded.set({ dock: 'left' });
    assert.equal(createPreferences({ storage }).get().dock, 'left');
});
