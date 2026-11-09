import {TEXTURED_HAIR_PIN,TEXTURED_HAIR_REPOSITORY,TEXTURED_HAIR_ACTIONS,TEXTURED_HAIR} from './textured-hair-assets.mjs';
import {BOTTOMS_PIN,BOTTOMS_REPOSITORY,BOTTOMS_ACTIONS,EVERYDAY_BOTTOMS} from './everyday-bottom-assets.mjs';
import {FOOTWEAR_PIN,FOOTWEAR_REPOSITORY,FOOTWEAR_ACTIONS,FOOTWEAR} from './footwear-assets.mjs';
import {TOPS_PIN,TOPS_REPOSITORY,TOPS_ACTIONS,EVERYDAY_TOPS} from './everyday-top-assets.mjs';
import {WOOD_SHIELD_ID,WOOD_SOURCE_ID,WOOD_PIN,WOOD_ACTIONS,WOOD_COLORS} from './wood-shield-assets.mjs';
import {NEUTRAL_FACE_ASSETS} from './neutral-face-assets.mjs';
import {IDENTITY_FEATURE_ASSETS} from './identity-feature-assets.mjs';
import {HEAD_ASSETS} from './head-assets.mjs';
import { HAIR_ASSETS } from './hair-assets.mjs';
import { BODY_ASSETS } from './body-assets.mjs';
import { WARDROBE_ASSETS } from './wardrobe-assets.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ok, getSpritePath, getSortedLayersByAnim, ANIMATION_CONFIGS } from '../vendor/lpc/lpc-core.js';

const base = new URL('../assets/lpc/', import.meta.url);
const source = JSON.parse(await readFile(new URL('source-catalog.json', base)));
const animations = {};
for (const id of ['idle', 'walk', 'run', 'jump', 'spellcast']) {
    const cycle = ANIMATION_CONFIGS[id].cycle;
    animations[id] = { frameWidth: 64, frameHeight: 64, cycle, directions: ['north', 'west', 'south', 'east'], frameMs: id === 'idle' ? 260 : 120 };
}
const slots = { body: ['body'], head: ['heads_human_male'], hair: ['hair_plain'], clothes: ['torso_clothes_tshirt', 'torso_clothes_longsleeve'], legs: ['legs_pants', 'legs_shorts'] };
for (const [id, config] of Object.entries({ ...WARDROBE_ASSETS, ...BODY_ASSETS })) (slots[config.slot] ??= []).push(id);
const items = {};
const reader = { getItemMerged: id => ok(source.items[id]) };
for (const [slot, ids] of Object.entries(slots)) for (const id of ids) {
    const meta = source.items[id];
    const config = WARDROBE_ASSETS[id] ?? BODY_ASSETS[id];
    const bodyType = config?.bodyType ?? 'male';
    const layers = getSortedLayersByAnim(reader, id).value.standard.map(layer => {
        const paths = {};
        for (const animation of (config?.animations ?? Object.keys(animations))) {
            const resolved = getSpritePath(reader, id, config?.variant ?? null, !config?.original, bodyType, animation, layer.layerNum, {}, meta);
            if (resolved.isErr()) throw Error(`Cannot resolve ${id}`);
            paths[animation] = resolved.value;
        }
        return { z: layer.zPos, required: true, paths };
    });
    if (config?.requiredLayerCount && layers.length !== config.requiredLayerCount) throw Error(`Missing required metadata layer: ${id}`);
    items[id] = { name: config?.name ?? meta.name, slot, bodyTypes: config?.bodyType ? [bodyType] : (id === 'hair_plain' || WARDROBE_ASSETS[id]) ? ['male', 'female'] : ['male'], counterparts: config?.counterpart ? { male: config.counterpart, female: id } : {}, material: config?.original ? 'original' : ['body', 'head'].includes(slot) ? 'body' : slot === 'hair' ? 'hair' : 'cloth', layers, requiredLayerCount: config?.requiredLayerCount ?? layers.length, sourcePalette: config?.original ? null : meta.recolors?.base ?? (['body', 'head'].includes(slot) ? 'light' : slot === 'hair' ? 'orange' : 'white'), occupies: config?.occupies ?? [slot], requires: config?.requires ?? {}, conflictsWith: config?.conflictsWith ?? [], credits: meta.credits };
}
for (const [id, config] of Object.entries(BODY_ASSETS)) items[config.counterpart].counterparts = { male: config.counterpart, female: id };
// Shared artwork is exposed to both profiles only when upstream resolves the exact same required paths.
for (const [id, item] of Object.entries(items)) if (item.bodyTypes.length > 1) {
    const meta = source.items[id], config = WARDROBE_ASSETS[id];
    const sourceLayers = getSortedLayersByAnim(reader, id).value.standard;
    for (const layer of sourceLayers) for (const animation of Object.keys(item.layers[0].paths)) {
        const female = getSpritePath(reader, id, config?.variant ?? null, !config?.original, 'female', animation, layer.layerNum, {}, meta);
        const male = getSpritePath(reader, id, config?.variant ?? null, !config?.original, 'male', animation, layer.layerNum, {}, meta);
        if (female.isErr() || male.isErr() || female.value !== male.value) throw Error(`Unverified shared body artwork: ${id}`);
    }
}
const catalog = {
    version: 'lpc-curated-v1', bodyTypes: ['male', 'female'], upstreamCommit: '7736d762aa2113f29342dad869ef4931218aa7ae',
    slots, animations, items, palettes: source.palettes,
    paletteChoices: { original: ['original'], body: ['light', 'amber', 'olive', 'bronze', 'brown', 'black'], hair: ['orange', 'dark_brown', 'black', 'blonde', 'gray', 'white', 'pink', 'blue'], cloth: ['white', 'teal', 'navy', 'maroon', 'yellow', 'forest', 'charcoal', 'blue', 'red', 'black'] },
    sourcePalettes: { body: 'light', hair: 'orange', cloth: 'white' },
};
// Adopt only the reviewed sit/emote asset vocabulary. Behavior remains explicitly allowlisted.
const activity = JSON.parse(await readFile(new URL('activity-assets.proposed.json',base)));
const activityProvenance=JSON.parse(await readFile(new URL('../vendor/lpc/activity-provenance.json',new URL('../',base))));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if(activity.upstreamCommit!==catalog.upstreamCommit||activityProvenance.commit!==catalog.upstreamCommit||activity.baseCatalogSha256!==digest(Buffer.from(JSON.stringify(catalog,null,2)+'\n')))throw Error('Activity assets do not match the pinned base catalog.');
if(Object.keys(activity.animations).sort().join(',')!=='emote,sit'||Object.keys(activity.items).length!==13||Object.keys(activityProvenance.sprites).length!==26)throw Error('Unreviewed activity asset vocabulary.');
// Apply decoded-coverage restrictions after checking the immutable pre-adoption catalog.
for(const [id,config]of Object.entries(WARDROBE_ASSETS))if(config.unavailableAnimations)items[id].unavailableAnimations=structuredClone(config.unavailableAnimations);
Object.assign(animations,activity.animations);
for(const [id,extra]of Object.entries(activity.items)){
 const item=items[id];if(!item||JSON.stringify(item.bodyTypes)!==JSON.stringify(extra.bodyTypes)||JSON.stringify(item.credits)!==JSON.stringify(extra.credits)||extra.layers.length!==item.requiredLayerCount)throw Error('Activity item compatibility/credits changed.');
 extra.layers.forEach((layer,index)=>{if(layer.z!==item.layers[index].z||!layer.required||Object.keys(layer.paths).sort().join(',')!=='emote,sit')throw Error('Activity layer contract changed.');Object.assign(item.layers[index].paths,layer.paths);});
}
// Additional styles are adopted AFTER the immutable activity base witness is checked.
for(const item of Object.values(items))item.selectedLicense='OGA-BY 3.0';
const hair=JSON.parse(await readFile(new URL('../vendor/lpc/hair-provenance.json',new URL('../',base))));
if(hair.commit!==catalog.upstreamCommit||Object.keys(hair.items).sort().join(',')!==Object.keys(HAIR_ASSETS).sort().join(',')||Object.keys(hair.sprites).length!==Object.keys(HAIR_ASSETS).length*7)throw Error('Unreviewed hair vocabulary.');
const legal=await readFile(new URL('../vendor/lpc/LICENSE-CC0-1.0.txt',new URL('../',base)));if(digest(legal)!==hair.legalText.sha256)throw Error('CC0 notice hash mismatch.');
for(const [id,config]of Object.entries(HAIR_ASSETS)){
 const record=hair.metadata['sheet_definitions/'+config.file],raw=await readFile(new URL('../vendor/lpc/hair-source/'+id+'.json',new URL('../',base)));
 if(!record||digest(raw)!==record.sha256||JSON.stringify(JSON.parse(raw))!==JSON.stringify(record.original))throw Error('Changed hair metadata.');
 const meta={...record.original,layers:Object.fromEntries(Object.entries(record.original).filter(([key])=>/^layer_\d+$/.test(key)))};
 const item=hair.items[id];if(JSON.stringify(item.sourceColorAliases)!==JSON.stringify(config.sourceColorAliases)||item.selectedLicense!==config.selectedLicense||item.material!=='hair'||item.slot!=='hair'||item.requiredLayerCount!==1||item.layers.length!==1||item.layers[0].z!==120||JSON.stringify(item.bodyTypes)!==JSON.stringify(['male','female'])||JSON.stringify(item.credits)!==JSON.stringify(meta.credits)||item.sourcePalette!==(meta.recolors?.base??'orange'))throw Error('Changed hair compatibility/attribution.');
 for(const action of Object.keys(animations))for(const body of ['male','female']){const path=getSpritePath(reader,id,null,true,body,action,1,{},meta);if(path.isErr()||path.value!==item.layers[0].paths[action])throw Error('Unverified hair path/body mapping.');}
 items[id]=item;slots.hair.push(id);
}
const heads=JSON.parse(await readFile(new URL('../vendor/lpc/head-provenance.json',new URL('../',base))));
if(heads.commit!==catalog.upstreamCommit||Object.keys(heads.items).sort().join(',')!==Object.keys(HEAD_ASSETS).sort().join(',')||Object.keys(heads.sprites).length!==14)throw Error('Unreviewed head vocabulary.');
for(const [id,config]of Object.entries(HEAD_ASSETS)){
 const record=heads.metadata['sheet_definitions/'+config.file],raw=await readFile(new URL('../vendor/lpc/head-source/'+id+'.json',new URL('../',base)));
 if(!record||digest(raw)!==record.sha256||JSON.stringify(JSON.parse(raw))!==JSON.stringify(record.original))throw Error('Changed head metadata.');
 const meta={...record.original,layers:Object.fromEntries(Object.entries(record.original).filter(([key])=>/^layer_\d+$/.test(key)))};
 const item=heads.items[id],other=config.bodyType==='male'?'female':'male';
 if(item.selectedLicense!=='OGA-BY 3.0'||item.material!=='body'||item.slot!=='head'||item.requiredLayerCount!==1||item.layers.length!==1||item.layers[0].z!==100||JSON.stringify(item.bodyTypes)!==JSON.stringify([config.bodyType])||JSON.stringify(item.counterparts)!==JSON.stringify({[config.bodyType]:id,[other]:config.counterpart})||JSON.stringify(item.credits)!==JSON.stringify(meta.credits)||item.sourcePalette!==(meta.recolors?.base??'light'))throw Error('Changed head compatibility/attribution.');
 for(const action of Object.keys(animations)){const path=getSpritePath(reader,id,null,true,config.bodyType,action,1,{},meta);if(path.isErr()||path.value!==item.layers[0].paths[action])throw Error('Unverified head path/body mapping.');}
 items[id]=item;slots.head.push(id);
}
const features=JSON.parse(await readFile(new URL('../vendor/lpc/identity-feature-provenance.json',new URL('../',base))));
if(features.commit!==catalog.upstreamCommit||Object.keys(features.items).sort().join(',')!==Object.keys(IDENTITY_FEATURE_ASSETS).sort().join(',')||Object.keys(features.sprites).length!==14)throw Error('Unreviewed identity feature vocabulary.');
for(const [id,config]of Object.entries(IDENTITY_FEATURE_ASSETS)){
 const record=features.metadata['sheet_definitions/'+config.file],raw=await readFile(new URL('../vendor/lpc/identity-feature-source/'+id+'.json',new URL('../',base)));
 if(!record||digest(raw)!==record.sha256||JSON.stringify(JSON.parse(raw))!==JSON.stringify(record.original))throw Error('Changed identity feature metadata.');
 const meta={...record.original,layers:Object.fromEntries(Object.entries(record.original).filter(([key])=>/^layer_\d+$/.test(key)))};
 const item=features.items[id];if(item.selectedLicense!==config.selectedLicense||item.material!==config.material||item.slot!==config.slot||item.requiredLayerCount!==1||item.layers.length!==1||item.layers[0].z!==config.z||JSON.stringify(item.bodyTypes)!==JSON.stringify(['male','female'])||JSON.stringify(item.counterparts)!=='{}'||JSON.stringify(item.credits)!==JSON.stringify(meta.credits)||item.sourcePalette!==config.sourcePalette)throw Error('Changed identity feature compatibility/attribution.');
 for(const action of Object.keys(animations))for(const body of ['male','female']){const path=getSpritePath(reader,id,null,true,body,action,1,{},meta);if(path.isErr()||path.value!==item.layers[0].paths[action])throw Error('Unverified identity feature path/body mapping.');}
 items[id]=item;slots[config.slot]=[id];
}
const faces=JSON.parse(await readFile(new URL('../vendor/lpc/neutral-face-provenance.json',new URL('../',base))));
if(faces.commit!==catalog.upstreamCommit||Object.keys(faces.items).sort().join(',')!==Object.keys(NEUTRAL_FACE_ASSETS).sort().join(',')||Object.keys(faces.sprites).length!==21)throw Error('Unreviewed face vocabulary.');
for(const [id,config]of Object.entries(NEUTRAL_FACE_ASSETS)){
 const record=faces.metadata['sheet_definitions/head/faces/face_neutral.json'],raw=await readFile(new URL('../vendor/lpc/neutral-face-source/'+id+'.json',new URL('../',base)));
 if(!record||digest(raw)!==record.sha256||JSON.stringify(JSON.parse(raw))!==JSON.stringify(record.original))throw Error('Changed neutral metadata.');
 const item=faces.items[id];if(item.selectedLicense!=='OGA-BY 3.0'||item.slot!=='expression'||item.material!=='body'||item.sourcePalette!=='light'||JSON.stringify(item.bodyTypes)!==JSON.stringify(config.bodyTypes)||JSON.stringify(item.counterparts)!==JSON.stringify(config.counterparts)||JSON.stringify(item.requires)!==JSON.stringify({head:config.heads})||item.layers.length!==1||item.layers[0].z!==101||item.requiredLayerCount!==1||JSON.stringify(item.credits)!==JSON.stringify(record.original.credits))throw Error('Changed neutral contract.');
 for(const action of Object.keys(animations))if(item.layers[0].paths[action]!==`spritesheets/head/faces/${config.family}/neutral/${action}.png`)throw Error('Unverified neutral path.');
 items[id]=item;(slots.expression??=[]).push(id);
}
// Adopt official Wood artwork separately; never alter the fixed-Brown base witness.
const wood=JSON.parse(await readFile(new URL('../vendor/lpc/wood-shield-provenance.json',new URL('../',base))));
const woodRaw={};
for(const [name,file]of [['item','sheet_definitions/weapons/shields/heater/shield_heater_revised_wood.json'],['palettes','palette_definitions/wood/wood_ulpc.json'],['material','palette_definitions/wood/meta_wood.json']]){const bytes=await readFile(new URL('../vendor/lpc/wood-shield-source/'+name+'.json',new URL('../',base)));if(digest(bytes)!==wood.metadata[file])throw Error('Changed official Wood metadata.');woodRaw[name]=JSON.parse(bytes);}
if(wood.commit!==WOOD_PIN||wood.sourceId!==WOOD_SOURCE_ID||woodRaw.item.type_name!=='shield'||woodRaw.item.recolors.material!=='wood'||woodRaw.material.base!=='maple'||Object.keys(woodRaw.palettes).join(',')!==WOOD_COLORS.join(',')||Object.keys(wood.sprites).length!==10)throw Error('Unreviewed Wood vocabulary.');
const woodItem=wood.item;
if(woodItem.slot!=='prop'||woodItem.material!=='wood'||woodItem.sourcePalette!=='maple'||woodItem.selectedLicense!=='OGA-BY 3.0'||JSON.stringify(woodItem.bodyTypes)!=='["male","female"]'||woodItem.requiredLayerCount!==2||woodItem.layers.length!==2||JSON.stringify(woodItem.credits)!==JSON.stringify(woodRaw.item.credits)||JSON.stringify(woodItem.occupies)!=='["left_hand"]'||JSON.stringify(woodItem.requires)!=='{}'||JSON.stringify(woodItem.conflictsWith)!=='[]'||Object.keys(woodItem.unavailableAnimations??{}).join(',')!=='spellcast')throw Error('Changed Wood compatibility/credits.');
for(const [index,layer]of woodItem.layers.entries()){const original=woodRaw.item['layer_'+(index+1)];if(layer.z!==[2,110][index]||layer.z!==original.zPos||!layer.required||original.male!==original.female||Object.keys(layer.paths).join(',')!==WOOD_ACTIONS.join(','))throw Error('Changed Wood layers.');for(const action of WOOD_ACTIONS)if(layer.paths[action]!==`spritesheets/${original.male}${action}.png`)throw Error('Changed Wood source path.');}
for(const shades of Object.values(woodRaw.palettes))if(shades.length!==6||shades.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw Error('Changed Wood palette layout.');
items[WOOD_SHIELD_ID]={...woodItem,upstreamSource:{repository:wood.repository,commit:wood.commit,itemId:wood.sourceId}};slots.prop.push(WOOD_SHIELD_ID);
catalog.palettes.wood=woodRaw.palettes;catalog.paletteChoices.wood=WOOD_COLORS;catalog.sourcePalettes.wood='maple';
// One coherent clothes batch; each source definition has explicit profile-specific local IDs.
const tops=JSON.parse(await readFile(new URL('../vendor/lpc/everyday-top-provenance.json',new URL('../',base))));
if(tops.repository!==TOPS_REPOSITORY||tops.commit!==TOPS_PIN||Object.keys(tops.metadata).length!==4||Object.keys(tops.sprites).length!==42||Object.keys(tops.items).length!==6)throw Error('Unreviewed Everyday Tops vocabulary.');
const topPaletteBytes=await readFile(new URL('../vendor/lpc/everyday-top-source/palettes.json',new URL('../',base))),topPalettes=JSON.parse(topPaletteBytes);
if(digest(topPaletteBytes)!==tops.metadata['palette_definitions/cloth/cloth_ulpc.json']||catalog.paletteChoices.cloth.some(color=>JSON.stringify(catalog.palettes.cloth[color])!==JSON.stringify(topPalettes[color])))throw Error('Changed Everyday Tops palettes.');
for(const [sourceId,config]of Object.entries(EVERYDAY_TOPS)){
 const raw=await readFile(new URL('../vendor/lpc/everyday-top-source/'+sourceId+'.json',new URL('../',base))),meta=JSON.parse(raw);
 if(digest(raw)!==tops.metadata['sheet_definitions/'+config.file]||meta.type_name!=='clothes'||meta.layer_1.zPos!==35||meta.layer_2||meta.recolors.material!=='cloth'||(meta.recolors.base??'white')!=='white')throw Error('Changed Everyday Tops metadata.');
 for(const body of ['male','female']){const id=sourceId+(body==='female'?'_female':''),paths=Object.fromEntries(TOPS_ACTIONS.map(action=>{if(!meta.animations.includes(action))throw Error('Unavailable pack action.');return [action,'spritesheets/'+meta.layer_1[body]+action+'.png'];}));
 const expected={name:config.name+(body==='female'?' (female)':''),slot:'clothes',bodyTypes:[body],counterparts:{male:sourceId,female:sourceId+'_female'},material:'cloth',sourcePalette:'white',selectedLicense:'OGA-BY 3.0',layers:[{z:35,required:true,paths}],requiredLayerCount:1,occupies:['clothes'],requires:{},conflictsWith:[],credits:meta.credits,upstreamSource:{repository:TOPS_REPOSITORY,commit:TOPS_PIN,itemId:sourceId,bodyType:body}};
 if(JSON.stringify(tops.items[id])!==JSON.stringify(expected))throw Error('Changed Everyday Tops profile/layer/credit contract.');items[id]=tops.items[id];slots.clothes.push(id);
 }
}
catalog.paletteChoices.cloth.push('brown');
// Optional footwear batch; each source definition has explicit profile-specific local IDs.
const footwear=JSON.parse(await readFile(new URL('../vendor/lpc/footwear-provenance.json',new URL('../',base))));
if(footwear.repository!==FOOTWEAR_REPOSITORY||footwear.commit!==FOOTWEAR_PIN||Object.keys(footwear.metadata).length!==4||Object.keys(footwear.sprites).length!==42||Object.keys(footwear.items).length!==6)throw Error('Unreviewed Footwear vocabulary.');
const footPaletteBytes=await readFile(new URL('../vendor/lpc/footwear-source/palettes.json',new URL('../',base))),footPalettes=JSON.parse(footPaletteBytes);
if(digest(footPaletteBytes)!==footwear.metadata['palette_definitions/cloth/cloth_ulpc.json']||catalog.paletteChoices.cloth.some(color=>JSON.stringify(catalog.palettes.cloth[color])!==JSON.stringify(footPalettes[color])))throw Error('Changed Footwear palettes.');
for(const [sourceId,config]of Object.entries(FOOTWEAR)){
 const raw=await readFile(new URL('../vendor/lpc/footwear-source/'+sourceId+'.json',new URL('../',base))),meta=JSON.parse(raw);
 if(digest(raw)!==footwear.metadata['sheet_definitions/'+config.file]||meta.type_name!=='shoes'||meta.layer_1.zPos!==config.z||meta.layer_2||meta.recolors.material!=='cloth'||(meta.recolors.base??'white')!=='white')throw Error('Changed Footwear metadata.');
 for(const body of ['male','female']){const id=sourceId+(body==='female'?'_female':''),paths=Object.fromEntries(FOOTWEAR_ACTIONS.map(action=>{if(!meta.animations.includes(action))throw Error('Unavailable pack action.');return [action,'spritesheets/'+meta.layer_1[body]+action+'.png'];}));
 const expected={name:config.name+(body==='female'?' (female)':''),slot:'shoes',bodyTypes:[body],counterparts:{male:sourceId,female:sourceId+'_female'},material:'cloth',sourcePalette:'white',selectedLicense:'OGA-BY 3.0',layers:[{z:config.z,required:true,paths}],requiredLayerCount:1,occupies:['feet'],requires:{},conflictsWith:[],credits:meta.credits,upstreamSource:{repository:FOOTWEAR_REPOSITORY,commit:FOOTWEAR_PIN,itemId:sourceId,bodyType:body}};
 if(JSON.stringify(footwear.items[id])!==JSON.stringify(expected))throw Error('Changed Footwear profile/layer/credit contract.');items[id]=footwear.items[id];(slots.shoes??=[]).push(id);
 }
}
// Everyday bottoms batch; each source definition has explicit profile-specific local IDs.
const bottoms=JSON.parse(await readFile(new URL('../vendor/lpc/everyday-bottom-provenance.json',new URL('../',base))));
if(bottoms.repository!==BOTTOMS_REPOSITORY||bottoms.commit!==BOTTOMS_PIN||Object.keys(bottoms.metadata).length!==4||Object.keys(bottoms.sprites).length!==42||Object.keys(bottoms.items).length!==6)throw Error('Unreviewed Everyday Bottoms vocabulary.');
const bottomPaletteBytes=await readFile(new URL('../vendor/lpc/everyday-bottom-source/palettes.json',new URL('../',base))),bottomPalettes=JSON.parse(bottomPaletteBytes);
if(digest(bottomPaletteBytes)!==bottoms.metadata['palette_definitions/cloth/cloth_ulpc.json']||catalog.paletteChoices.cloth.some(color=>JSON.stringify(catalog.palettes.cloth[color])!==JSON.stringify(bottomPalettes[color])))throw Error('Changed Everyday Bottoms palettes.');
for(const [sourceId,config]of Object.entries(EVERYDAY_BOTTOMS)){
 const raw=await readFile(new URL('../vendor/lpc/everyday-bottom-source/'+sourceId+'.json',new URL('../',base))),meta=JSON.parse(raw);
 if(digest(raw)!==bottoms.metadata['sheet_definitions/'+config.file]||meta.type_name!=='legs'||meta.layer_1.zPos!==20||meta.layer_2||meta.recolors.material!=='cloth'||(meta.recolors.base??'white')!=='white')throw Error('Changed Everyday Bottoms metadata.');
 for(const body of ['male','female']){const id=sourceId+(body==='female'?'_female':''),paths=Object.fromEntries(BOTTOMS_ACTIONS.map(action=>{if(!meta.animations.includes(action))throw Error('Unavailable pack action.');return [action,'spritesheets/'+meta.layer_1[body]+action+'.png'];}));
 const expected={name:config.name+(body==='female'?' (female)':''),slot:'legs',bodyTypes:[body],counterparts:{male:sourceId,female:sourceId+'_female'},material:'cloth',sourcePalette:'white',selectedLicense:'OGA-BY 3.0',layers:[{z:20,required:true,paths}],requiredLayerCount:1,occupies:['legs'],requires:{},conflictsWith:[],credits:meta.credits,upstreamSource:{repository:BOTTOMS_REPOSITORY,commit:BOTTOMS_PIN,itemId:sourceId,bodyType:body}};
 if(JSON.stringify(bottoms.items[id])!==JSON.stringify(expected))throw Error('Changed Everyday Bottoms profile/layer/credit contract.');items[id]=bottoms.items[id];slots.legs.push(id);
 }
}
// Shared-profile textured hair, independently pinned to the official generator.
const texture=JSON.parse(await readFile(new URL('../vendor/lpc/textured-hair-provenance.json',new URL('../',base))));
if(texture.repository!==TEXTURED_HAIR_REPOSITORY||texture.commit!==TEXTURED_HAIR_PIN||Object.keys(texture.metadata).length!==3||Object.keys(texture.sprites).length!==14||Object.keys(texture.items).length!==2)throw Error('Unreviewed textured hair vocabulary.');
const texturePaletteBytes=await readFile(new URL('../vendor/lpc/textured-hair-source/palettes.json',new URL('../',base))),texturePalettes=JSON.parse(texturePaletteBytes);
if(digest(texturePaletteBytes)!==texture.metadata['palette_definitions/hair/hair_ulpc.json']||catalog.paletteChoices.hair.some(color=>JSON.stringify(catalog.palettes.hair[color])!==JSON.stringify(texturePalettes[color])))throw Error('Changed textured hair palettes.');
for(const [id,config]of Object.entries(TEXTURED_HAIR)){
 const raw=await readFile(new URL('../vendor/lpc/textured-hair-source/'+id+'.json',new URL('../',base))),meta=JSON.parse(raw);
 if(digest(raw)!==texture.metadata['sheet_definitions/'+config.file]||meta.type_name!=='hair'||meta.layer_1.zPos!==120||meta.layer_2||meta.layer_1.male!==meta.layer_1.female||meta.recolors.material!=='hair'||(meta.recolors.base??'orange')!=='orange'||!meta.credits.every(c=>c.licenses.includes(config.selectedLicense)&&c.authors.length&&c.urls.length))throw Error('Changed textured hair metadata.');
 const paths=Object.fromEntries(TEXTURED_HAIR_ACTIONS.map(action=>{if(!meta.animations.includes(action))throw Error('Unavailable hair action.');return [action,'spritesheets/'+meta.layer_1.male+action+'.png'];}));
 const expected={name:config.name,slot:'hair',bodyTypes:['male','female'],counterparts:{},material:'hair',sourcePalette:'orange',selectedLicense:config.selectedLicense,layers:[{z:120,required:true,paths}],requiredLayerCount:1,occupies:['hair'],requires:{},conflictsWith:[],credits:meta.credits,upstreamSource:{repository:TEXTURED_HAIR_REPOSITORY,commit:TEXTURED_HAIR_PIN,itemId:id}};
 if(JSON.stringify(texture.items[id])!==JSON.stringify(expected))throw Error('Changed textured hair profile/layer/credit contract.');items[id]=texture.items[id];slots.hair.push(id);
}
const hashes = {};
for (const item of Object.values(items)) for (const layer of item.layers) for (const [id, file] of Object.entries(layer.paths)) {
    if (!/^spritesheets\/[a-z0-9_/-]+\.png$/.test(file)) throw Error('Unsafe catalog path');
    if (!item.credits.some(credit => file.startsWith(`spritesheets/${credit.file}/`) && credit.licenses?.includes(item.selectedLicense) && credit.authors?.length && credit.urls?.length)) throw Error(`Missing selected artwork attribution/license: ${file}`);
    const bytes = await readFile(new URL(file, base));
    hashes[file] = createHash('sha256').update(bytes).digest('hex');
    const layout = animations[id];
    if (bytes.readUInt32BE(16) !== (Math.max(...layout.cycle) + 1) * layout.frameWidth || bytes.readUInt32BE(20) !== layout.directions.length * layout.frameHeight) throw Error(`Unexpected sheet dimensions: ${file}`);
}
for(const [file,expected]of Object.entries(faces.sprites))if(hashes[file]!==expected)throw Error(`Neutral face hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(features.sprites))if(hashes[file]!==expected)throw Error(`Identity feature hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(heads.sprites))if(hashes[file]!==expected)throw Error(`Head source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(hair.sprites))if(hashes[file]!==expected)throw Error(`Hair source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(activityProvenance.sprites))if(hashes[file]!==expected)throw Error(`Activity source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(wood.sprites))if(hashes[file]!==expected)throw Error(`Wood source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(tops.sprites))if(hashes[file]!==expected)throw Error(`Everyday top source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(footwear.sprites))if(hashes[file]!==expected)throw Error(`Footwear source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(bottoms.sprites))if(hashes[file]!==expected)throw Error(`Bottoms source hash mismatch: ${file}`);
for(const [file,expected]of Object.entries(texture.sprites))if(hashes[file]!==expected)throw Error('Textured hair source hash mismatch: '+file);
await writeFile(new URL('catalog.json', base), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(new URL('pack-manifest.json', base), `${JSON.stringify({ upstreamCommit: catalog.upstreamCommit, additionalSources: [{repository:wood.repository,commit:wood.commit,itemId:WOOD_SHIELD_ID,sourceItemId:wood.sourceId,files:Object.keys(wood.sprites)},{repository:tops.repository,commit:tops.commit,itemIds:Object.keys(tops.items),files:Object.keys(tops.sprites)},{repository:footwear.repository,commit:footwear.commit,itemIds:Object.keys(footwear.items),files:Object.keys(footwear.sprites)},{repository:bottoms.repository,commit:bottoms.commit,itemIds:Object.keys(bottoms.items),files:Object.keys(bottoms.sprites)},{repository:texture.repository,commit:texture.commit,itemIds:Object.keys(texture.items),files:Object.keys(texture.sprites)}], files: hashes }, null, 2)}\n`);
console.log(`Verified ${Object.keys(items).length} items and ${Object.keys(hashes).length} actual animation sheets.`);
