import policy from '../../vendor/lpc/full-catalog/layout-preparation.json' with {type:'json'};
if(policy.schemaVersion!==1||policy.sourceCommit!=='86160e7507d6841259cff624a51a63c1d4847ee3')throw Error('Unreviewed source-layout preparation.');
export function layoutPreparation(itemId,path,asset,action,width,height,sourceRow,bodyType){return policy.transforms.find(r=>r.itemId===itemId&&r.bodies.includes(bodyType)&&r.path===path&&r.sha256===asset.sha256&&r.action===action&&r.sourceWidth===asset.width&&r.sourceHeight===asset.height&&r.outputWidth===width&&r.outputHeight===height&&sourceRow===0)??null;}
export function layoutPreparationIds(recipe){return policy.transforms.filter(r=>r.bodies.includes(recipe.bodyType)&&Object.values(recipe.selections).some(s=>s.itemId===r.itemId)).map(r=>r.id);}
export function addedLayoutAsset(itemId,path,sha){return policy.transforms.some(r=>r.itemId===itemId&&r.path===path&&r.sha256===sha);}
export function layoutPolicyVersion(recipe){return layoutPreparationIds(recipe).length?9:0;}
