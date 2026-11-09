import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, planLayers, capabilities, selectionsFor } from '../src/catalog/catalog.mjs';
import { createDefinition } from '../src/state/defaults.mjs';
import { validateDefinition, validatePresentation } from '../src/state/validate.mjs';
import { createComposer } from '../src/composition/composer.mjs';
import { ImageCache } from '../src/composition/cache.mjs';
import { createRenderTransaction } from '../src/state/render-transaction.mjs';
import { createSessionStore } from '../src/adapter/session.mjs';
import { makeUuid } from '../src/adapter/uuid.mjs';

const definition = createDefinition('11111111-1111-4111-8111-111111111111');

test('schema, invariant and catalog gates reject unknown selections, palettes and identity patches', () => {
    validateDefinition(definition);
    for (const mutate of [
        value => { value.identity.body.itemId = '../../body'; },
        value => { value.identity.hair.paletteId = 'hair.ulpc.nope'; },
        value => { value.outfits[0].selections.body = value.identity.body; },
        value => { value.startingPresentation.posture = 'sit'; },
        value => { value.outfits[0].name = ' '; },
        value => { value.catalogVersion = 'unavailable'; },
    ]) { const value = structuredClone(definition); mutate(value); assert.throws(() => validateDefinition(value)); }
    assert.throws(() => validatePresentation(definition, definition.startingPresentation, { identity: definition.identity }));
    for (const outfit of definition.outfits) {
        assert.deepEqual(capabilities(selectionsFor(definition, outfit.id)), ['idle', 'walk', 'run', 'jump', 'spellcast', 'sit', 'emote']);
        assert.deepEqual(planLayers(selectionsFor(definition, outfit.id), 'walk').map(layer => layer.z), [10, 20, 35, 100, 120]);
    }
});

test('one-direction multi-layer fixture preserves global z-order and validates dimensions', async () => {
    const fixture = structuredClone(catalog);
    fixture.animations = { pose: { frameWidth: 32, frameHeight: 48, cycle: [0, 2, 1], directions: ['south'], frameMs: 100 } };
    fixture.items.body.layers = [
        { z: 100, paths: { pose: 'spritesheets/front.png' } },
        { z: 1, paths: { pose: 'spritesheets/back.png' } },
    ];
    fixture.items.hair_plain.layers = [{ z: 50, paths: { pose: 'spritesheets/hair.png' } }];
    const drawn = [];
    const composer = createComposer({
        catalog: fixture,
        loadImage: async path => ({ width: 96, height: 48, path }),
        recolor: async image => image,
        createCanvas: (width, height) => ({ width, height, getContext: () => ({ drawImage: image => drawn.push(image.path) }) }),
    });
    const sheet = await composer.compose({ body: definition.identity.body, hair: definition.identity.hair }, 'pose');
    assert.deepEqual(drawn, ['spritesheets/back.png', 'spritesheets/hair.png', 'spritesheets/front.png']);
    assert.equal(sheet.canvas.width, 96); assert.equal(sheet.canvas.height, 48);
    assert.equal(sheet.layout.directions.length, 1);
    delete fixture.items.hair_plain.layers[0].paths.pose;
    assert.throws(() => planLayers({ hair: definition.identity.hair }, 'pose', fixture));
    composer.dispose();
    assert.equal(composer.stats().decodedBytes, 0);
});

test('LRU byte bounds, deduplication, retry and clear during a load', async () => {
    const cache = new ImageCache(32);
    for (let i = 0; i < 20; i++) await cache.get(String(i), async () => ({ width: 2, height: 2 }));
    assert.equal(cache.entries.size, 2); assert.equal(cache.bytes, 32);
    await assert.rejects(cache.get('bad', async () => { throw Error('load failed'); }));
    await cache.get('bad', async () => ({ width: 1, height: 1 }));
    let finish, loads = 0;
    const load = () => { loads++; return new Promise(resolve => { finish = resolve; }); };
    const first = cache.get('pending', load), second = cache.get('pending', load);
    assert.equal(loads, 1); cache.clear(); finish({ width: 1, height: 1 }); await Promise.all([first, second]);
    assert.equal(cache.bytes, 0); assert.equal(cache.entries.size, 0);
});

test('failed recolor and wrong image dimensions reject without retaining a bad colored result', async () => {
    let broken = true;
    const composer = createComposer({ catalog,
        createCanvas: (width, height) => ({ width, height, getContext: () => ({ drawImage() {} }) }),
        loadImage: async () => ({ width: 128, height: 256 }),
        recolor: async image => { if (broken) throw Error('Recolor failed'); return image; },
    });
    await assert.rejects(composer.compose({ body: definition.identity.body }, 'idle'), /Recolor failed/);
    assert.equal(composer.stats().recoloredBytes, 0);
    broken = false;
    assert.equal((await composer.compose({ body: definition.identity.body }, 'idle')).layers.length, 1);
    await assert.rejects(composer.compose({ body: definition.identity.body }, 'walk'), /layout/);
    composer.dispose();
    assert.equal(composer.stats().recoloredBytes, 0);
});

test('stale and failed render transactions retain the accepted appearance and disposal blocks commit', async () => {
    const pending = new Map(); let accepted = 'baseline';
    const transaction = createRenderTransaction(value => new Promise((resolve, reject) => pending.set(value, { resolve, reject })), value => { accepted = value; });
    const old = transaction.submit('old'), latest = transaction.submit('latest');
    pending.get('latest').resolve({}); await latest;
    pending.get('old').resolve({}); assert.equal(await old, false); assert.equal(accepted, 'latest');
    const fail = transaction.submit('bad'); pending.get('bad').reject(Error('missing image'));
    await assert.rejects(fail); assert.equal(accepted, 'latest');
    const closed = transaction.submit('closed'); transaction.dispose(); pending.get('closed').resolve({});
    assert.equal(await closed, false); assert.equal(accepted, 'latest');
});

test('session locators isolate chats including copied integrity; capacity never evicts existing work', () => {
    const store = createSessionStore(2);
    const a = { characterAvatar: 'card.png', chatLocator: 'a', integrity: 'same' };
    const b = { ...a, chatLocator: 'b' };
    store.create(a).definition = definition;
    assert.equal(store.get(a).dock, 'left');
    store.get(a).dock = 'right';
    assert.equal(store.create(b).definition, null);
    assert.equal(store.get(b).dock, 'right');
    store.get(b).dock = 'left';
    assert.equal(store.get(a).dock, 'left');
    assert.equal(store.get(a).definition, definition);
    assert.throws(() => store.create({ ...a, chatLocator: 'c' }));
    assert.equal(store.get(a).definition, definition);
});

test('session setup can create UUIDs without the secure-context randomUUID API', () => {
    const uuid = makeUuid({ getRandomValues: array => crypto.getRandomValues(array) });
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    validateDefinition(createDefinition(uuid));
});
