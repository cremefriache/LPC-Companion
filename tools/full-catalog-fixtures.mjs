import {FULL_SOURCE_COMMIT} from '../src/catalog/full-catalog.mjs';
// Test/audit recipes only. Never silently add these defaults during import or persistence.
export function sourceFixture(metadata,itemId,bodyType='male',variant=undefined){
 const items=metadata.items,lookup=id=>items.find(i=>i.id===id),target=lookup(itemId);if(!target||!target.required.includes(bodyType))throw Error('Invalid audit target/body.');
 const selections={};const add=item=>{selections[item.type_name]={itemId:item.id,variant:item.variants[0]??null,colors:{}};};
 add(lookup('body'));const head=lookup(bodyType==='female'||bodyType==='pregnant'?'heads_human_female':'heads_human_male');add(head.required.includes(bodyType)?head:items.find(i=>i.type_name==='head'&&i.required.includes(bodyType)));add(target);if(target.id==='body_skeleton')add(lookup('heads_skeleton'));if(variant!==undefined)selections[target.type_name].variant=variant;
 for(let pass=0;pass<12;pass++){const current=Object.values(selections).map(s=>lookup(s.itemId)),tags=new Set(current.flatMap(i=>i.tags));let changed=false;for(const item of current)for(const tag of item.required_tags)if(!tags.has(tag)){const parent=items.find(i=>i.id!==item.id&&i.required.includes(bodyType)&&i.tags.includes(tag)&&(!selections[i.type_name]||lookup(selections[i.type_name].itemId).tags.length===0));if(!parent)throw Error('No audit dependency for '+item.id+': '+tag);add(parent);changed=true;}if(!changed)break;}
 return {schemaVersion:2,sourceCommit:FULL_SOURCE_COMMIT,bodyType,selections,matchBodyColor:true,applyMask:true};
}
