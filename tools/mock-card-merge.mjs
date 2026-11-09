// Independent fixture for the pinned host's recursive object merge + unset behavior.
// Known fixture keys are literal-safe; cardNamespacePatch refuses unsafe deletion paths.
export function mockCardMerge(base,patch){
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),result=structuredClone(base);
 function merge(target,changes){for(const [key,value]of Object.entries(changes)){
  if(object(value)&&Object.hasOwn(target,key)){if(object(target[key]))merge(target[key],value);}
  else target[key]=structuredClone(value);
 }}
 function unset(target,changes){for(const [key,value]of Object.entries(changes))if(value==='__@@UNSET@@__')delete target[key];else if(object(value)&&object(target[key]))unset(target[key],value);}
 merge(result,patch);unset(result,patch);return result;
}
