import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../assets/lpc/',import.meta.url);
const scenes = JSON.parse(await readFile(new URL('scenes.json',base),'utf8'));
if (scenes.licenseText !== await readFile(new URL('backgrounds/LICENSE-MIT.txt',base),'utf8')) throw Error('Background license text differs.');
for (const item of Object.values(scenes.backgrounds)) {
    if (!/^backgrounds\/[a-z]+\.svg$/.test(item.path) || item.width!==320 || item.height!==240 || item.credits.license!=='MIT' || !item.credits.authors.length || item.credits.source!==item.path) throw Error('Invalid background catalog or provenance.');
    const bytes = await readFile(new URL(item.path,base)), source=bytes.toString('utf8');
    if (createHash('sha256').update(bytes).digest('hex')!==item.sha256 || /<(?:script|image|foreignObject|style)|\b(?:href|onload|onclick)\s*=|<!DOCTYPE/i.test(source)) throw Error('Changed or nonlocal background artwork.');
}
console.log('Verified three original MIT vector backdrops and their exact local source hashes.');
