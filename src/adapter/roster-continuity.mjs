import { ROSTER_KEY, rosterKey, readRosterContext } from './roster-context.mjs';
import { STATE_KEY } from './context.mjs';
import { makeUuid } from './uuid.mjs';
import { validateContract, validateDefinition, validatePresentation } from '../state/validate.mjs';
import { validateEmbeddedAssets } from '../state/portable-assets.mjs';
import { validateRoster } from '../state/roster.mjs';
import { initializeState, reconstruct, appendChange, definitionFromSnapshot, equal, MESSAGE_KEY } from '../state/history.mjs';
import { matchesResponse, matchesMemberResponse } from '../state/model-contract.mjs';
import {assertStateInvariants} from '../state/invariants.mjs';
import { assertLoadedCompanionHeaders } from './companion-headers.mjs';

export function createRosterContinuity({storage,getContext,crypto,isGenerating,queue}) {
    const records=new Map(),loads=new Map(),renames=new Set();let cachedAccount=null;
    const uuid=()=>makeUuid(crypto), key=rosterKey;
    function verifiedSource(cards,avatar,aliases=[],validateAssets=true) {
        const card=cards.find(card=>card.avatar===avatar),binding=card?.data?.extensions?.[STATE_KEY];
        if(!card||!Object.hasOwn(card.data?.extensions??{},STATE_KEY))throw Error('Configure this member’s companion in an ordinary character chat first.');
        validateContract(binding,'characterBinding');assertStateInvariants(binding.definition);if(validateAssets)validateDefinition(binding.definition);
        const known=new Set([binding.ownerAvatar,...binding.previousAvatars]);
        if(cards.some(other=>other.avatar!==avatar&&other.data?.extensions?.[STATE_KEY]?.definition?.characterId===binding.definition.characterId
            &&(other.data.extensions[STATE_KEY].ownerAvatar===other.avatar||!known.has(other.data.extensions[STATE_KEY].ownerAvatar))))throw Error('Member companion identity is ambiguous. Resolve its card copy in an ordinary chat first.');
        if(binding.ownerAvatar!==avatar){
            if(cards.some(card=>card.avatar===binding.ownerAvatar))throw Error('This member is an unconfirmed card copy. Create an independent card companion first.');
            if(!aliases.includes(binding.ownerAvatar)&&!renames.has(`card:${binding.ownerAvatar}:${avatar}`))throw Error('Member moved without a confirmed rename. Confirm its source rename before editing.');
        }
        return {card,binding};
    }
    const entryConflict=(active,entry,cards)=>{
        if(active.kind!=='group')return null;
        if(!active.members.includes(entry.sourceAvatar))return 'This companion’s member is no longer in the group or was renamed. Its snapshot is retained; confirm a matching source rename or restore membership.';
        try{const source=verifiedSource(cards,entry.sourceAvatar,entry.sourceAliases,false);if(source.binding.definition.characterId!==entry.sourceCharacterId)throw Error('The member now owns a different companion identity. This snapshot was retained; use a new chat for a different participant.');return null;}catch(error){return error.message;}
    };
    async function loadImpl(active){
        const account=await storage.account();if(account!==cachedAccount){records.clear();renames.clear();cachedAccount=account;}
        const {disk,rows}=await storage.read(active,{metadata:true});
        if(active.kind==='character'&&Object.hasOwn(disk[0].chat_metadata,STATE_KEY))validateContract(disk[0].chat_metadata[STATE_KEY],'chatRecord');
        const present=Object.hasOwn(disk[0].chat_metadata,ROSTER_KEY),raw=present?validateRoster(disk[0].chat_metadata[ROSTER_KEY],disk[0].chat_metadata[STATE_KEY]?.state):null;
        assertLoadedCompanionHeaders(disk[0].chat_metadata,getContext().chatMetadata);
        let roster=raw&&structuredClone(raw),conflict=null,needsSave=false;
        const cards=await storage.cards();
        if(roster){
            if(active.kind==='group')for(const entry of roster.companions)if(!active.members.includes(entry.sourceAvatar)&&!cards.some(card=>card.avatar===entry.sourceAvatar)){
                const moved=active.members.find(avatar=>renames.has(`card:${entry.sourceAvatar}:${avatar}`));
                if(moved){try{const aliases=[...new Set([...entry.sourceAliases,entry.sourceAvatar])].slice(-32),source=verifiedSource(cards,moved,aliases,false);if(source.binding.definition.characterId===entry.sourceCharacterId){entry.sourceAvatar=moved;entry.sourceAliases=aliases;needsSave=true;}}catch{/* Ambiguity remains blocked by entryConflict below. */}}
            }
            if(roster.ownerKind!==active.kind||roster.ownerId!==active.ownerId){
                if(active.kind==='character'&&roster.ownerKind==='character'&&renames.has(`card:${roster.ownerId}:${active.ownerId}`)&&!cards.some(card=>card.avatar===roster.ownerId)){roster.ownerId=active.ownerId;needsSave=true;}
                else conflict='This roster belongs to another character/group. Explicitly fork it for this copy, or confirm a missed character rename.';
            }
            if(roster.ownerChat!==active.chatLocator){
                if(rows.some(row=>row.file_id===roster.ownerChat)&&roster.ownerKind===active.kind&&roster.ownerId===active.ownerId){roster.rosterId=uuid();for(const entry of roster.companions)entry.state.snapshot.chatInstanceId=uuid();roster.ownerChat=active.chatLocator;needsSave=true;}
                else if(renames.has(`chat:${active.ownerId}:${roster.ownerChat}:${active.chatLocator}`)){roster.ownerChat=active.chatLocator;needsSave=true;}
                else conflict??='This roster chat moved without a verified rename. Confirm the rename before saving.';
            }
            if(rows.some(row=>row.file_id!==active.chatLocator&&row.chat_metadata?.[ROSTER_KEY]?.rosterId===roster.rosterId&&row.chat_metadata[ROSTER_KEY].ownerChat===row.file_id))conflict??='Independently owned chats share a roster identity. Export a backup and explicitly fork this copy.';
        }
        await storage.guard(active,account);
        const record={account,raw,roster,conflict,needsSave,cards,entries:new Map()};
        for(const entry of roster?.companions??[]){
            const previous=records.get(key(active))?.entries.get(entry.companionId),result=reconstruct(entry.state,getContext().chat);
            needsSave||=!equal(entry.state.presentation,result.presentation);entry.state.presentation=result.presentation;
            record.entries.set(entry.companionId,{...result,binding:{definition:definitionFromSnapshot(entry.state.snapshot),embeddedAssets:roster.embeddedAssets},defaults:definitionFromSnapshot(entry.state.snapshot),initial:definitionFromSnapshot(entry.state.snapshot),conflict:conflict??entryConflict(active,entry,cards),paused:previous?.paused??false,minimized:previous?.minimized,dock:previous?.dock??'inline',source:entry});
        }
        record.needsSave=needsSave;records.delete(key(active));records.set(key(active),record);while(records.size>64)records.delete(records.keys().next().value);return record;
    }
    function load(active){const k=key(active);if(loads.has(k))return loads.get(k);const task=queue.run(()=>loadImpl(active));loads.set(k,task);task.finally(()=>{if(loads.get(k)===task)loads.delete(k);}).catch(()=>{});return task;}
    const requireRecord=active=>{const record=records.get(key(active));if(!record)throw Error('Reload the companion roster first.');if(record.conflict)throw Error(record.conflict);return record;};
    async function sources(active){await storage.guard(active,await storage.account());const cards=await storage.cards();return cards.filter(card=>active.kind!=='group'||active.members.includes(card.avatar)).map(card=>{try{const source=verifiedSource(cards,card.avatar,[],false);return {avatar:card.avatar,name:String(card.name??card.avatar).slice(0,80),characterId:source.binding.definition.characterId};}catch(error){let characterId;try{const binding=validateContract(card.data?.extensions?.[STATE_KEY],'characterBinding');characterId=binding.definition.characterId;}catch{}return {avatar:card.avatar,name:String(card.name??card.avatar).slice(0,80),characterId,error:error.message};}});}
    async function saveRecord(active,record,roster,messages,current){validateRoster(roster);await storage.save(active,record.account,roster,messages,record.raw,current);record.raw=structuredClone(roster);record.roster=roster;record.needsSave=false;for(const value of record.entries.values())value.binding.embeddedAssets=roster.embeddedAssets;}
    async function previewSource(active,avatar){const account=await storage.account();await storage.guard(active,account);if(active.kind==='group'&&!active.members.includes(avatar))throw Error('Choose a current group member.');await storage.readCard(avatar);const cards=await storage.cards();if(active.kind==='character')verifiedSource(cards,active.ownerId,[],false);const value=verifiedSource(cards,avatar);await storage.guard(active,account);return {binding:structuredClone(value.binding),label:String(value.card.name??avatar).slice(0,80)||'Companion'};}
    function add(active,avatar,prepare=async()=>{},current=()=>true,expectedSource){return queue.run(async()=>{
        const record=requireRecord(active);if(isGenerating())throw Error('Wait for generation to finish before adding a companion.');
        if(active.kind==='group'&&!active.members.includes(avatar))throw Error('Choose a current group member.');
        const limit=active.kind==='group'?2:1;if((record.roster?.companions.length??0)>=limit)throw Error('This chat already has its bounded companion snapshots. Export a backup and use a new chat for different participants; no history was removed.');
        await storage.readCard(avatar);const cards=await storage.cards();if(active.kind==='character')verifiedSource(cards,active.ownerId,[],false);
        const {card,binding}=verifiedSource(cards,avatar);
        if(expectedSource&&!equal(binding,expectedSource))throw Error('Source defaults changed since the preview. Preview again before adding.');
        if(record.roster?.companions.some(entry=>active.kind==='group'&&entry.sourceCharacterId===binding.definition.characterId))throw Error('That member already has a companion in this group chat.');
        const definition=validateDefinition(binding.definition),sourceCharacterId=definition.characterId;definition.characterId=uuid();definition.revision=1;
        await prepare(definition,binding.embeddedAssets??{});
        await storage.guard(active,record.account,current);
        const latest=await storage.readCard(avatar);if(!equal(latest.data?.extensions?.[STATE_KEY],binding))throw Error('Member defaults changed while preparing the companion. Retry to preview the current source.');
        const roster=record.roster?structuredClone(record.roster):{schemaVersion:1,kind:'companion-roster',rosterId:uuid(),ownerKind:active.kind,ownerId:active.ownerId,ownerChat:active.chatLocator,companions:[],embeddedAssets:{}};
        roster.embeddedAssets=validateEmbeddedAssets({...roster.embeddedAssets,...binding.embeddedAssets});
        roster.companions.push({companionId:definition.characterId,label:String(card.name??avatar).slice(0,80)||'Companion',sourceAvatar:avatar,sourceCharacterId,sourceRevision:binding.definition.revision,sourceAliases:[],state:initializeState(definition,uuid)});
        await saveRecord(active,record,roster,structuredClone(getContext().chat),current);return definition.characterId;
    });}
    function commit(active,id,candidate,current=()=>true){return queue.run(async()=>{
        const record=requireRecord(active),entry=record.roster?.companions.find(entry=>entry.companionId===id);if(!entry)throw Error('Companion target is not in this roster.');
        const problem=entryConflict(active,entry,active.kind==='group'?await storage.cards():[]);if(problem)throw Error(problem);
        if(isGenerating()&&!['restore','preview'].includes(candidate.mode))throw Error('Wait for generation to finish before changing companions.');
        await storage.guard(active,record.account,current);
        const definition=validateDefinition(candidate.definition);if(definition.characterId!==id)throw Error('A roster update cannot target another companion identity.');
        const presentation=validatePresentation(definition,definition.startingPresentation,candidate.presentation);
        if(candidate.mode==='preview')return {definition,presentation};
        if(['defaults','both'].includes(candidate.mode))throw Error('Roster companions are chat-local. Edit source card defaults in its ordinary chat.');
        const chat=getContext().chat,result=reconstruct(entry.state,chat);
        if(candidate.origin==='model'&&(!(active.kind==='group'?matchesMemberResponse(chat,candidate.response,entry.sourceAvatar):matchesResponse(chat,candidate.response))||!equal(candidate.expectedDefinition??definition,result.definition)||!equal(definition.identity,result.definition.identity)||definition.characterId!==result.definition.characterId))throw Error('Model target/accepted response changed.');
        if(candidate.mode==='restore'&&(isGenerating()||chat.some(message=>Number.isInteger(message.swipe_id)&&(!message.swipes?.[message.swipe_id]||!message.swipe_info?.[message.swipe_id]))))return {definition,presentation};
        const roster=structuredClone(record.roster),target=roster.companions.find(entry=>entry.companionId===id);
        roster.embeddedAssets=validateEmbeddedAssets({...roster.embeddedAssets,...(candidate.embeddedAssets===undefined?{}:validateEmbeddedAssets(candidate.embeddedAssets))});
        let outcome={...result,state:target.state,messages:structuredClone(chat)};
        if(candidate.mode==='replacement'||!equal(definition,result.definition))outcome=appendChange(target.state,chat,{schemaVersion:definition.schemaVersion,kind:'companion-replacement',definition,presentation},uuid,candidate.origin==='model'?'model':'manual',active.kind==='group'&&candidate.origin==='model'?candidate.response.index:undefined);
        else if(candidate.mode!=='restore'&&!equal(presentation,result.presentation))outcome=appendChange(target.state,chat,{schemaVersion:definition.schemaVersion,kind:'presentation-patch',patch:presentation},uuid,candidate.origin==='model'?'model':'manual',active.kind==='group'&&candidate.origin==='model'?candidate.response.index:undefined);
        target.state={...outcome.state,presentation:outcome.presentation};
        if(!equal(roster,record.raw)||!equal(outcome.messages,chat))await saveRecord(active,record,roster,outcome.messages,current);
        const view=record.entries.get(id);if(view){view.definition=outcome.definition;view.presentation=outcome.presentation;view.binding.embeddedAssets=roster.embeddedAssets;view.source=target;}
        return outcome;
    });}
    function recover(active,choice){return queue.run(async()=>{
        const record=records.get(key(active));if(!record?.raw)throw Error('Export unsupported data; it cannot be replaced automatically.');
        await storage.guard(active,record.account);const roster=structuredClone(record.raw),cards=await storage.cards(),rows=await storage.listing(active);
        if(choice==='rename'){
            if(roster.ownerKind!==active.kind||active.kind==='group'&&roster.ownerId!==active.ownerId)throw Error('Group copies require an independent roster.');
            if(roster.ownerId!==active.ownerId&&cards.some(card=>card.avatar===roster.ownerId))throw Error('The original card still exists. Fork this copy instead.');
            if(roster.ownerChat!==active.chatLocator&&rows.some(row=>row.file_id===roster.ownerChat))throw Error('The source chat still exists. Fork this copy instead.');
        }else if(choice==='fork'){
            roster.rosterId=uuid();for(const entry of roster.companions){entry.companionId=uuid();entry.state.snapshot.characterId=entry.companionId;entry.state.snapshot.chatInstanceId=uuid();for(const history of entry.state.history)if(history.change.kind==='companion-replacement')history.change.definition.characterId=entry.companionId;}
        }else throw Error('Unknown roster recovery.');
        roster.ownerKind=active.kind;roster.ownerId=active.ownerId;roster.ownerChat=active.chatLocator;
        await saveRecord(active,record,roster,structuredClone(getContext().chat));
    });}
    function rebind(active,id,avatar){return queue.run(async()=>{
        const record=requireRecord(active),roster=structuredClone(record.roster),entry=roster.companions.find(value=>value.companionId===id),cards=await storage.cards();
        if(!entry||active.kind!=='group'||!active.members.includes(avatar))throw Error('Choose a current group member for the confirmed rename.');
        if(cards.some(card=>card.avatar===entry.sourceAvatar)&&entry.sourceAvatar!==avatar)throw Error('The original member card still exists; this is not a rename.');
        const candidate=cards.find(card=>card.avatar===avatar)?.data?.extensions?.[STATE_KEY];validateContract(candidate,'characterBinding');
        if(candidate.definition.characterId!==entry.sourceCharacterId)throw Error('That member has a different durable source identity. No snapshot was rebound.');
        const aliases=[...new Set([...entry.sourceAliases,entry.sourceAvatar,candidate.ownerAvatar])].slice(-32),source=verifiedSource(cards,avatar,aliases,false);
        if(source.binding.definition.characterId!==entry.sourceCharacterId)throw Error('That member has a different durable source identity. No snapshot was rebound.');
        entry.sourceAliases=aliases;entry.sourceAvatar=avatar;await saveRecord(active,record,roster,structuredClone(getContext().chat));
    });}
    return {load,sources,previewSource,add,recover,rebind,get:active=>records.get(key(active)),whenIdle:queue.whenIdle,
        async backup(active){const account=await storage.account(),{disk}=await storage.read(active,{prepare:false});await storage.guard(active,account);return {schemaVersion:1,kind:'companion-roster-backup',roster:disk[0].chat_metadata[ROSTER_KEY]??null};},
        facade(active,id){return {get:()=>records.get(key(active))?.entries.get(id),create:async()=>{await load(active);return records.get(key(active))?.entries.get(id);},load:async()=>{await load(active);return records.get(key(active))?.entries.get(id);},commit:(_active,candidate,current)=>commit(active,id,candidate,current),whenIdle:queue.whenIdle,backup:async()=>{const account=await storage.account(),{disk}=await storage.read(active,{prepare:false});await storage.guard(active,account);return {schemaVersion:1,kind:'companion-roster-backup',roster:disk[0].chat_metadata[ROSTER_KEY]??null};},resolve:async()=>{throw Error('Use roster ownership recovery controls.');}};},
        noteRename(kind,...parts){renames.add(`${kind}:${parts.join(':')}`);while(renames.size>256)renames.delete(renames.values().next().value);},beginGeneration(type){if(type!=='swipe'||!readRosterContext(getContext()))return;const message=getContext().chat.at(-1);if(message?.extra&&Number.isInteger(message.swipe_id)&&!message.swipe_info?.[message.swipe_id])delete message.extra[MESSAGE_KEY];},
    };
}
