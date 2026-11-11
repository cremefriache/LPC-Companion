import { validateContract, validateDefinition } from './validate.mjs';
import { reconstruct } from './history.mjs';

export function createRosterValidator({
    validateContract: checkContract = validateContract,
    validateDefinition: checkDefinition = validateDefinition,
    reconstruct: replay = reconstruct,
} = {}) {
    return function validateRoster(value, primaryState) {
        const roster = checkContract(value, 'companionRoster');
        if (roster.ownerKind === 'character' && roster.companions.length > 1) throw Error('Ordinary chats support one additional companion.');
        if (primaryState) checkContract(primaryState, 'chatState');
        const ids = new Set(primaryState ? [primaryState.snapshot.characterId] : []);
        const chats = new Set(primaryState ? [primaryState.snapshot.chatInstanceId] : []);
        const sources = new Set();
        const sourceIds = new Set(roster.companions.map(entry => entry.sourceCharacterId));
        const historyIds = new Set(primaryState?.history.map(entry => entry.entryId) ?? []);
        for (const entry of roster.companions) {
            if (ids.has(entry.companionId) || chats.has(entry.state.snapshot.chatInstanceId) || entry.companionId !== entry.state.snapshot.characterId || sourceIds.has(entry.companionId)) throw Error('Ambiguous roster companion identity.');
            if (roster.ownerKind === 'group' && sources.has(entry.sourceCharacterId)) throw Error('Two group companions cannot claim the same member identity.');
            ids.add(entry.companionId); chats.add(entry.state.snapshot.chatInstanceId); sources.add(entry.sourceCharacterId);
            for (const history of entry.state.history) { if (historyIds.has(history.entryId)) throw Error('Companions share an ambiguous history entry identity.'); historyIds.add(history.entryId); }
            const result = replay(entry.state, []); checkDefinition(result.definition);
        }
        return roster;
    };
}

export const validateRoster = createRosterValidator();
