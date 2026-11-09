import {FULL_SOURCE_COMMIT} from './full-catalog.mjs';
// Keep the offered string separate from the exact notice version used. '+' source labels remain verbatim.
export const FULL_LICENSE_LABELS=Object.freeze({
 'OGA-BY 3.0':{licenseId:'OGA-BY-3.0',file:'LICENSE-OGA-BY-3.0.txt',url:'https://static.opengameart.org/OGA-BY-3.0.txt'},
 CC0:{licenseId:'CC0-1.0',file:'LICENSE-CC0-1.0.txt',url:'https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt'},
 'CC-BY 3.0':{licenseId:'CC-BY-3.0',file:'LICENSE-CC-BY-3.0.txt',url:'https://creativecommons.org/licenses/by/3.0/legalcode.txt'},
 'CC-BY 4.0':{licenseId:'CC-BY-4.0',file:'LICENSE-CC-BY-4.0.txt',url:'https://creativecommons.org/licenses/by/4.0/legalcode.txt'},
 'CC-BY-SA 3.0':{licenseId:'CC-BY-SA-3.0',file:'LICENSE-CC-BY-SA-3.0.txt',url:'https://creativecommons.org/licenses/by-sa/3.0/legalcode.txt'},
 'CC-BY-SA 4.0':{licenseId:'CC-BY-SA-4.0',file:'LICENSE-CC-BY-SA-4.0.txt',url:'https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt'},
 'CC-BY 3.0+':{licenseId:'CC-BY-3.0',file:'LICENSE-CC-BY-3.0.txt',url:'https://creativecommons.org/licenses/by/3.0/legalcode.txt',versionChoice:'Use the explicitly named 3.0 version; retain the original + label.'},
 'CC-BY 4.0+':{licenseId:'CC-BY-4.0',file:'LICENSE-CC-BY-4.0.txt',url:'https://creativecommons.org/licenses/by/4.0/legalcode.txt',versionChoice:'Use the explicitly named 4.0 version; retain the original + label.'},
});
export function createFullLicenseRegistry({metadata,provenance,assets,noticeHashes}){
 if(metadata.repository!=='https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator'||metadata.commit!==FULL_SOURCE_COMMIT||provenance.commit!==FULL_SOURCE_COMMIT)throw Error('Unreviewed full artwork license source.');
 const items=new Map(metadata.items.map(i=>[i.id,i])),files=new Map(assets.map(a=>[a.path,a.sha256]));
 for(const info of Object.values(FULL_LICENSE_LABELS))if(!/^[a-f0-9]{64}$/.test(noticeHashes[info.file]??''))throw Error('Missing full selected artwork notice.');
 function select(itemId,path){
  const item=items.get(itemId);if(!item||!files.has(path))throw Error('Unknown compiled artwork attribution.');
  const credits=item.credits.filter(c=>path.startsWith('spritesheets/'+c.file+'/'));
  if(!credits.length||credits.some(c=>!c.authors.length||!c.licenses.length))throw Error('Missing original artwork authors/license record.');
  const sourceLabel=Object.keys(FULL_LICENSE_LABELS).find(label=>credits.every(c=>c.licenses.includes(label)));
  if(!sourceLabel)throw Error('No supported offered license common to this asset credit set.');
  const choice=FULL_LICENSE_LABELS[sourceLabel],recordSha256=provenance.sourceFiles[item.sourceFile];if(!/^[a-f0-9]{64}$/.test(recordSha256??''))throw Error('Unverified source credit metadata.');
  const recordUrl=metadata.repository+'/blob/'+FULL_SOURCE_COMMIT+'/'+item.sourceFile,assetUrl=metadata.repository+'/blob/'+FULL_SOURCE_COMMIT+'/'+path;
  return {sourceItemId:itemId,sourcePath:path,assetSha256:files.get(path),sourceLabel,...choice,assetSource:{repository:metadata.repository,commit:FULL_SOURCE_COMMIT,path,url:assetUrl,sha256:files.get(path)},noticeSha256:noticeHashes[choice.file],credits:structuredClone(credits),sourceRecord:{repository:metadata.repository,commit:FULL_SOURCE_COMMIT,file:item.sourceFile,sha256:recordSha256,url:recordUrl},...(credits.some(c=>!c.urls.length)?{sourceUrlSupplement:{url:assetUrl,metadataUrl:recordUrl,reason:'Original artwork URL field is empty; these identify the pinned source asset and exact original credit record. Original fields are unchanged.'}}:{})};
 }
 return Object.freeze({select});
}
