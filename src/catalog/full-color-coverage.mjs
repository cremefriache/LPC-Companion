const rgb=value=>{const m=/^#?([a-f0-9]{6})$/i.exec(value);if(!m)throw Error('Invalid compiled source palette RGB.');const n=parseInt(m[1],16);return [n>>16,(n>>8)&255,n&255];};
// Match the original CPU renderer's first match and per-component tolerance of 1.
// Histograms cover the entire source sheet, not only its selected playable crop.
export function inspectSourceColors(palettes,histogram){
 const channels=palettes.map(p=>({id:p.id,source:p.source.map(rgb),matchedPixels:0,matchedColors:[]})),unmapped=[];let totalPixels=0;
 for(const [hex,count]of Object.entries(histogram)){
  const color=rgb(hex);totalPixels+=count;const channel=channels.find(c=>c.source.some(s=>s.every((v,n)=>Math.abs(v-color[n])<=1)));
  if(channel){channel.matchedPixels+=count;channel.matchedColors.push(hex);}else unmapped.push({rgb:hex,pixels:count});
 }
 return {totalPixels,channels:channels.map(({source,...c})=>c),unmapped};
}
