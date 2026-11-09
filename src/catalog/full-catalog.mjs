import {layoutPreparation,layoutPolicyVersion} from './source-layout-preparation.mjs';
import {attachNativeSourcePreparation,nativeRepairVersion} from './source-native-repairs.mjs';
import {attachHurtSourcePreparation} from './source-hurt-phases.mjs';
import {reviewedSourcePhase,sourcePhaseVersion} from './source-phases.mjs';
import {sourceAliases,sourcePathProblem,sourceInactiveColor,sourceNeedsColorPolicy,sourceLayerColorCorrection,sourceLayerPolicyVersion,sourceSharedPhysicalColor,sourceExtraShadeTarget,sourceRenderingReferenceIds} from './source-policy.mjs';
import {fullRecipeStructure} from './full-structure.mjs';
import {ok,err,getSpritePath,replaceInPath,parseRecolorKey,getBasePalette,getTargetPalette,getMultiRecolors,ANIMATION_CONFIGS,customAnimations,customAnimationBase,customAnimationSize} from '../../vendor/lpc/full-catalog/core.mjs';
export const FULL_SOURCE_COMMIT='86160e7507d6841259cff624a51a63c1d4847ee3';
const directions=['north','west','south','east'],own=(v,k)=>Object.hasOwn(v,k),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),safePath=p=>typeof p==='string'&&/^spritesheets\/[A-Za-z0-9_/-]+\.png$/.test(p)&&!p.split('/').includes('..');
export class FullCatalogError extends Error{constructor(code,message,details={}){super(message);this.name='FullCatalogError';this.code=code;this.details=details;}}
const fail=(code,message,details)=>{throw new FullCatalogError(code,message,details);};
const physical=action=>({watering:'thrust',combat:'combat_idle','1h_slash':'backslash','1h_backslash':'backslash','1h_halfslash':'halfslash'}[action]??action);
const supports=(item,action)=>item.animations.some(a=>physical(a)===physical(action));

/** Trusted compiled metadata/artwork in; untrusted recipe IDs and colors validated at every plan. */
export function createFullCatalog({metadata,assets,repairs=null}){
 if(metadata?.commit!==FULL_SOURCE_COMMIT||metadata.kind!=='pinned-source-metadata')fail('wrong_source','Unreviewed full source catalog.');
 const items=new Map(metadata.items.map(i=>[i.id,i])),slots=new Set(metadata.items.map(i=>i.type_name)),bodies=new Set(metadata.items.flatMap(i=>i.required)),byTypeName=Object.create(null),files=new Map();
 for(const item of metadata.items)(byTypeName[item.type_name]??=[]).push(item);
 for(const asset of assets){if(!safePath(asset.path)||! /^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<1||asset.height<1)fail('invalid_asset','Invalid compiled source asset.');if(files.has(asset.path))fail('invalid_asset','Duplicate compiled source asset.');files.set(asset.path,Object.freeze({path:asset.path,sha256:asset.sha256,width:asset.width,height:asset.height}));}
 const repairRules=repairs?.repairs??[];if(repairs&&(repairs.commit!==FULL_SOURCE_COMMIT||repairs.kind!=='reviewed-source-repairs'))fail('wrong_source','Unreviewed source corrections.');
 const reader={getItemMerged:id=>items.has(id)?ok(items.get(id)):err({kind:'not-found',id}),getItemLite:id=>items.has(id)?ok(items.get(id)):err({kind:'not-found',id}),getAliasMetadata:()=>ok(metadata.aliases),getMetadataIndexes:()=>ok({byTypeName}),getPaletteMetadata:()=>ok(metadata.palettes)};
 function colorChoice(item,channel,value){
  if(typeof value!=='string'||value.length>96)fail('invalid_palette','Expected an available palette ID.');
  const [material,family,color]=parseRecolorKey(reader,value,channel),paletteFamily=(material??channel.material)+'.'+family;
  if(!own(channel.palettes,paletteFamily)||!channel.palettes[paletteFamily].includes(color))fail('invalid_palette','Unavailable '+channel.label+' palette.',{itemId:item.id,value});
  const target=getTargetPalette(reader,channel.material,value),base=getBasePalette(reader,channel.material,channel.base,channel.source??null);
  if(target.isErr()||base.isErr()||!base.value[2]?.length||target.value.length<base.value[2].length)fail('invalid_palette','Incompatible source/target palette lengths.',{itemId:item.id,value});
  return {id:paletteFamily+'.'+color,source:[...base.value[2]],target:[...target.value]};
 }
 const variantPaletteLookup=Object.create(null);
 for(const mat of ['cloth','metal','wood','hair','body','eye','all']){
  const families=metadata.palettes?.materials?.[mat]?.palettes??{};
  for(const fam of ['ulpc','lpcr','custom',...Object.keys(families)]){
   for(const [name,ramp]of Object.entries(families[fam]??{})){
    if(!variantPaletteLookup[name]&&Array.isArray(ramp)&&ramp.length)variantPaletteLookup[name]=[...ramp];
   }
  }
 }
 const variantPaletteAliases=Object.freeze({
  darkblue:variantPaletteLookup.navy,
  lightblue:variantPaletteLookup.sky,
  coal:variantPaletteLookup.charcoal,
  dark:variantPaletteLookup.charcoal,
  tin:variantPaletteLookup.steel,
  base:variantPaletteLookup.tan??variantPaletteLookup.walnut,
  sunglasses:variantPaletteLookup.charcoal,
  pirate:variantPaletteLookup.black,
  crusader:variantPaletteLookup.white,
  spartan:variantPaletteLookup.bronze,
  scutum:variantPaletteLookup.red,
  scutum_trim:variantPaletteLookup.gold,
  plus:variantPaletteLookup.red,
  two_engrailed:variantPaletteLookup.blue,
  two_engrailed_trim:variantPaletteLookup.gold,
  jack:variantPaletteLookup.orange,
  quiver:variantPaletteLookup.leather??variantPaletteLookup.brown,
  round:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  square:variantPaletteLookup.steel??variantPaletteLookup.gray,
  '3_logs':variantPaletteLookup.brown??variantPaletteLookup.walnut,
  '9_logs':variantPaletteLookup.brown??variantPaletteLookup.walnut,
  club:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  wand:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  cane:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  boomerang:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  arrow:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  crossbow:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  slingshot:variantPaletteLookup.brown??variantPaletteLookup.walnut,
  flail:variantPaletteLookup.steel??variantPaletteLookup.iron,
  mace:variantPaletteLookup.steel??variantPaletteLookup.iron,
  waraxe:variantPaletteLookup.steel??variantPaletteLookup.iron,
  medium:variantPaletteLookup.steel??variantPaletteLookup.iron,
  simple:variantPaletteLookup.steel??variantPaletteLookup.iron,
  halberd:variantPaletteLookup.steel??variantPaletteLookup.iron,
  scythe:variantPaletteLookup.steel??variantPaletteLookup.iron,
  dagger:variantPaletteLookup.steel??variantPaletteLookup.iron,
  katana:variantPaletteLookup.steel??variantPaletteLookup.iron,
  longsword:variantPaletteLookup.steel??variantPaletteLookup.iron,
  longsword_alt:variantPaletteLookup.steel??variantPaletteLookup.iron,
  rapier:variantPaletteLookup.steel??variantPaletteLookup.iron,
  saber:variantPaletteLookup.steel??variantPaletteLookup.iron,
  scimitar:variantPaletteLookup.steel??variantPaletteLookup.iron,
  dragonfly:variantPaletteLookup.sky??variantPaletteLookup.teal,
  lunar:variantPaletteLookup.green??variantPaletteLookup.forest,
  monarch:variantPaletteLookup.orange,
  pixie:variantPaletteLookup.pink??variantPaletteLookup.lavender,
 });
 function variantRamp(variantName=''){
  if(!variantName||typeof variantName!=='string')return [];
  const key=variantName.toLowerCase().trim();
  if(variantPaletteLookup[key])return [...variantPaletteLookup[key]];
  if(variantPaletteAliases[key])return [...variantPaletteAliases[key]];
  const tokens=key.split(/[\s_-]+/).filter(Boolean);
  const ramps=tokens.map(t=>variantPaletteLookup[t]??variantPaletteAliases[t]).filter(Boolean);
  if(ramps.length===1)return [...ramps[0]];
  if(ramps.length>=2){
   const r1=ramps[0],r2=ramps[1],r3=ramps[2]??ramps[1];
   return [r1[Math.floor(r1.length/2)]??r1[0],r2[Math.floor(r2.length/2)]??r2[0],r3[Math.max(0,r3.length-2)]??r3.at(-1)];
  }
  return [];
 }
 function colorRamp(itemId,channelName,value=''){
  const item=items.get(itemId);if(!item)return [];
  if(channelName==='__variant__')return variantRamp(value||item.variants?.[0]||'');
  const channel=item.recolors.find(c=>(c.type_name??item.type_name)===channelName);if(!channel)return [];
  if(!value){const base=getBasePalette(reader,channel.material,channel.base,channel.source??null);return base.isOk()&&Array.isArray(base.value[2])?[...base.value[2]]:[];}
  try{return colorChoice(item,channel,value).target;}catch{return [];}
 }
 function validateRecipe(value){
  const structuralError=fullRecipeStructure(value);if(structuralError)fail('invalid_structure','Invalid full-source recipe structure.',structuralError);
  if(value.schemaVersion!==2||value.sourceCommit!==FULL_SOURCE_COMMIT||!bodies.has(value.bodyType)||typeof value.matchBodyColor!=='boolean'||typeof value.applyMask!=='boolean')fail('invalid_recipe','Unsupported recipe version, source, body or options.');
  if(!plain(value.selections)||!Object.keys(value.selections).length||Object.keys(value.selections).length>slots.size)fail('invalid_structure','Expected bounded source selections.');
  const selections=Object.create(null),selected=[],tags=new Set();
  for(const [slot,input]of Object.entries(value.selections)){
   const item=items.get(input.itemId);
   if(!slots.has(slot)||!item||item.type_name!==slot||!item.required.includes(value.bodyType))fail('unavailable_item','Unavailable item for this slot/body.',{slot,itemId:input.itemId});
   if(item.variants.length?!item.variants.includes(input.variant):input.variant!==null)fail('invalid_variant','Choose an exact available variant.',{itemId:item.id});
   if(!plain(input.colors)||Object.keys(input.colors).some(k=>!item.recolors.some(c=>(c.type_name??item.type_name)===k)))fail('invalid_palette','Unknown recolor channel.',{itemId:item.id});
   const colors=Object.create(null);for(const [channelName,color]of Object.entries(input.colors)){const channel=item.recolors.find(c=>(c.type_name??item.type_name)===channelName);colors[channelName]=colorChoice(item,channel,color).id;}
   selections[slot]={itemId:item.id,variant:input.variant,colors};selected.push(item);for(const tag of item.tags)tags.add(tag);
  }
  for(const item of selected){if(item.required_tags.some(t=>!tags.has(t))||item.excluded_tags.some(t=>tags.has(t)))fail('dependency','Required/excluded item tags do not match.',{itemId:item.id,required:item.required_tags,excluded:item.excluded_tags});}
  const firstLinked=Object.entries(selections).find(([slot,s])=>items.get(s.itemId).matchBodyColor&&s.colors[slot]);
  const bodyColor=firstLinked?.[1].colors[firstLinked[0]];
  if(value.matchBodyColor&&bodyColor)for(const item of selected)if(item.matchBodyColor){const channel=item.recolors.find(c=>!c.type_name);if(channel)selections[item.type_name].colors[item.type_name]=colorChoice(item,channel,bodyColor).id;}
  return {schemaVersion:2,sourceCommit:FULL_SOURCE_COMMIT,bodyType:value.bodyType,selections,matchBodyColor:value.matchBodyColor,applyMask:value.applyMask};
 }
 function generatorNativeColor(itemId,channelName,value){
  const item=items.get(itemId),channel=item?.recolors.find(c=>(c.type_name??item.type_name)===channelName);if(!channel)fail('invalid_palette','Unknown generator color channel.');const canonical=colorChoice(item,channel,value).id,[mat,family,name]=canonical.split('.'),candidates=[value,canonical,family+'.'+name,name,mat+'.'+name,...channel.variants];
  for(const candidate of new Set(candidates)){if(!channel.variants.includes(candidate))continue;try{if(colorChoice(item,channel,candidate).id===canonical)return candidate;}catch(error){if(!(error instanceof FullCatalogError))throw error;}}
  fail('invalid_palette','The declared palette has no exact generator variant.',{itemId,channel:channelName,value});
 }
 function generatorColorResult(itemId,selections,matchBodyColor){
  const item=items.get(itemId);if(!item)fail('unavailable_item','Unknown source item.');const effective=getMultiRecolors(reader,itemId,selections,matchBodyColor)??{},warnings=[];
  for(const selection of Object.values(selections)){if(selection.subId!=null||!selection.recolor)continue;const peer=items.get(selection.itemId),rule=sourceSharedPhysicalColor(selection.itemId),primary=peer?.recolors.find(c=>!c.type_name),channel=rule&&(item.id===peer?.id?primary:item.recolors.find(c=>c.type_name===rule.channel));if(!rule||peer.type_name!==rule.slot||primary?.material!==rule.material||channel?.material!==rule.material)continue;
   // The source collector checks a physical eye choice against the receiver's skin ramp.
   // Both declared eye channels must accept the exact same choice; no family/shade guessing.
   const physicalColor=colorChoice(peer,primary,selection.recolor).id,sharedColor=colorChoice(item,channel,physicalColor).id;
   let previousColor=null;try{previousColor=colorChoice(item,channel,effective[rule.channel]).id;}catch{}if(previousColor!==sharedColor)warnings.push({code:'reviewed_shared_eye_color',itemId:item.id,sourceItemId:peer.id,channel:rule.channel,message:'Reviewed generator eye-color mapping applies your chosen physical-eye color to compatible iris channels.'});effective[rule.channel]=sharedColor;
  }
  return {colors:Object.fromEntries(Object.entries(effective).map(([channel,value])=>[channel,colorChoice(item,item.recolors.find(c=>(c.type_name??item.type_name)===channel),value).id])),warnings};
 }
 function sourceSelections(recipe){return Object.fromEntries(Object.entries(recipe.selections).map(([slot,s])=>[slot,{itemId:s.itemId,name:items.get(s.itemId).name,variant:s.variant,recolor:s.colors[slot]??items.get(s.itemId).recolors[0]?.base.split('.').at(-1)??'',subId:null}]));}
 function paletteMappings(item,selection,repair){return item.recolors.flatMap(c=>{const name=c.type_name??item.type_name,value=selection.colors[name];if(!value)return [];const mapping=colorChoice(item,c,value),base=repair?.paletteBases?.[name],explicit=repair?.paletteSources?.[name];if(base){const source=getTargetPalette(reader,c.material,base);if(source.isErr()||!source.value.length||mapping.target.length<source.value.length)fail('invalid_palette','Invalid reviewed palette correction.');mapping.source=[...source.value];}if(explicit){if(!Array.isArray(explicit)||explicit.length!==mapping.source.length||explicit.some(v=>typeof v!=='string'||!/^#[A-Fa-f0-9]{6}$/.test(v)))fail('invalid_palette','Invalid reviewed explicit source ramp.');mapping.source=[...explicit];}mapping.channel=name;for(const [from,to]of Object.entries(sourceAliases(item.id))){const index=mapping.source.findIndex(c=>c.toUpperCase()===to.toUpperCase());if(index>=0){mapping.source.push(from);mapping.target.push(mapping.target[index]);}}return [mapping];});}
 function plan(value,action,onlyItemId=null){
  const recipe=validateRecipe(value),custom=customAnimations[action],standard=ANIMATION_CONFIGS[action];
  if(!custom&&!standard)fail('unavailable_action','Unknown source animation.',{action});
  if(custom&&!Object.values(recipe.selections).some(s=>Object.values(items.get(s.itemId).layers).some(l=>l.custom_animation===action)))fail('unavailable_action','This custom animation requires its source item.',{action});
  const columns=custom?custom.frames[0].length:Math.max(...standard.cycle)+1,rows=custom?custom.frames.length:standard.num,frameSize=custom?custom.frameSize:64;
  const layout={frameWidth:frameSize,frameHeight:frameSize,directions:rows===1?['authored']:directions.slice(0,rows),authoredDirectionOnly:rows===1,cycle:custom?Array.from({length:columns},(_,n)=>n):[...standard.cycle]},width=columns*frameSize,height=rows*frameSize;
  const selections=sourceSelections(recipe),layers=[],warnings=[];
  for(const [slot,selection]of Object.entries(recipe.selections)){
   const item=items.get(selection.itemId);if(onlyItemId&&item.id!==onlyItemId)continue;let count=0;
   for(const [key,layer]of Object.entries(item.layers)){
    const number=Number(key.slice(6)),isCustom=layer.custom_animation===action;
    if(layer.custom_animation&&!isCustom)continue;
    const base=custom?customAnimationBase(custom):action;
    if(!isCustom&&!supports(item,base))continue;
    const repair=repairRules.find(r=>r.itemId===item.id&&r.layer===number&&r.bodies.includes(recipe.bodyType));let sourceRow=0;
    let path;if(!isCustom&&repair?.sourcePath){const row=repair.actionRows[physical(base)];if(row===undefined)fail('unavailable_action','The legacy source sheet does not contain this action.',{itemId:item.id,action});sourceRow=row;path=repair.sourcePath;}else if(isCustom){const template=layer[recipe.bodyType],resolved=template.includes('${')?replaceInPath(reader,template,selections,item,recipe.bodyType):template;path='spritesheets/'+resolved+(selection.variant??'').replaceAll(' ','_')+'.png';}
    else{const resolved=getSpritePath(reader,item.id,selection.variant,item.recolors.length>0,recipe.bodyType,physical(base),number,selections,item);if(resolved.isErr())fail('missing_layer','A required source layer cannot resolve.',{itemId:item.id,layer:number,action});path=resolved.value;}
    if(repair?.pathAliases?.[path])path=repair.pathAliases[path];
    if(!safePath(path))fail('unresolved_dependency','Source dependency path cannot resolve.',{itemId:item.id,layer:number,action});
    const asset=files.get(path);if(!asset)fail('missing_asset','A required pinned source image is unavailable.',{itemId:item.id,path,action});
    const problem=sourcePathProblem(item.id,path,physical(base),asset.sha256);if(problem)fail('unavailable_action',problem,{itemId:item.id,path,action});
    let layoutTransform=null;const frames=[];if(Object.keys(sourceAliases(item.id)).length&&Object.keys(selection.colors).length)warnings.push({code:'reviewed_source_color_alias',itemId:item.id,message:'Reviewed source-color correction preserves the selected hair color without an orange fringe.'});if(repair&&(!repair.paletteOnly||Object.keys({...repair.paletteBases,...repair.paletteSources}).some(channel=>Object.hasOwn(selection.colors,channel))))warnings.push({code:'reviewed_source_correction',itemId:item.id,repair:repair.id,path,reason:repair.reason,...(repair.message?{message:repair.message}:{})});
    if(isCustom&&!custom.sourceSingleAnimation){if(asset.width<width||asset.height<height)fail('invalid_layout','Custom source sheet is smaller than its declared layout.',{path,action});frames.push({sx:0,sy:0,sw:width,sh:height,dx:0,dy:0,dw:width,dh:height});}
    else if(custom){const sourceSize=isCustom?asset.height/4:64;if(!Number.isSafeInteger(sourceSize)||sourceSize<1)fail('invalid_layout','Invalid source frame size.',{path});for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const match=/^(.+)-([nwse]),(\d+)$/.exec(custom.frames[y][x]);if(!match)fail('invalid_layout','Invalid pinned custom frame specification.');const sx=Number(match[3])*sourceSize,sy='nwse'.indexOf(match[2])*sourceSize+sourceRow*64;if(sx+sourceSize>asset.width||sy+sourceSize>asset.height)fail('invalid_layout','A custom frame reads beyond its source.',{path,action,x,y});const offset=(frameSize-sourceSize)/2;frames.push({sx,sy,sw:sourceSize,sh:sourceSize,dx:x*frameSize+offset,dy:y*frameSize+offset,dw:sourceSize,dh:sourceSize});}}
    else{if(asset.width<width||asset.height<height+sourceRow*64){layoutTransform=layoutPreparation(item.id,path,asset,action,width,height,sourceRow,recipe.bodyType);if(!layoutTransform)fail('invalid_layout','Source sheet cannot supply every declared playable frame.',{path,action,expected:[width,height],actual:[asset.width,asset.height]});warnings.push({code:'reviewed_layout_padding',itemId:item.id,path,message:'Reviewed source layout preserves the original artwork.'});}frames.push({sx:0,sy:sourceRow*64,sw:width,sh:height,dx:0,dy:0,dw:width,dh:height});}
    if(asset.width>width||(!custom&&asset.height>height))warnings.push({code:'extra_source_extent',path,action});
    const palettes=paletteMappings(item,selection,repair),layerCorrection=sourceLayerColorCorrection(item.id,path,asset.sha256,physical(base));
    if(layerCorrection){let applied=false;for(const mapping of palettes){const spec=layerCorrection.channels[mapping.channel];if(!spec)continue;if(!Array.isArray(spec.source)||!Array.isArray(spec.targetIndices)||!spec.source.length||spec.source.length!==spec.targetIndices.length||spec.source.some(c=>typeof c!=='string'||!/^#[A-Fa-f0-9]{6}$/.test(c))||spec.targetIndices.some(n=>!Number.isInteger(n)||n<0||n>=mapping.target.length))fail('invalid_palette','Invalid reviewed sheet-specific source ramp.');mapping.source=[...spec.source];mapping.target=spec.targetIndices.map(n=>mapping.target[n]);if(spec.extraShadeTargets){if(spec.extraShadeStart!==6||mapping.source.length<=6)fail('invalid_palette','Invalid reviewed extra-shade boundary.');const shade=sourceExtraShadeTarget(spec.extraShadeTargets,mapping.id);if(shade!==null&&!/^#[A-Fa-f0-9]{6}$/.test(shade))fail('invalid_palette','Invalid reviewed extra-shade RGB.');if(shade)for(let n=spec.extraShadeStart;n<mapping.target.length;n++)mapping.target[n]=shade;}applied=true;}if(applied)warnings.push({code:'reviewed_sheet_palette',itemId:item.id,path,message:layerCorrection.message});else if(layerCorrection.unquarantine)warnings.push({code:'authored_source_palette',itemId:item.id,path,message:'Original Formal Pants colors are preserved. Choose a color to use the reviewed palette mapping.'});}
    for(const mapping of palettes){const reason=sourceInactiveColor(item.id,path,asset.sha256,action,mapping.channel);if(reason&&layout.authoredDirectionOnly){mapping.inactiveReason=reason;warnings.push({code:'inactive_source_channel',itemId:item.id,channel:mapping.channel,action,message:reason});}}
    layers.push({slot,itemId:item.id,layer:number,z:layer.zPos,path,sha256:asset.sha256,sourceWidth:asset.width,sourceHeight:asset.height,isMask:layer.is_mask===true,palettes,sourceRepair:repair?.id??null,...(layoutTransform?{sourceTransformId:layoutTransform.id}:{}),frames});count++;
   }
   if(!count)fail('unavailable_action','A selected item has no required layers for this action.',{itemId:item.id,action});
  }
  layers.sort((a,b)=>a.z-b.z);
  const result={sourceCommit:FULL_SOURCE_COMMIT,recipe,action,width,height,layout,layers,warnings,applyMask:recipe.applyMask};
  attachHurtSourcePreparation(result);attachNativeSourcePreparation(result);
  for(const itemId of new Set(layers.map(l=>l.itemId))){const phase=reviewedSourcePhase(result,itemId);if(phase)warnings.push({code:phase.kind==='orientation'?'reviewed_source_orientation':phase.kind==='hurt'?'reviewed_hurt_phase':phase.kind==='pose_occlusion'?'reviewed_source_pose':phase.kind==='prop_occlusion'?'reviewed_prop_occlusion':phase.kind==='program_stage'?'reviewed_prop_stage':'reviewed_shield_surface',itemId,message:phase.message??'The painted shield front turns away during this pose; its matching shield remains visible.'});}
  return result;
 }
 function resolvableActions(value){validateRecipe(value);const actions=[...new Set([...Object.keys(ANIMATION_CONFIGS),...Object.keys(customAnimations)])];return actions.flatMap(action=>{try{plan(value,action);return [action];}catch(error){if(error instanceof FullCatalogError)return [];throw error;}});}
 function itemPlans(recipe,itemId){validateRecipe(recipe);if(!Object.values(recipe.selections).some(s=>s.itemId===itemId))fail('unavailable_item','Source claims require a selected item.');const result=[];for(const action of [...Object.keys(ANIMATION_CONFIGS),...Object.keys(customAnimations)])try{result.push(plan(recipe,action,itemId));}catch(error){if(!(error instanceof FullCatalogError))throw error;}return result;}
 return Object.freeze({itemPlans,renderingReferenceIds(value){const r=validateRecipe(value);return [...new Set(Object.values(r.selections).flatMap(s=>sourceRenderingReferenceIds(s.itemId,r.bodyType,Object.keys(s.colors))))];},renderingPolicyVersion(value){const r=validateRecipe(value);return Math.max(layoutPolicyVersion(r),nativeRepairVersion(r),sourcePhaseVersion(r),...Object.values(r.selections).map(s=>sourceLayerPolicyVersion(s.itemId,r.bodyType,Object.keys(s.colors))),Object.values(r.selections).some(s=>sourceNeedsColorPolicy(s.itemId,Object.keys(s.colors))||repairRules.some(rule=>rule.paletteOnly&&rule.itemId===s.itemId&&rule.bodies.includes(r.bodyType)&&Object.keys({...rule.paletteBases,...rule.paletteSources}).some(channel=>Object.hasOwn(s.colors,channel))))?1:0);},generatorColors:(itemId,selections,matchBodyColor)=>generatorColorResult(itemId,selections,matchBodyColor).colors,generatorColorResult,generatorNativeColor,actionIds:()=>[...new Set([...Object.keys(ANIMATION_CONFIGS),...Object.keys(customAnimations)])],item(id){const item=items.get(id);if(!item)fail('unavailable_item','Unknown source item.');return structuredClone(item);},validateColor(itemId,channelName,value){const item=items.get(itemId),channel=item?.recolors.find(c=>(c.type_name??item.type_name)===channelName);if(!channel)fail('invalid_palette','Unknown recolor channel.');return colorChoice(item,channel,value).id;},colorRamp,variantRamp,items:()=>metadata.items.map(i=>({id:i.id,name:i.name,slot:i.type_name,bodies:[...i.required]})),slots:()=>[...slots],bodies:()=>[...bodies],validateRecipe,plan:(recipe,action)=>plan(recipe,action),sourcesFor(recipe,itemId){validateRecipe(recipe);if(!Object.values(recipe.selections).some(s=>s.itemId===itemId))fail('unavailable_item','Source claims require a selected item.');const result=[];for(const action of [...Object.keys(ANIMATION_CONFIGS),...Object.keys(customAnimations)])try{result.push(...plan(recipe,action,itemId).layers.map(l=>({path:l.path,layer:l.layer,z:l.z,action,sha256:l.sha256})));}catch(error){if(!(error instanceof FullCatalogError))throw error;}return result;},resolvableActions,colorOptions(itemId){const item=items.get(itemId);if(!item)fail('unavailable_item','Unknown source item.');return item.recolors.map(c=>({channel:c.type_name??item.type_name,label:c.label,choices:Object.entries(c.palettes).flatMap(([family,colors])=>colors.map(color=>family+'.'+color))}));}});
}
