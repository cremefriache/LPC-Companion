import {sourcePreparationAttribution} from '../src/catalog/source-preparation-credits.mjs';
import {sourceRenderingReferences} from '../src/catalog/rendering-credits.mjs';
import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const licenses={'OGA-BY 3.0':'../../vendor/lpc/LICENSE-OGA-BY-3.0.txt',CC0:'../../vendor/lpc/LICENSE-CC0-1.0.txt','GPL 3.0':'../../vendor/lpc/LICENSE-GPL-3.0'};
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const paragraph=value=>'<p>'+escape(value)+'</p>';
export function renderCredits(catalog,template){
 const records={};for(const [id,item]of Object.entries(catalog.items)){
  if(!Object.hasOwn(licenses,item.selectedLicense)||!item.credits?.length)throw Error('Missing selected license or credits: '+id);
  const files=[...new Set(item.layers.flatMap(layer=>Object.values(layer.paths)))];
  for(const file of files)if(!item.credits.some(c=>file.startsWith('spritesheets/'+c.file+'/')&&c.licenses.includes(item.selectedLicense)&&c.authors.length&&c.urls.length))throw Error('Uncredited shipped path: '+file);
  records[id]={name:item.name,selectedLicense:item.selectedLicense,source:item.upstreamSource??{repository:'https://github.com/codyaboyd/Universal-LPC-Modern-Sprite-Generator',commit:catalog.upstreamCommit,itemId:id},files,credits:structuredClone(item.credits)};
 }
 const sections=Object.entries(records).map(([id,item])=>{
  const credits=item.credits.map(credit=>{
   const urls=credit.urls.map(value=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('Unsafe artwork credit URL');return '<li><a href="'+escape(url.href)+'" rel="noopener">'+escape(value)+'</a></li>';}).join('');
   return paragraph(credit.file+': '+credit.authors.join(', '))+paragraph('License alternatives: '+credit.licenses.join(' / '))+(credit.notes?paragraph(credit.notes):'')+'<ul>'+urls+'</ul>';
  }).join('');
  return '<section id="credit-'+escape(id)+'"><h2>'+escape(item.name)+'</h2><small>'+escape(id)+'</small>'+paragraph('Selected artwork license: '+item.selectedLicense)+'<p><a href="'+licenses[item.selectedLicense]+'">Full selected license text</a></p>'+paragraph('Source: '+item.source.repository+' @ '+item.source.commit+' ('+item.source.itemId+')')+credits+'</section>';
 }).join('\n');
 if(!template.includes('{{CREDITS}}')||!template.includes('{{ITEM_COUNT}}'))throw Error('Incomplete credits template');
 return {html:template.replace('{{ITEM_COUNT}}',String(Object.keys(records).length)).replace('{{CREDITS}}',sections),data:{schemaVersion:1,kind:'shipped-artwork-credits',catalog:catalog.version,items:records}};
}
export async function buildCredits(){const root=new URL('../',import.meta.url),catalog=JSON.parse(await readFile(new URL('assets/lpc/catalog.json',root),'utf8')),template=await readFile(new URL('tools/credits-template.html',root),'utf8'),result=renderCredits(catalog,template);await writeFile(new URL('assets/lpc/credits.html',root),result.html);await writeFile(new URL('assets/lpc/credits-data.json',root),JSON.stringify(result.data,null,2)+'\n');const source=JSON.parse(await readFile(new URL('vendor/lpc/full-catalog/metadata.json',root),'utf8'));await writeFile(new URL('assets/lpc/source-credits.html',root),renderSourceCredits(source));console.log('Generated complete offline credits for '+Object.keys(result.data.items).length+' shipped items.');}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await buildCredits();

export function renderRenderingCredits(){
 const references=sourceRenderingReferences(3);return '<section id="rendering-references"><h2>Supplemental rendering palette reference</h2>'+references.map(r=>paragraph(r.title)+paragraph(r.scope)+paragraph(r.attribution.replaceAll('\n',' '))+'<p><a href="'+escape(r.sourceUrl)+'">Original palette source and credits</a> · <a href="../../vendor/lpc/'+escape(r.noticeFile)+'">Full '+escape(r.selectedLicense)+' notice for the palette reference</a></p>'+paragraph(r.file+' · SHA-256 '+r.fileSha256)).join('')+'</section>';
}

export function renderPreparationCredits(){
 const rows=sourcePreparationAttribution();return '<section id="source-preparation"><h2>Reviewed display preparation</h2>'+paragraph('Six source selections have reviewed standing/terminal repairs or transparent canvas padding. Display preparation uses temporary sheets; original PNG files, artwork authors and selected licenses remain unchanged. Preparation code is GPL-3.0.')+'<p><a href="../../vendor/lpc/LICENSE-GPL-3.0">Full code license</a></p><ul>'+rows.map(r=>'<li><a href="#source-credit-'+escape(r.itemId)+'">'+escape(r.itemId)+'</a>: '+escape(r.sourcePath)+' · SHA-256 '+escape(r.sourceSha256)+paragraph(r.change)+paragraph(r.copies.map(c=>Array.isArray(c.from)?'Source cell ('+c.from.join(', ')+') to ('+c.to.join(', ')+'), offset ('+c.dx+', '+c.dy+')':'Source column '+c.from+' to column '+c.to+', offset ('+c.dx+', '+c.dy+')').join('; '))+'</li>').join('')+'</ul></section>';
}

export function renderSourceCredits(source){
 if(source.repository!=='https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator'||!/^[a-f0-9]{40}$/.test(source.commit))throw Error('Unreviewed source credits pin.');
 const sections=source.items.map(item=>{if(!/^sheet_definitions\/[a-zA-Z0-9_/-]+\.json$/.test(item.sourceFile))throw Error('Unsafe source metadata path.');const sourceUrl=source.repository+'/blob/'+source.commit+'/'+item.sourceFile;
 return '<section id="source-credit-'+escape(item.id)+'"><h2>'+escape(item.name)+'</h2><small>'+escape(item.id)+'</small><p><a href="'+escape(sourceUrl)+'">Pinned original metadata</a></p>'+item.credits.map(credit=>paragraph(credit.file+': '+credit.authors.join(', '))+paragraph('Offered license labels: '+credit.licenses.join(' / '))+(credit.notes?paragraph(credit.notes):'')+(credit.urls.length?'<ul>'+credit.urls.map(value=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('Unsafe source credit URL.');return '<li><a href="'+escape(url.href)+'" rel="noopener">'+escape(value)+'</a></li>';}).join('')+'</ul>':paragraph('No artwork URL was supplied in this source credit record; the pinned metadata link above identifies the exact original record.'))).join('')+'</section>';
 }).join('\n');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Full pinned LPC source credits</title><style>body{max-width:850px;margin:30px auto;padding:0 16px;font:16px/1.6 system-ui;background:#19272b;color:#f1eee5}a{color:#c8e2a6}section{border-top:1px solid #657c73;margin-top:28px}p,li,small,h1,h2{overflow-wrap:anywhere}a:focus-visible{outline:3px solid #c8e2a6}</style><h1>Full pinned LPC source credits</h1>'+paragraph(source.items.length+' source definitions at '+source.commit+'. Original credit records and offered license labels are shown verbatim. This is a source inventory; these items are not all enabled in the companion. Shipped artwork uses the verified selected licenses on the installed-pack credits page.')+renderRenderingCredits()+renderPreparationCredits()+'<p><a href="credits.html">Installed-pack credits and full selected notices</a> · <a href="../../vendor/lpc/full-catalog/metadata.json">Complete pinned source metadata</a></p><div id="source-credits">'+sections+'</div></html>';
}
