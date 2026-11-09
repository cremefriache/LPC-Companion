import {createFullComposer} from '../composition/full-composer.mjs';
import {ImageCache} from '../composition/cache.mjs';
import {recolorImageCPU,applyTransparencyMaskToCanvas} from '../../vendor/lpc/full-catalog/core.mjs';
import {sourceFrameGeometry} from './source-frames.mjs';
import {SOURCE_FRAME_MS} from '../state/source-playback.mjs';
import {MOOD_EXPRESSIONS} from '../state/presence.mjs';

export function createSourceRenderer({runtime,document,getEmbeddedAssets=()=>({})}){
 const composer=createFullComposer({catalog:runtime.catalog,loadImage:(path,sha)=>runtime.artwork?runtime.artwork.loadImage(path,sha,getEmbeddedAssets()):runtime.library.loadImage(path,sha),recolor:recolorImageCPU,applyMask:applyTransparencyMaskToCanvas,createCanvas(width,height){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}}),composed=new ImageCache(),geometry=new WeakMap();let disposed=false;
 const check=current=>{if(disposed||!current())throw Error('Source render was superseded or closed.');};
 async function prepare(definition,presentation,{current=()=>true,actionId=null}={}){
  check(current);runtime.state.validateDefinition(definition);const p=runtime.state.validatePresentation(definition,presentation,{}),baseRecipe=runtime.state.recipeFor(definition,p.outfitId),action=actionId??p.playback.actionId,cue=actionId!==null;
  let recipe=baseRecipe,plan=runtime.catalog.plan(baseRecipe,action);
  runtime.availability.validate(plan,cue?{...p,playback:{mode:'cue',actionId:action}}:p);
  const faceItemId=MOOD_EXPRESSIONS[p.moodId]?.itemId;
  if(faceItemId){try{const sourceSels=Object.fromEntries(Object.entries(baseRecipe.selections).map(([slot,s])=>[slot,{itemId:s.itemId,variant:s.variant,recolor:s.colors[slot]??''}])),bodyColor=baseRecipe.selections.body?.colors?.body??baseRecipe.selections.head?.colors?.head??'body.ulpc.light',colors=runtime.catalog.generatorColors(faceItemId,{...sourceSels,expression:{itemId:faceItemId,variant:null,recolor:bodyColor}},baseRecipe.matchBodyColor),moodRecipe=runtime.catalog.validateRecipe({...baseRecipe,selections:{...baseRecipe.selections,expression:{itemId:faceItemId,variant:null,colors}}}),moodPlan=runtime.catalog.plan(moodRecipe,action);runtime.availability.validate(moodPlan,cue?{...p,playback:{mode:'cue',actionId:action}}:p);recipe=moodRecipe;plan=moodPlan;}catch{}}
  const key=JSON.stringify([recipe,action]),raw=await composed.get(key,async()=>{const value=await composer.compose(recipe,action);return {...value,width:value.canvas.width,height:value.canvas.height};});check(current);
  const layout={...raw.layout,frameMs:SOURCE_FRAME_MS,cycle:!cue&&p.playback.mode==='hold'?[p.playback.frame]:raw.layout.cycle};let variants=geometry.get(raw);if(!variants){variants=new Map();geometry.set(raw,variants);}const geometryKey=layout.cycle.join(',');if(!variants.has(geometryKey))variants.set(geometryKey,sourceFrameGeometry(raw.canvas,layout));Object.assign(layout,variants.get(geometryKey));
  const row=layout.authoredDirectionOnly?0:layout.directions.indexOf(p.facing);if(!layout.visibleRows[row])throw Error('The character is not visible from this source view. Choose another direction or pose.');
  return {definition,presentation:p,sheet:{canvas:raw.canvas,layout},warnings:plan.warnings,plan,durationMs:layout.cycle.length*layout.frameMs};
 }
 return {prepare,stats:()=>({...composer.stats(),composedBytes:composed.bytes,maxComposedBytes:composed.maxBytes}),dispose(){disposed=true;composer.dispose();composed.clear();}};
}
