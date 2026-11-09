import {mockCardMerge} from '../tools/mock-card-merge.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createDefinition } from '../src/state/defaults.mjs';
import { createHostStorage } from '../src/adapter/storage.mjs';
import { createRosterStorage } from '../src/adapter/roster-storage.mjs';
import { createContinuity } from '../src/adapter/continuity.mjs';
import { createRosterContinuity } from '../src/adapter/roster-continuity.mjs';
import { createWorkQueue } from '../src/adapter/work-queue.mjs';
import { readRosterContext } from '../src/adapter/roster-context.mjs';
import { reconstruct, appendChange } from '../src/state/history.mjs';
import { validateRoster } from '../src/state/roster.mjs';
import { responseFingerprint } from '../src/state/model-contract.mjs';

let counter=0;const uuid=()=>`${(++counter).toString(16).padStart(8,'0')}-1111-4111-8111-111111111111`;
function environment(group=false){
    const cards=['A.png','B.png'].map(avatar=>({avatar,name:'Same display name',data:{extensions:{lpc_companion:{schemaVersion:1,kind:'character-binding',ownerAvatar:avatar,previousAvatars:[],definition:createDefinition(uuid())}}}}));
    const groups=[{id:'group-a',chat_id:'group-chat-a',chats:['group-chat-a'],members:['A.png','B.png']}];
    let current={characterId:0,groupId:group?'group-a':null,characters:cards,groups,chatId:group?'group-chat-a':'ordinary-a',chatMetadata:{integrity:uuid(),otherExtension:{keep:true}},chat:[{mes:'Accepted response',is_user:false,swipe_id:0,swipes:['Accepted response','Alternative'],swipe_info:[{extra:{}},{extra:{}}],extra:{}}],getRequestHeaders:()=>({}),getCurrentChatId:()=>current.chatId,getOneCharacter:async()=>{}};
    const disk=new Map([[current.chatId,[{chat_metadata:structuredClone(current.chatMetadata)},...structuredClone(current.chat)]]]);
    let handle='user',failure=false,hook=null,requestHook=null,loseAck=false,failReadsAfter=Infinity;const writes=[];
    const fetch=async(path,options)=>{const body=options.body?JSON.parse(options.body):{};let value;
        if(requestHook)await requestHook(path,body);
        if(path==='/api/users/me')value={handle};
        else if(path==='/api/groups/all')value=groups;
        else if(path==='/api/characters/all')value=cards;
        else if(path==='/api/characters/get')value=cards.find(card=>card.avatar===body.avatar_url);
        else if(path==='/api/characters/chats')value=[...disk].map(([file_id,rows])=>({file_id,chat_metadata:rows[0].chat_metadata}));
        else if(path==='/api/chats/get'||path==='/api/chats/group/get'){if(writes.length>=failReadsAfter)return new Response('unavailable',{status:500});value=disk.get(body.file_name??body.id)??[];}
        else if(path==='/api/characters/merge-attributes'){
            writes.push({path,body});if(hook)await hook(path,body);if(failure)return new Response('failed',{status:500});const card=cards.find(card=>card.avatar===body.avatar);card.data.extensions=mockCardMerge(card.data.extensions,body.data.extensions);value={ok:true};
        }else if(path==='/api/chats/save'||path==='/api/chats/group/save'){
            writes.push({path,body});if(hook)await hook(path,body);if(failure)return new Response('failed',{status:500});disk.set(body.file_name??body.id,structuredClone(body.chat));if(loseAck)return new Response('lost acknowledgement',{status:500});value={ok:true};
        }else throw Error(`Unexpected synthetic request ${path}`);
        return new Response(JSON.stringify(value),{status:200});
    };
    const host={isGenerating:()=>false,isChatSaving:false,cancelDebouncedChatSave(){}},getContext=()=>current,queue=createWorkQueue();
    const storage=createHostStorage({getContext,fetch,host}),rosterStorage=createRosterStorage({getContext,fetch,host,primaryStorage:storage});
    const primary=createContinuity({storage,getContext,crypto:webcrypto,isGenerating:host.isGenerating,queue});
    const manager=createRosterContinuity({storage:rosterStorage,getContext,crypto:webcrypto,isGenerating:host.isGenerating,queue});
    return {getContext,cards,groups,disk,writes,manager,primary,rosterStorage,active:()=>readRosterContext(current),setAccount:value=>{handle=value;},fail:value=>{failure=value;},setHook:value=>{hook=value;},setRequestHook:value=>{requestHook=value;},loseAck:value=>{loseAck=value;},failNextReadback:()=>{failReadsAfter=writes.length+1;},allowReads:()=>{failReadsAfter=Infinity;},switchChat(id){current={...current,chatId:id,chatMetadata:structuredClone(disk.get(id)[0].chat_metadata),chat:structuredClone(disk.get(id).slice(1))};if(group){groups[0].chat_id=id;if(!groups[0].chats.includes(id))groups[0].chats.push(id);}}};
}
async function add(env,avatar){const active=env.active();await env.manager.load(active);const id=await env.manager.add(active,avatar);await env.manager.load(active);return {id,active,view:env.manager.facade(active,id)};}

for(const group of [false,true])test(`${group?'group':'ordinary'} roster saves reject host edits during the initial guard and stale payloads`,async()=>{
    const env=environment(group),a=await add(env,'A.png'),record=env.manager.get(a.active),next=structuredClone(record.roster),before=env.writes.length;
    const result=appendChange(next.companions[0].state,env.getContext().chat,{schemaVersion:1,kind:'presentation-patch',patch:{outfitId:'summer'}},uuid);
    next.companions[0].state=result.state;
    let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    env.setRequestHook(async path=>{if(path!=='/api/users/me')return;env.setRequestHook(null);entered();await gate;});
    const pending=env.rosterStorage.save(a.active,'user',next,result.messages,record.raw);
    await started;env.getContext().chat[0].mes='Completed host edit';env.disk.get(a.active.chatLocator)[1].mes='Completed host edit';release();
    await assert.rejects(pending,/Chat changed/);assert.equal(env.writes.length,before);assert.equal(env.disk.get(a.active.chatLocator)[1].mes,'Completed host edit');
    await assert.rejects(env.rosterStorage.save(a.active,'user',next,result.messages,record.raw),/Chat changed before/);assert.equal(env.writes.length,before);
    // A fresh payload with only the owned receipt additions remains valid.
    const fresh=appendChange(record.roster.companions[0].state,env.getContext().chat,{schemaVersion:1,kind:'presentation-patch',patch:{outfitId:'summer'}},uuid);
    next.companions[0].state=fresh.state;await env.rosterStorage.save(a.active,'user',next,fresh.messages,record.raw);
    assert.deepEqual(env.disk.get(a.active.chatLocator).slice(1),fresh.messages);assert.deepEqual(env.getContext().chat,fresh.messages);
    assert.equal(reconstruct(fresh.state,env.getContext().chat).presentation.outfitId,'summer');
});

test('ordinary primary/additional updates share a queue and preserve both histories, metadata and card defaults',async()=>{
    const env=environment(),active=env.active();await env.primary.load(active);
    const primaryRecord=env.primary.get(active);await env.primary.commit(active,{definition:primaryRecord.definition,presentation:primaryRecord.presentation,mode:'restore'});
    const cards=structuredClone(env.cards),guest=await add(env,'B.png'),guestRecord=guest.view.get();
    assert.notEqual(guest.id,env.cards[1].data.extensions.lpc_companion.definition.characterId);
    await Promise.all([
        env.primary.commit(active,{definition:primaryRecord.definition,presentation:{...primaryRecord.presentation,outfitId:'summer'}}),
        guest.view.commit(active,{definition:guestRecord.definition,presentation:{...guestRecord.presentation,outfitId:'evening'}}),
    ]);
    const metadata=env.disk.get(active.chatLocator)[0].chat_metadata;
    assert.equal(metadata.lpc_companion.state.presentation.outfitId,'summer');assert.equal(metadata.lpc_companion_roster.companions[0].state.presentation.outfitId,'evening');assert.deepEqual(metadata.otherExtension,{keep:true});assert.deepEqual(env.cards,cards);
    const receipts=env.getContext().chat[0].extra.lpc_companion_receipts.entries;
    assert.ok(receipts.includes(metadata.lpc_companion.state.history.at(-1).entryId));assert.ok(receipts.includes(metadata.lpc_companion_roster.companions[0].state.history.at(-1).entryId));
    assert.equal(reconstruct(metadata.lpc_companion.state,env.getContext().chat).presentation.outfitId,'summer');
    assert.equal(reconstruct(metadata.lpc_companion_roster.companions[0].state,env.getContext().chat).presentation.outfitId,'evening');
    await assert.rejects(guest.view.commit(active,{definition:primaryRecord.definition,presentation:primaryRecord.presentation}),/another companion/);
});
test('group member snapshots copy defaults once, target independent UUIDs, replay swipes and fork branches',async()=>{
    const env=environment(true),a=await add(env,'A.png'),b=await add(env,'B.png');
    const first=a.view.get(),second=b.view.get();assert.notEqual(a.id,b.id);assert.equal(first.source.label,second.source.label);
    await a.view.commit(a.active,{definition:first.definition,presentation:{...first.presentation,outfitId:'summer'}});
    assert.equal(b.view.get().presentation.outfitId,'everyday');
    env.cards[0].data.extensions.lpc_companion.definition.startingPresentation.outfitId='evening';
    await env.manager.load(a.active);assert.equal(a.view.get().presentation.outfitId,'summer');
    const message=env.getContext().chat[0];message.swipe_id=1;message.mes=message.swipes[1];message.extra={};await env.manager.load(a.active);assert.equal(a.view.get().presentation.outfitId,'everyday');
    message.swipe_id=0;message.mes=message.swipes[0];message.extra=structuredClone(message.swipe_info[0].extra);await env.manager.load(a.active);assert.equal(a.view.get().presentation.outfitId,'summer');
    const source=structuredClone(env.disk.get(a.active.chatLocator));env.disk.set('group-branch',source);env.switchChat('group-branch');
    const branchActive=env.active(),branch=await env.manager.load(branchActive);assert.notEqual(branch.roster.rosterId,source[0].chat_metadata.lpc_companion_roster.rosterId);assert.equal(branch.roster.companions[0].companionId,a.id);
    assert.notEqual(branch.roster.companions[0].state.snapshot.chatInstanceId,source[0].chat_metadata.lpc_companion_roster.companions[0].state.snapshot.chatInstanceId);
    const view=env.manager.facade(branchActive,a.id),record=view.get();await view.commit(branchActive,{definition:record.definition,presentation:{...record.presentation,outfitId:'evening'}});
    assert.equal(env.disk.get(a.active.chatLocator)[0].chat_metadata.lpc_companion_roster.companions[0].state.presentation.outfitId,'summer');assert.equal(env.disk.get('group-branch')[0].chat_metadata.lpc_companion_roster.companions[0].state.presentation.outfitId,'evening');
});
test('roster mutation rejects account/context changes, ambiguous group ownership, member removal and failed saves',async()=>{
    const env=environment(true),a=await add(env,'A.png'),record=a.view.get(),before=structuredClone(env.disk.get(a.active.chatLocator));
    env.fail(true);await assert.rejects(a.view.commit(a.active,{definition:record.definition,presentation:{...record.presentation,outfitId:'summer'}}),/500/);assert.deepEqual(env.disk.get(a.active.chatLocator),before);assert.equal(a.view.get().presentation.outfitId,'everyday');env.fail(false);
    env.setAccount('other');await assert.rejects(a.view.commit(a.active,{definition:record.definition,presentation:record.presentation}),/Account changed/);env.setAccount('user');
    env.groups.push({id:'foreign',chat_id:a.active.chatLocator,chats:[a.active.chatLocator],members:['A.png']});await assert.rejects(env.manager.load(a.active),/multiple groups/);env.groups.pop();
    env.groups.push({id:'foreign',chat_id:a.active.chatLocator.toUpperCase(),chats:[a.active.chatLocator.toUpperCase()],members:['A.png']});await assert.rejects(env.manager.load(a.active),/multiple groups/);env.groups.pop();
    env.groups.push({id:'foreign',chat_id:'alias:chat',chats:['alias:chat'],members:['A.png']});await assert.rejects(env.manager.load(a.active),/Unsupported group chat filename/);env.groups.pop();
    env.groups[0].members=['B.png'];const changed=env.active();await env.manager.load(changed);const missing=env.manager.facade(changed,a.id);assert.match(missing.get().conflict,/no longer/);await assert.rejects(missing.commit(changed,{definition:record.definition,presentation:record.presentation}),/no longer/);assert.deepEqual(env.disk.get(a.active.chatLocator),before);
});
test('untrusted/corrupt rosters, changed source previews, reused member IDs and wrong target UUIDs cannot write',async()=>{
    const env=environment(true),active=env.active();await env.manager.load(active);const preview=await env.manager.previewSource(active,'A.png');
    env.cards[0].data.extensions.lpc_companion.definition.revision++;
    await assert.rejects(env.manager.add(active,'A.png',async()=>{},()=>true,preview.binding),/changed since/);assert.equal(env.writes.length,0);
    const a=await add(env,'A.png');await assert.rejects(env.manager.add(active,'A.png'),/already has a companion/);
    const corrupt=structuredClone(env.manager.get(active).roster);corrupt.companions[0].state.snapshot.characterId=uuid();assert.throws(()=>validateRoster(corrupt),/identity/);
    env.disk.get(active.chatLocator)[0].chat_metadata.lpc_companion_roster=null;await assert.rejects(env.manager.load(active),/Unsupported or corrupt/);
});
test('source copies require independent card identity, while confirmed member renames retain chat UUID/history',async()=>{
    const env=environment(true),a=await add(env,'A.png'),sourceId=env.cards[0].data.extensions.lpc_companion.definition.characterId;
    const copy=structuredClone(env.cards[0]);copy.avatar='Copy.png';env.cards.push(copy);env.groups[0].members.push('Copy.png');let active=env.active();await env.manager.load(active);await assert.rejects(env.manager.previewSource(active,'Copy.png'),/card copy|ambiguous/);
    env.cards.pop();env.groups[0].members=['Moved.png','B.png'];env.cards[0].avatar='Moved.png';active=env.active();await env.manager.load(active);assert.ok(env.manager.facade(active,a.id).get().conflict);
    await env.manager.rebind(active,a.id,'Moved.png');await env.manager.load(active);const moved=env.manager.facade(active,a.id).get();assert.equal(moved.conflict,null);assert.equal(moved.definition.characterId,a.id);assert.equal(moved.source.sourceCharacterId,sourceId);assert.ok(moved.source.sourceAliases.includes('A.png'));
});

test('group model patches anchor to their own accepted member response, not the last response from another member',async()=>{
    const env=environment(true),a=await add(env,'A.png'),b=await add(env,'B.png'),context=env.getContext();
    context.chat[0].original_avatar='A.png';context.chat.push({mes:'B accepted response',is_user:false,original_avatar:'B.png',swipe_id:0,swipes:['B accepted response','B alternative'],swipe_info:[{extra:{}},{extra:{}}],extra:{}});
    const first=a.view.get(),second=b.view.get();
    await assert.rejects(a.view.commit(a.active,{definition:first.definition,presentation:{...first.presentation,outfitId:'summer'},origin:'model',response:responseFingerprint(context.chat,context.chat[1])}),/accepted response/);
    await a.view.commit(a.active,{definition:first.definition,presentation:{...first.presentation,outfitId:'summer'},origin:'model',response:responseFingerprint(context.chat,context.chat[0])});
    await b.view.commit(b.active,{definition:second.definition,presentation:{...second.presentation,outfitId:'evening'},origin:'model',response:responseFingerprint(context.chat,context.chat[1])});
    const roster=env.manager.get(a.active).roster;
    assert.notDeepEqual(roster.companions[0].state.history.at(-1).response,roster.companions[1].state.history.at(-1).response);
    const alternate=structuredClone(context.chat);alternate[1].swipe_id=1;alternate[1].extra={};
    assert.equal(reconstruct(roster.companions[0].state,alternate).presentation.outfitId,'summer');assert.equal(reconstruct(roster.companions[1].state,alternate).presentation.outfitId,'everyday');
    const duplicate=structuredClone(roster);duplicate.companions[1].state.history[0].entryId=duplicate.companions[0].state.history[0].entryId;assert.throws(()=>validateRoster(duplicate),/history entry/);
});

test('failed/cancelled preparation never initializes a roster; source changes during preview are not accepted',async()=>{
    const env=environment(true),active=env.active();await env.manager.load(active);
    await assert.rejects(env.manager.add(active,'A.png',async()=>{throw Error('Missing layer');}),/Missing layer/);
    await assert.rejects(env.manager.add(active,'A.png',async()=>{},()=>false),/superseded/);
    await assert.rejects(env.manager.add(active,'A.png',async()=>{env.cards[0].data.extensions.lpc_companion.definition.revision++;}),/changed while preparing/);
    assert.equal(env.writes.length,0);assert.equal(env.getContext().chatMetadata.lpc_companion_roster,undefined);
});
test('read-back confirms lost acknowledgements; unavailable confirmation blocks all companion writers until host reload',async()=>{
    const env=environment(),active=env.active();await env.primary.load(active);const primary=env.primary.get(active);await env.primary.commit(active,{definition:primary.definition,presentation:primary.presentation,mode:'restore'});
    const a=await add(env,'A.png'),record=a.view.get();env.loseAck(true);
    await a.view.commit(active,{definition:record.definition,presentation:{...record.presentation,outfitId:'summer'}});assert.equal(a.view.get().presentation.outfitId,'summer');env.loseAck(false);
    env.failNextReadback();await assert.rejects(a.view.commit(active,{definition:record.definition,presentation:{...record.presentation,outfitId:'evening'}}),/could not be confirmed/);
    assert.equal(env.getContext().chatMetadata.lpc_companion_roster.companions[0].state.presentation.outfitId,'summer');assert.equal(env.disk.get(active.chatLocator)[0].chat_metadata.lpc_companion_roster.companions[0].state.presentation.outfitId,'evening');
    env.allowReads();const count=env.writes.length;
    await assert.rejects(env.manager.load(active),/Reload the host chat/);
    await assert.rejects(env.primary.commit(active,{definition:primary.definition,presentation:{...primary.presentation,outfitId:'summer'}}),/Reload the host chat/);
    await assert.rejects(env.primary.commit(active,{definition:primary.definition,presentation:primary.presentation,mode:'defaults'}),/Reload the host chat/);
    assert.equal(env.writes.length,count);
    env.switchChat(active.chatLocator);await env.manager.load(env.active());assert.equal(env.manager.facade(env.active(),a.id).get().presentation.outfitId,'evening');
});

test('copied group metadata requires an explicit fork and cannot mutate the original roster',async()=>{
    const env=environment(true),a=await add(env,'A.png'),initial=a.view.get(),definition=structuredClone(initial.definition);definition.revision++;
    await a.view.commit(a.active,{definition,presentation:{...initial.presentation,outfitId:'summer'},mode:'replacement'});const before=structuredClone(env.disk.get(a.active.chatLocator));
    env.disk.set('copied-chat',structuredClone(before));env.groups.push({id:'group-b',chat_id:'copied-chat',chats:['copied-chat'],members:['A.png','B.png']});
    const context=env.getContext();context.groupId='group-b';context.chatId='copied-chat';context.chatMetadata=structuredClone(before[0].chat_metadata);context.chat=structuredClone(before.slice(1));
    const active=env.active(),copy=await env.manager.load(active);assert.match(copy.conflict,/another character\/group/);
    const writes=env.writes.length;await assert.rejects(env.manager.facade(active,a.id).commit(active,{definition:a.view.get().definition,presentation:a.view.get().presentation}),/another character\/group/);assert.equal(env.writes.length,writes);
    await assert.rejects(env.manager.recover(active,'rename'),/independent roster/);await env.manager.recover(active,'fork');const fork=await env.manager.load(active);
    assert.notEqual(fork.roster.rosterId,before[0].chat_metadata.lpc_companion_roster.rosterId);assert.notEqual(fork.roster.companions[0].companionId,a.id);assert.equal(fork.conflict,null);const replay=reconstruct(fork.roster.companions[0].state,env.getContext().chat);assert.equal(replay.presentation.outfitId,'summer');assert.equal(replay.definition.characterId,fork.roster.companions[0].companionId);assert.deepEqual(env.disk.get(a.active.chatLocator),before);
});

test('a captured group save stays targeted to its original file after the user switches groups',async()=>{
    const env=environment(true),a=await add(env,'A.png'),record=a.view.get();
    const other={integrity:uuid()};env.disk.set('other-chat',[{chat_metadata:other}]);env.groups.push({id:'group-b',chat_id:'other-chat',chats:['other-chat'],members:['A.png','B.png']});
    env.setHook(async path=>{if(path!=='/api/chats/group/save')return;const context=env.getContext();context.groupId='group-b';context.chatId='other-chat';context.chatMetadata=structuredClone(other);context.chat=[];});
    await a.view.commit(a.active,{definition:record.definition,presentation:{...record.presentation,outfitId:'summer'}});
    assert.equal(env.disk.get(a.active.chatLocator)[0].chat_metadata.lpc_companion_roster.companions[0].state.presentation.outfitId,'summer');assert.deepEqual(env.disk.get('other-chat'),[{chat_metadata:other}]);assert.deepEqual(env.getContext().chatMetadata,other);
});
