import layoutPolicy from '../../vendor/lpc/full-catalog/layout-preparation.json' with {type:'json'};
import nativePolicy from '../../vendor/lpc/full-catalog/native-repairs.json' with {type:'json'};
import policy from '../../vendor/lpc/full-catalog/hurt-phases.json' with {type:'json'};
const transforms=new Map([...policy.transforms,...nativePolicy.transforms,...layoutPolicy.transforms].map(row=>[row.id,row]));
if(layoutPolicy.schemaVersion!==1||layoutPolicy.sourceCommit!==policy.sourceCommit)throw Error('Unreviewed source-layout preparation.');
if(nativePolicy.schemaVersion!==1||nativePolicy.sourceCommit!==policy.sourceCommit||policy.schemaVersion!==1||policy.sourceCommit!=='86160e7507d6841259cff624a51a63c1d4847ee3')throw Error('Unreviewed source preparation.');
export function sourceTransformSpec(layer){
 if(!layer.sourceTransformId)return null;const row=transforms.get(layer.sourceTransformId);
 if(!row||row.itemId!==layer.itemId||row.path!==layer.path||row.sha256!==layer.sha256||row.sourceWidth!==layer.sourceWidth||row.sourceHeight!==layer.sourceHeight)throw Error('Unreviewed source-frame preparation.');
 return row;
}
/** Immutable originals enter; a caller-owned prepared sheet leaves. No new art/files. */
export function prepareSourceImage(image,layer,createCanvas){
 const row=sourceTransformSpec(layer);if(!row)return image;if(image.width!==row.sourceWidth||image.height!==row.sourceHeight)throw Error('Prepared source dimensions changed.');
 const canvas=createCanvas(row.outputWidth??image.width,row.outputHeight??image.height),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0);
 for(const copy of row.copies){const from=Array.isArray(copy.from)?copy.from:[copy.from,0],to=Array.isArray(copy.to)?copy.to:[copy.to,0];ctx.drawImage(image,from[0]*64,from[1]*64,64,64,to[0]*64+copy.dx,to[1]*64+copy.dy,64,64);}
 return canvas;
}
export function preparedSourceEvidence(layer,evidence){
 const row=sourceTransformSpec(layer);if(!row)return evidence;
 if(row.kind==='transparent_padding'){if(!evidence||evidence.width!==row.sourceWidth||evidence.height!==row.sourceHeight||evidence.physical64CellNonblankPixels?.length!==0)throw Error('Prepared source coverage does not match its verified original.');return {...evidence,width:row.outputWidth,height:row.outputHeight,physical64CellNonblankPixels:row.cells};}
 if(!evidence||evidence.width!==row.sourceWidth||evidence.height!==row.sourceHeight||evidence.physical64CellNonblankPixels?.length!==row.rawCells.length||evidence.physical64CellNonblankPixels.some((n,i)=>Boolean(n)!==Boolean(row.rawCells[i])))throw Error('Prepared source coverage does not match its verified original.');
 return {...evidence,physical64CellNonblankPixels:row.cells};
}
