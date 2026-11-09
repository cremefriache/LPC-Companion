import {createBrowserComposer} from '../../src/presentation/browser-composer.mjs';
import {selectionsFor} from '../../src/catalog/catalog.mjs';
import {promoCharacters} from './characters.mjs';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),W=960,H=720,composer=createBrowserComposer(document,new URL('/',location.href)),definitions=promoCharacters(),sheets={};
for(const [person,d]of definitions.entries())for(const outfit of d.outfits)for(const action of ['idle','walk'])sheets[`${person}/${outfit.id}/${action}`]=await composer.compose(selectionsFor(d,outfit.id),action);
const backgrounds={};for(const name of ['woodland','courtyard','hearth']){const img=new Image();img.src=`/assets/lpc/backgrounds/${name}.svg`;await img.decode();backgrounds[name]=img;}
const font='"DejaVu Sans",Arial,sans-serif',ink='#edf3ed',muted='#a8b9b1',mint='#b8d8bd';
function rect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function text(s,x,y,size=20,color=ink,weight=400){ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${font}`;ctx.fillText(s,x,y);}
function sprite(person,outfit,action,x,ground,scale,t,facing='south'){const s=sheets[`${person}/${outfit}/${action}`],l=s.layout,col=l.cycle[Math.floor(t*1000/l.frameMs)%l.cycle.length],row=l.directions.indexOf(facing);ctx.imageSmoothingEnabled=false;ctx.drawImage(s.canvas,col*l.frameWidth,row*l.frameHeight,l.frameWidth,l.frameHeight,x-l.frameWidth*scale/2,ground-l.frameHeight*scale,l.frameWidth*scale,l.frameHeight*scale);}
function pill(label,x,y,w,selected=false){rect(x,y,w,34,17,selected?'#b8d8bd':'#ffffff08',selected?null:'#77968b55');text(label,x+14,y+23,13,selected?'#15251e':muted,500);}
function stage(scene,t,persons=1,outfit='everyday'){const x=462,y=174,w=450,h=338;ctx.save();ctx.shadowColor='#0007';ctx.shadowBlur=38;ctx.shadowOffsetY=18;rect(x,y,w,h,22,'#18251f');ctx.restore();ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,22);ctx.clip();ctx.drawImage(backgrounds[scene],x,y,w,h);const overlay=ctx.createLinearGradient(0,y,0,y+h);overlay.addColorStop(0,'#0a18100a');overlay.addColorStop(1,'#0a181024');ctx.fillStyle=overlay;ctx.fillRect(x,y,w,h);if(persons===2){sprite(0,outfit,'idle',x+w*.35,y+h-17,3.1,t);sprite(1,'evening','idle',x+w*.69,y+h-17,3.1,t);}else sprite(0,outfit,t<2.2?'walk':'idle',x+w*.51+Math.sin(t*1.3)*6,y+h-17,3.5,t);ctx.restore();rect(x,y,w,h,22,null,'#bbdcc547');}
const beats=[
 {label:'01 / A FAMILIAR FACE',lines:['Your character.','A little closer.'],sub:['A pixel-art companion','beside your SillyTavern chat.'],scene:'woodland'},
 {label:'02 / MAKE IT YOURS',lines:['One face.','Every outfit.'],sub:['Named looks. Local previews.','657 pinned source definitions.'],scene:'courtyard'},
 {label:'03 / A SHARED WORLD',lines:['Set the scene.','Bring company.'],sub:['A compact stage.','Up to two companions.'],scene:'woodland'},
 {label:'LPC COMPANION',lines:['For your','next story.'],sub:['Wardrobes. Scenes.','Appearance that follows your chat.'],scene:'woodland'}
];
function drawBeat(index,t,alpha=1){const beat=beats[index];ctx.save();ctx.globalAlpha=alpha;const entrance=Math.min(1,t/.3),e=1-Math.pow(1-entrance,3),offset=(1-e)*12;ctx.save();ctx.translate(0,offset);text(beat.label,48,186,12,mint,600);for(let i=0;i<beat.lines.length;i++)text(beat.lines[i],46,255+i*62,45,ink,600);for(let i=0;i<beat.sub.length;i++)text(beat.sub[i],48,385+i*27,16,muted);ctx.restore();
 if(index===0){stage('woodland',t);pill('A familiar face',462,534,148,true);pill('Manual controls',622,534,151);}
 if(index===1){const outfit=['everyday','evening','summer'][Math.min(2,Math.floor(t/.95))];stage('courtyard',3,1,outfit);for(const [i,id]of ['everyday','evening','summer'].entries())pill(id[0].toUpperCase()+id.slice(1),462+i*151,534,139,id===outfit);}
 if(index===2){const scene=t<1.45?'woodland':'hearth';stage(scene,3,2,'summer');pill(scene==='woodland'?'Woodland clearing':'Hearth room',462,534,177,true);pill('Together',651,534,107);}
 if(index===3){stage('woodland',t);pill('Development preview',48,458,198,true);text('Install from GitHub · model tools optional',48,518,14,muted);text('github.com/cremefriache/',48,554,17,ink,500);text('LPC-Companion',48,580,21,mint,600);pill('Built with the LPC community',462,534,276);}
 ctx.restore();}
window.renderPromo=time=>{const t=((time%12)+12)%12;ctx.clearRect(0,0,W,H);const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#14262a');bg.addColorStop(1,'#10181f');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.strokeStyle='#b4d5bd07';ctx.lineWidth=1;for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
 text('LPC Companion',48,65,23,ink,600);pill('FOR SILLYTAVERN',730,39,182);ctx.fillStyle='#b8d8bd';ctx.fillRect(48,96,26,3);ctx.fillStyle='#b8d8bd22';ctx.fillRect(74,96,838,1);
 const index=Math.floor(t/3),local=t-index*3;if(t>11.65){const a=(t-11.65)/.35;drawBeat(3,local,1-a);drawBeat(0,.3,a);}else if(local<.22&&index>0){const a=local/.22;drawBeat(index-1,2.9,1-a);drawBeat(index,Math.max(local,.3),a);}else drawBeat(index,Math.max(local,.3));
 for(let i=0;i<4;i++)rect(48+i*219,617,207,3,1.5,i===index?'#b8d8bd':'#b8d8bd22');
 text('LPC community artwork · Modern LPC + Universal LPC',48,657,12,muted);text('Credits & source: github.com/cremefriache/LPC-Companion',48,682,11,'#80988c');text('DEVELOPMENT PREVIEW',748,680,10,'#98b0a3',500);
};window.renderPromo(0);window.promoReady=true;window.disposePromo=()=>composer.dispose();
