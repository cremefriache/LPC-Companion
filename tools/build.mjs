/** Public corresponding-source build: no private evidence, experiment or Git dependency. */
import {build,transform} from 'esbuild';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root));
const check=process.argv.includes('--check'),trackedOutputs=['manifest.json','lpc-runtime.mjs','assets/lpc/catalog.json','assets/lpc/pack-manifest.json','assets/lpc/credits.html','assets/lpc/credits-data.json','assets/lpc/source-credits.html'],before=check?new Map(await Promise.all(trackedOutputs.map(async p=>[p,await read(p)]))):null;
await import('./catalog.mjs');await import('./scene-assets.mjs');await import('./check-full-library.mjs');await(await import('./credits.mjs')).buildCredits();
const result=await build({absWorkingDir:fileURLToPath(root),entryPoints:['src/index.mjs'],outfile:'dist/lpc-companion/index.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],charset:'utf8',legalComments:'inline',write:false});
const runtime=await transform(result.outputFiles[0].text,{minify:true,format:'esm',target:'es2022',legalComments:'inline'}),manifest=JSON.parse(await read('extension/manifest.json'));manifest.js='lpc-runtime.mjs';manifest.css='extension/style.css';
const outputs={'manifest.json':Buffer.from(JSON.stringify(manifest,null,2)+'\n'),'lpc-runtime.mjs':Buffer.from(runtime.code)};
if(check){for(const [p,bytes]of Object.entries(outputs))assert.deepEqual(bytes,before.get(p),'Published entry differs from corresponding source: '+p);for(const p of trackedOutputs.filter(p=>!Object.hasOwn(outputs,p)))assert.deepEqual(await read(p),before.get(p),'Generated artwork metadata/credits differ: '+p);}
else for(const [p,bytes]of Object.entries(outputs))await writeFile(new URL(p,root),bytes);
assert.deepEqual(await read('LICENSE'),await read('vendor/lpc/LICENSE-GPL-3.0'));
console.log(check?'Verified matching public runtime, source, pinned artwork and generated credits.':'Rebuilt public runtime and credits from corresponding source.');
