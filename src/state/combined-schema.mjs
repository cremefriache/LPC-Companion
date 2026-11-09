/** Keep v1 branches exact while allowing accepted history to cross format versions. */
export function combinedStateSchema(legacy){
 const schema=structuredClone(legacy),d=schema.definitions,names=['characterDefinition','chatSnapshot','presentation','presentationPatch','companionReplacement'];
 for(const name of names){d[name+'V1']=structuredClone(d[name]);d[name]={oneOf:[{$ref:'#/definitions/'+name+'V1'},{$ref:'urn:lpc-companion:source-state:2#/definitions/'+name}]};}
 d.characterDefinitionV1.properties.startingPresentation={$ref:'#/definitions/presentationV1'};
 d.chatSnapshotV1.properties.startingPresentation={$ref:'#/definitions/presentationV1'};
 d.companionReplacementV1.properties.definition={$ref:'#/definitions/characterDefinitionV1'};
 d.companionReplacementV1.properties.presentation={$ref:'#/definitions/presentationV1'};
 // Used only after a chat contains the source format; plain legacy histories stay unchanged.
 d.presentationPatchV1.properties.definitionHash={type:'string',pattern:'^[a-f0-9]{64}$'};
 return schema;
}
