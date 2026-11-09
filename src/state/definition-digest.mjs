import {sha256} from '@noble/hashes/sha256';
export function definitionDigest(definition){
 const text=JSON.stringify(definition,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
 return Array.from(sha256(new TextEncoder().encode(text)),v=>v.toString(16).padStart(2,'0')).join('');
}
