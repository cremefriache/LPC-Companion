import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatContext } from '../src/adapter/context.mjs';

export function readyContext() {
    return {
        groupId: null, characterId: 0,
        characters: [{ avatar: 'Fixture.png' }],
        chatId: 'Fixture chat',
        chatMetadata: { integrity: '11111111-1111-4111-8111-111111111111' },
        getCurrentChatId: () => 'Fixture chat',
    };
}

test('host index zero is a valid locator; readiness never creates durable identity', () => {
    const context = readyContext();
    const before = structuredClone({ ...context, getCurrentChatId: null });
    assert.equal(readChatContext(context).characterIndex, 0);
    context.characterId = '0';
    assert.equal(readChatContext(context).characterIndex, '0');
    context.characterId = 0;
    assert.deepEqual({ ...context, getCurrentChatId: null }, before);
    assert.equal(Object.hasOwn(context.characters[0], 'data'), false);
});

test('unsupported, missing and transitioning contexts remain inert', () => {
    for (const patch of [
        { groupId: 'group' }, { characterId: undefined }, { characterId: -1 },
        { characterId: 'constructor' }, { characterId: '' }, { characterId: 2 },
        { chatId: '' }, { chatMetadata: {} }, { chatMetadata: { integrity: 'not-a-uuid' } },
        { characters: [{ avatar: 'Fixture.png', shallow: true }] },
        { characters: [{ avatar: '' }] }, { getCurrentChatId: () => 'Other chat' },
        { getCurrentChatId: undefined },
    ]) assert.equal(readChatContext({ ...readyContext(), ...patch }), null);
    assert.equal(readChatContext(null), null);
});
