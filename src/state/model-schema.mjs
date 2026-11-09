import Ajv from 'ajv';
/** Bound both validator and compiler ownership; exposed schemas may be decorated by the host. */
export function createModelSchemaCache(maxEntries=32){
 const entries=new Map();
 return {compile(schema){const key=JSON.stringify(schema);let entry=entries.get(key);
  if(entry){entries.delete(key);entries.set(key,entry);}else{const owned=structuredClone(schema);entry={schema:owned,validate:new Ajv({strict:true,ownProperties:true}).compile(owned)};if(entries.size>=maxEntries)entries.delete(entries.keys().next().value);entries.set(key,entry);}
  return {schema:structuredClone(entry.schema),validate:entry.validate};
 },clear(){entries.clear();},stats:()=>({entries:entries.size,maxEntries})};
}
