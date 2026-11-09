import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { assertStateInvariants } from '../src/state/invariants.mjs';

const schema = JSON.parse(await readFile(new URL('../schemas/lpc-state.schema.json', import.meta.url)));
const check = new Ajv({ strict: true }).compile(schema);
const uuid = '11111111-1111-4111-8111-111111111111';
const definition = {
    schemaVersion: 1, kind: 'character-definition', characterId: uuid,
    revision: 1, catalogVersion: 'lpc-curated-v1',
    identity: {
        bodyType: 'male', body: { itemId: 'body', paletteId: 'body.ulpc.light' },
        head: { itemId: 'heads_human_male', paletteId: 'body.ulpc.light' },
        hair: { itemId: 'hair_plain', paletteId: 'hair.ulpc.brown' },
    },
    outfits: [{ id: 'everyday', name: 'Everyday', selections: {} }],
    startingPresentation: {
        outfitId: 'everyday', posture: 'idle', facing: 'south',
        scene: { backgroundId: 'plain', x: 0.5, y: 1, scale: 1 },
    },
};
const { revision, ...base } = definition;
const snapshot = { ...base, kind: 'chat-snapshot', chatInstanceId: uuid, sourceDefinitionRevision: revision };
const change = { schemaVersion: 1, kind: 'presentation-patch', patch: { facing: 'east' } };
const historyEntry = { entryId: uuid, sequence: 1, origin: 'manual', response: null, change };
const chat = { schemaVersion: 1, kind: 'chat-state', snapshot, presentation: definition.startingPresentation, history: [historyEntry] };
const cue = { schemaVersion: 1, kind: 'action-cue', cueId: uuid, actionId: 'run', durationMs: 1000, response: { messageId: uuid, swipeId: uuid } };

function valid(value) {
    assert.equal(check(value), true, JSON.stringify(check.errors));
    assertStateInvariants(value);
}
function invalid(value) { assert.equal(check(value), false); }

test('distinct versioned contracts accept definition, snapshot, state, patch and transient cue', () => {
    [definition, snapshot, chat, change, cue].forEach(valid);
    invalid({ version: 2, bodyType: 'male', selections: {} });
    invalid({ schemaVersion: 1, kind: 'character', selections: {} });
    invalid({ ...definition, schemaVersion: 2 });
});

test('identity edits, paths, unsupported posture, unbounded cues and unknown fields are rejected', () => {
    invalid({ ...change, patch: {} });
    invalid({ ...change, patch: { identity: definition.identity } });
    invalid({ ...change, patch: { outfitId: '../../outside' } });
    invalid({ ...change, patch: { posture: 'sit' } });
    invalid({ ...definition, extra: true });
    invalid({ ...cue, durationMs: 10001 });
    invalid({ ...cue, actionId: 'https://example.com/action.png' });
    invalid({ ...chat, actionCue: cue });
    invalid({ ...chat, history: [{ ...historyEntry, origin: 'model', response: null }] });
    invalid({ ...definition, outfits: Array(100).fill(definition.outfits[0]) });
});

test('cross-field invariants reject unknown outfits, duplicate IDs and unordered history', () => {
    for (const value of [
        { ...definition, outfits: [definition.outfits[0], definition.outfits[0]] },
        { ...definition, startingPresentation: { ...definition.startingPresentation, outfitId: 'absent' } },
        { ...definition, identity: { ...definition.identity, head: { ...definition.identity.head, paletteId: 'body.ulpc.dark' } } },
        { ...chat, history: [historyEntry, historyEntry] },
        { ...chat, history: [{ ...historyEntry, change: { ...change, patch: { outfitId: 'absent' } } }] },
    ]) {
        assert.equal(check(value), true, JSON.stringify(check.errors));
        assert.throws(() => assertStateInvariants(value));
    }
});
