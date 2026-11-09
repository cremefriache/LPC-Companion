import {layoutPreparationIds,addedLayoutAsset} from '../catalog/source-layout-preparation.mjs';
import {nativePreparationIds} from '../catalog/source-native-repairs.mjs';
import {hurtPreparationItems} from '../catalog/source-hurt-phases.mjs';
import {sourcePreparationAttribution} from '../catalog/source-preparation-credits.mjs';
import {sourceRenderingReferences} from '../catalog/rendering-credits.mjs';
import {FULL_SOURCE_COMMIT} from '../catalog/full-catalog.mjs';
import {createFullLicenseRegistry} from '../catalog/full-licenses.mjs';
import provenance from '../../vendor/lpc/full-catalog/provenance.json' with {type:'json'};
import packageNotices from '../../vendor/lpc/full-catalog/package-notices.json' with {type:'json'};
import {PACKAGE_LIMIT,SOURCE_ART_PREFIX,encodePng,digest,validateEmbeddedAssets} from './portable-assets.mjs';
import {scenes,sceneCredit,partySceneCredit} from '../catalog/scenes.mjs';
import {partyScene} from './party.mjs';
export const SOURCE_PACKAGE_KIND='lpc-source-companion-package';
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
function bounded(value){if(JSON.stringify(value).length>PACKAGE_LIMIT)throw Error('Source package exceeds 2 MB. Export a smaller wardrobe or a configuration package.');return value;}
function parse(text){
 if(typeof text!=='string'||text.length>PACKAGE_LIMIT)throw Error('Source package exceeds 2 MB.');const value=JSON.parse(text),pending=[[value,0]];let nodes=0;
 while(pending.length){const [v,depth]=pending.pop();if(v&&typeof v==='object'){const children=Object.values(v);nodes+=children.length;if(depth>32||nodes>100000)throw Error('Source package is too deeply nested or contains too many fields.');for(const child of children)if(child&&typeof child==='object')pending.push([child,depth+1]);}}return value;
}

/** Pure package contracts plus a caller-owned verified byte loader. No persistence. */
export function createSourcePackages({catalog,state,metadata,assets,artwork}){
 const hashes=Object.fromEntries(Object.entries(packageNotices).map(([file,text])=>[file,digest(new TextEncoder().encode(text))])),registry=createFullLicenseRegistry({metadata,provenance,assets,noticeHashes:hashes});
 function contents(definition,{includeRenderingCredits=true,includePreparation=true,includeNativePreparation=true,includeLayoutAssets=true}={}){
  const checked=state.validateDefinition(definition),claims=new Map(),paths=new Map();let renderingPolicyVersion=0;const referenceIds=new Set(),preparationIds=new Set(),nativeIds=new Set(),layoutIds=new Set();
  for(const outfit of checked.outfits){const recipe=state.recipeFor(checked,outfit.id);renderingPolicyVersion=Math.max(renderingPolicyVersion,catalog.renderingPolicyVersion(recipe));for(const id of layoutPreparationIds(recipe))layoutIds.add(id);for(const id of nativePreparationIds(recipe))nativeIds.add(id);for(const id of hurtPreparationItems(recipe))preparationIds.add(id);for(const id of catalog.renderingReferenceIds(recipe))referenceIds.add(id);for(const selection of Object.values(recipe.selections))for(const layer of catalog.sourcesFor(recipe,selection.itemId)){
   if(!includeLayoutAssets&&addedLayoutAsset(selection.itemId,layer.path,layer.sha256))continue;const key=SOURCE_ART_PREFIX+layer.path;paths.set(key,layer.sha256);const claimKey=selection.itemId+'\n'+layer.path;if(!claims.has(claimKey))claims.set(claimKey,registry.select(selection.itemId,layer.path));
  }}
  const backgroundIds=new Set([checked.startingPresentation.scene.backgroundId,partyScene(checked.startingPresentation.partySceneId).backgroundId]);for(const id of backgroundIds){const b=scenes.backgrounds[id];if(b)paths.set(b.path,b.sha256);}
  const selected=[...claims.values()].sort((a,b)=>(a.sourceItemId+'\n'+a.sourcePath).localeCompare(b.sourceItemId+'\n'+b.sourcePath)),items=Object.fromEntries([...new Set(selected.map(c=>c.sourceItemId))].sort().map(id=>{const item=catalog.item(id);return [id,{name:item.name,sourceFile:item.sourceFile,credits:structuredClone(item.credits)}];}));
  const preparation=includePreparation?sourcePreparationAttribution(selected,[...preparationIds],includeNativePreparation?[...nativeIds]:[],includeLayoutAssets?[...layoutIds]:[]):[];const rendering=includeRenderingCredits?sourceRenderingReferences([...referenceIds]):[];const notices=Object.fromEntries([...new Set(['LICENSE-GPL-3.0',...selected.map(c=>c.file),...rendering.map(r=>r.noticeFile)])].sort().map(file=>[file,packageNotices[file]]));if([...backgroundIds].some(id=>scenes.backgrounds[id]))notices['LICENSE-scene-MIT.txt']=scenes.licenseText;
  return {definition:checked,renderingPolicyVersion,paths:new Map([...paths].sort(([a],[b])=>a.localeCompare(b))),attribution:{sourceCommit:FULL_SOURCE_COMMIT,codeLicense:'GPL-3.0',items,assets:selected,...(preparation.length?{preparation}:{}),...(rendering.length?{rendering}:{}),...(sceneCredit(checked)?{scene:sceneCredit(checked)}:{}),...(partySceneCredit(checked)?{partyScene:partySceneCredit(checked)}:{})},notices};
 }
 function config(definition){const c=contents(definition);return bounded({schemaVersion:1,kind:SOURCE_PACKAGE_KIND,mode:'config',requiredCatalog:'lpc-source-v1',sourceCommit:FULL_SOURCE_COMMIT,definition:c.definition,attribution:c.attribution,notices:c.notices,...(c.renderingPolicyVersion?{renderingPolicyVersion:c.renderingPolicyVersion}:{})});}
 async function complete(definition,{loadBytes,current=()=>true}={}){
  const c=contents(definition);if(c.paths.size>1024)throw Error('Complete source package exceeds 1,024 artwork entries. Export a smaller wardrobe or configuration package.');const value={schemaVersion:1,kind:SOURCE_PACKAGE_KIND,mode:'complete',requiredCatalog:'lpc-source-v1',sourceCommit:FULL_SOURCE_COMMIT,definition:c.definition,attribution:c.attribution,notices:c.notices,...(c.renderingPolicyVersion?{renderingPolicyVersion:c.renderingPolicyVersion}:{}),assets:{}};
  for(const [key,sha]of c.paths){if(!current())throw Error('Package export was superseded or closed.');let bytes;try{bytes=await loadBytes(key,sha);}catch(error){if(addedLayoutAsset('heads_skeleton',key.slice(SOURCE_ART_PREFIX.length),sha))throw Error('Newly supported Halfslash art is unavailable. Restore the complete local asset pack and retry. Your existing package and saved appearance are unchanged.',{cause:error});throw error;}value.assets[key]=encodePng(bytes);bounded(value);}
  if(!current())throw Error('Package export was superseded or closed.');validateEmbeddedAssets(value.assets);return bounded(value);
 }
 function importDocument(text,localId){
  const value=parse(text);if(!value||typeof value!=='object'||Array.isArray(value)||value.kind!==SOURCE_PACKAGE_KIND||value.schemaVersion!==1||value.requiredCatalog!=='lpc-source-v1'||value.sourceCommit!==FULL_SOURCE_COMMIT||!['config','complete'].includes(value.mode))throw Error('Unsupported source companion package.');
  if(value.renderingPolicyVersion!==undefined&&![1,2,3,4,5,6,7,8,9,10].includes(value.renderingPolicyVersion))throw Error('Unsupported source rendering policy. Use a build that supports the package’s reviewed presentation.');
  const keys=['schemaVersion','kind','mode','requiredCatalog','sourceCommit','definition','attribution','notices',...(value.mode==='complete'?['assets']:[]),...(Object.hasOwn(value,'renderingPolicyVersion')?['renderingPolicyVersion']:[])];if(!same(Object.keys(value).sort(),keys.sort()))throw Error('Unknown or missing source package fields.');
  const c=contents(value.definition),credits=contents(value.definition,{includeRenderingCredits:(value.renderingPolicyVersion??0)>=3||!c.attribution.rendering?.length,includePreparation:(value.renderingPolicyVersion??0)>=5,includeNativePreparation:(value.renderingPolicyVersion??0)>=7,includeLayoutAssets:(value.renderingPolicyVersion??0)>=9});if(!same(value.attribution,credits.attribution)||!same(value.notices,credits.notices))throw Error('Source artwork credits or full license notices are missing or altered.');
  const embeddedAssets=value.mode==='complete'?validateEmbeddedAssets(value.assets):{};if(value.mode==='complete'&&!same(Object.keys(embeddedAssets).sort(),[...credits.paths.keys()].sort()))throw Error('Source package artwork is missing or contains unused assets.');
  const definition=state.validateDefinition({...c.definition,characterId:localId});return {definition,embeddedAssets};
 }
 return Object.freeze({config,complete,importDocument,contents,loadBytes:(key,sha,embedded)=>key.startsWith(SOURCE_ART_PREFIX)?artwork.loadBytes(key.slice(SOURCE_ART_PREFIX.length),sha,embedded):null});
}
