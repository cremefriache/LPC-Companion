import {createSourceArtwork} from '../state/source-artwork.mjs';
import {registerSourceArtworkValidator} from '../state/portable-assets.mjs';
import {createSourcePackages} from '../state/source-packages.mjs';
import {openFullLibrary} from './full-library.mjs';
import {hasSourceData,registerSourceContracts} from '../state/source-contracts.mjs';

/** One immutable catalog and bounded bank cache per page; no card/chat data retained. */
export function createFullRuntime({baseUrl,document,openLibrary=openFullLibrary}){
 let ready=null,pending=null;
 async function get(){
  if(ready)return ready;if(pending)return pending;
  const work=(async()=>{
   const [{createFullCatalog},{createFullState},{createSourceAvailability}]=await Promise.all([import('../catalog/full-catalog.mjs'),import('../state/full-state.mjs'),import('../catalog/source-availability.mjs')]);
   const library=await openLibrary({baseUrl,document});
   try{const catalog=createFullCatalog({metadata:library.metadata,assets:library.assets,repairs:library.repairs}),availability=createSourceAvailability({catalog,evidenceFor:library.evidenceFor}),state=createFullState(catalog,{validatePlan:availability.validate});const artwork=createSourceArtwork({assets:library.assets,library,document});registerSourceArtworkValidator(artwork.validate);const packages=createSourcePackages({catalog,state,metadata:library.metadata,assets:library.assets,artwork});ready={library,catalog,state,availability,artwork,packages};registerSourceContracts(state);return ready;}
   catch(error){library.dispose();throw error;}
  })();pending=work;try{return await work;}finally{if(pending===work)pending=null;}
 }
 return Object.freeze({get,async prepareData(value){if(hasSourceData(value))await get();},isReady:()=>Boolean(ready)});
}
