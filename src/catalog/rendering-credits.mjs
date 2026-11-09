import hairShadow from '../../vendor/lpc/full-catalog/hair-shadow.json' with {type:'json'};
/** Supplemental palette metadata; never replaces a PNG's original per-item art license. */
export function sourceRenderingReferences(selection){
 const ids=Array.isArray(selection)?selection:selection===3?['hair_shadow_2021']:[];
 if(ids.some(id=>id!=='hair_shadow_2021'))throw Error('Unreviewed rendering reference.');
 if(!ids.includes('hair_shadow_2021'))return [];
 if(hairShadow.schemaVersion!==1||hairShadow.sourceCommit!=='86160e7507d6841259cff624a51a63c1d4847ee3')throw Error('Unreviewed rendering-credit source.');
 return [structuredClone(hairShadow.paletteReference)];
}
