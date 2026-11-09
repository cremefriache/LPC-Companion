export const EXTENSION_ID = 'lpc-companion';
export const STATE_KEY = 'lpc_companion';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read-only readiness check. Host locators are NOT durable LPC identities. */
export function readChatContext(context) {
    if (!context || (context.groupId !== undefined && context.groupId !== null)) {
        return null;
    }
    const index = context.characterId;
    // SillyTavern exposes a number or decimal string array index, including zero.
    if (!((Number.isInteger(index) && index >= 0)
        || (typeof index === 'string' && /^(0|[1-9]\d*)$/.test(index)))) {
        return null;
    }
    const character = context.characters?.[index];
    if (!character || character.shallow || typeof character.avatar !== 'string'
        || !character.avatar || typeof context.chatId !== 'string' || !context.chatId
        || !UUID.test(context.chatMetadata?.integrity ?? '')) {
        return null;
    }
    if (typeof context.getCurrentChatId !== 'function'
        || context.getCurrentChatId() !== context.chatId) {
        return null;
    }
    return Object.freeze({
        characterIndex: index,
        characterAvatar: character.avatar,
        chatLocator: context.chatId,
        integrity: context.chatMetadata.integrity,
    });
}
