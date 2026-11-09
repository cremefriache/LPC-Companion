import { readChatContext } from './context.mjs';
export const ROSTER_KEY='lpc_companion_roster';
export const locator=value=>typeof value==='string'&&value.length>0&&value.length<=255&&value!=='.'&&value!=='..'&&!/[\\/\0]/.test(value);
// The host sanitizes the filename after appending .jsonl. Reject aliases instead
// of guessing the physical target; reserve six bytes for that extension.
export const groupLocator=value=>locator(value)&&new TextEncoder().encode(value).byteLength<=249&&!/[<>:"|?*\u0000-\u001f\u007f]/.test(value)&&!/[. ]$/.test(value)&&!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i.test(value);
export const groupFileKey=value=>value.normalize('NFC').toLowerCase();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readRosterContext(context) {
    const ordinary=readChatContext(context);
    if(ordinary)return Object.freeze({...ordinary,kind:'character',ownerId:ordinary.characterAvatar});
    if(!context||context.groupId===undefined||context.groupId===null||!Array.isArray(context.groups))return null;
    const id=String(context.groupId),group=context.groups.find(item=>String(item.id)===id);
    if(!groupLocator(id)||!group||!groupLocator(group.chat_id)||context.chatId!==group.chat_id
        ||context.getCurrentChatId?.()!==group.chat_id||!uuid.test(context.chatMetadata?.integrity??'')
        ||!Array.isArray(group.members)||group.members.length>200||!group.members.every(locator)||new Set(group.members).size!==group.members.length)return null;
    return Object.freeze({kind:'group',ownerId:id,chatLocator:group.chat_id,integrity:context.chatMetadata.integrity,members:[...group.members].sort()});
}
export const rosterKey=active=>JSON.stringify([active.kind,active.ownerId,active.chatLocator,active.integrity,active.members??[]]);
