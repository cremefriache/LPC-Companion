import { validateContract, validateDefinition } from './validate.mjs';
import { reconstruct } from './history.mjs';

export function validateRoster(value,primaryState) {
    const roster=validateContract(value,'companionRoster');
    if(roster.ownerKind==='character'&&roster.companions.length>1)throw Error('Ordinary chats support one additional companion.');
    if(primaryState)validateContract(primaryState,'chatState');
    const ids=new Set(primaryState?[primaryState.snapshot.characterId]:[]),chats=new Set(primaryState?[primaryState.snapshot.chatInstanceId]:[]),sources=new Set(),sourceIds=new Set(roster.companions.map(entry=>entry.sourceCharacterId)),historyIds=new Set(primaryState?.history.map(entry=>entry.entryId)??[]);
    for(const entry of roster.companions){
        if(ids.has(entry.companionId)||chats.has(entry.state.snapshot.chatInstanceId)||entry.companionId!==entry.state.snapshot.characterId||sourceIds.has(entry.companionId))throw Error('Ambiguous roster companion identity.');
        if(roster.ownerKind==='group'&&sources.has(entry.sourceCharacterId))throw Error('Two group companions cannot claim the same member identity.');
        ids.add(entry.companionId);chats.add(entry.state.snapshot.chatInstanceId);sources.add(entry.sourceCharacterId);
        for(const history of entry.state.history){if(historyIds.has(history.entryId))throw Error('Companions share an ambiguous history entry identity.');historyIds.add(history.entryId);}
        const result=reconstruct(entry.state,[]);validateDefinition(result.definition);
    }
    return roster;
}
