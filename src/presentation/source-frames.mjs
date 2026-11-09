/** Source custom frames center the 64px body; the full frame bottom is not its ground anchor. */
export function sourceFrameGeometry(canvas,layout){
 const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,fw=layout.frameWidth,fh=layout.frameHeight;let left=fw,top=fh,right=0,bottom=0;
 const visible=[];for(let row=0;row<layout.directions.length;row++){let seen=false;for(const column of new Set(layout.cycle))for(let y=0;y<fh;y++)for(let x=0;x<fw;x++)if(data[((row*fh+y)*canvas.width+column*fw+x)*4+3]){seen=true;left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}visible.push(seen);}
 if(right<=left||bottom<=top)throw Error('This source pose has no visible character pixels.');
 return {sourceBounds:{x:left,y:top,width:right-left,height:bottom-top},bodyAnchor:{x:fw/2,y:(fh+64)/2},visibleRows:visible};
}
export function sourceExtents(layout){const b=layout.sourceBounds??{x:0,y:0,width:layout.frameWidth,height:layout.frameHeight},a=layout.bodyAnchor??{x:layout.frameWidth/2,y:layout.frameHeight};return {left:Math.max(0,a.x-b.x),right:Math.max(0,b.x+b.width-a.x),above:Math.max(0,a.y-b.y),below:Math.max(0,b.y+b.height-a.y)};}
export function sourceDestination(layout,width,height,placement={x:0.5,y:1,scale:1},fit){
 const bounds=layout.sourceBounds??{x:0,y:0,width:layout.frameWidth,height:layout.frameHeight},anchor=layout.bodyAnchor??{x:layout.frameWidth/2,y:layout.frameHeight},e=fit??sourceExtents(layout),scale=Math.min(3*placement.scale,width/Math.max(1,e.left+e.right),height/Math.max(1,e.above+e.below)),clamp=(v,min,max)=>Math.min(max,Math.max(min,v)),x=clamp(width*placement.x,e.left*scale,width-e.right*scale),y=clamp(height*placement.y,e.above*scale,height-e.below*scale);
 return {x:x-(anchor.x-bounds.x)*scale,y:y-(anchor.y-bounds.y)*scale,width:bounds.width*scale,height:bounds.height*scale,scale,anchorX:x,anchorY:y,bounds};
}
export function drawSourceFrame(target,sheet,facing,frame=0,{placement,fitExtents}={}){
 const {layout,canvas}=sheet,row=layout.authoredDirectionOnly?0:layout.directions.indexOf(facing);if(row<0)throw Error('Facing is unavailable for this source pose.');
 const dest=sourceDestination(layout,target.width,target.height,placement,fitExtents),b=dest.bounds,ctx=target.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,target.width,target.height);ctx.drawImage(canvas,layout.cycle[frame%layout.cycle.length]*layout.frameWidth+b.x,row*layout.frameHeight+b.y,b.width,b.height,dest.x,dest.y,dest.width,dest.height);target.dataset.frame=String(frame);return dest;
}
