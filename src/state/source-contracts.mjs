let contracts=null;
export const isSourceDefinition=value=>value?.schemaVersion===2;
export function registerSourceContracts(value){contracts=value;}
export function sourceContracts(){if(!contracts)throw Error('The full catalog is still loading. Reload the companion before editing.');return contracts;}

/** Inspect only known companion envelopes; never traverse chat prose or follow URLs. */
export function hasSourceData(value){
 const definition=d=>d?.schemaVersion===2&&['character-definition','chat-snapshot'].includes(d.kind);
 const state=s=>definition(s?.snapshot)||Array.isArray(s?.history)&&s.history.some(e=>definition(e?.change?.definition));
 const envelope=v=>Object.keys(v?.embeddedAssets??{}).some(key=>key.startsWith('full-source/'))||definition(v)||definition(v?.definition)||state(v?.state)||v?.kind==='companion-roster'&&Array.isArray(v.companions)&&v.companions.some(e=>state(e.state));
 const metadata=m=>envelope(m?.lpc_companion)||envelope(m?.lpc_companion_roster);
 const row=v=>envelope(v)||envelope(v?.data?.extensions?.lpc_companion)||envelope(v?.extensions?.lpc_companion)||metadata(v?.chat_metadata);
 if(Array.isArray(value))return value.some(row);return row(value);
}
