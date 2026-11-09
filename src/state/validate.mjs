import { validateActivity } from './animation-program.mjs';
import { validateScene } from '../catalog/scenes.mjs';
import Ajv from 'ajv';
import schema from '../../schemas/lpc-state.schema.json' with { type: 'json' };
import { assertStateInvariants } from './invariants.mjs';
import { catalog, validateSelection, selectionsFor, capabilities } from '../catalog/catalog.mjs';
import { validateEmbeddedAssets } from './portable-assets.mjs';
import sourceSchema from '../../schemas/lpc-source-state.schema.json' with {type:'json'};
import recipeSchema from '../../schemas/lpc-source-recipe.schema.json' with {type:'json'};
import {combinedStateSchema} from './combined-schema.mjs';
import {isSourceDefinition,sourceContracts} from './source-contracts.mjs';

const ajv = new Ajv({ strict: true, ownProperties: true });
ajv.addSchema(recipeSchema);ajv.addSchema(sourceSchema);ajv.addSchema(combinedStateSchema(schema));
const definitionSchema = ajv.compile({ $ref: 'urn:lpc-companion:state:1#/definitions/characterDefinitionV1' });
const patchSchema = ajv.compile({ $ref: 'urn:lpc-companion:state:1#/definitions/presentationPatchV1' });
const checks = new Map();
export function validateContract(value, name) {
    if (JSON.stringify(value).length > 2_000_000) throw Error('Companion data exceeds the 2 MB limit.');
    if (!checks.has(name)) checks.set(name, ajv.compile({ $ref: `urn:lpc-companion:state:1#/definitions/${name}` }));
    if (!checks.get(name)(value)) throw Error('Unsupported or corrupt companion data. Export a backup before replacing it.');
    if (['characterBinding','companionRoster'].includes(name) && value.embeddedAssets !== undefined) validateEmbeddedAssets(value.embeddedAssets);
    return structuredClone(value);
}

export function validateDefinition(value) {
    if(isSourceDefinition(value))return sourceContracts().validateDefinition(value);
    if (!definitionSchema(value)) throw Error('Invalid companion setup. Check names and selections.');
    assertStateInvariants(value);
    validateScene(value.startingPresentation.scene);
    if (value.catalogVersion !== catalog.version) throw Error('Unsupported catalog version.');
    for (const [slot, selection] of Object.entries(value.identity)) if (!['bodyType','bald'].includes(slot) && !validateSelection(slot, selection).bodyTypes.includes(value.identity.bodyType)) throw Error(`Identity ${slot} is incompatible with the selected body type.`);
    for (const outfit of value.outfits) {
        for (const [slot, selection] of Object.entries(outfit.selections)) if (!validateSelection(slot, selection).bodyTypes.includes(value.identity.bodyType)) throw Error(`Outfit ${outfit.name}: ${slot} is incompatible with ${value.identity.bodyType}.`);
        const supported = capabilities(selectionsFor(value, outfit.id));
        validateActivity(value,{...value.startingPresentation,outfitId:outfit.id});
        if (!supported.includes(value.startingPresentation.posture)) throw Error('An outfit does not support the starting posture.');
    }
    return structuredClone(value);
}

export function validatePresentation(definition, current, patch) {
    if(isSourceDefinition(definition))return sourceContracts().validatePresentation(definition,current,patch);
    if (!patchSchema({ schemaVersion: 1, kind: 'presentation-patch', patch })) throw Error('Invalid presentation choice.');
    const next = { ...current, ...structuredClone(patch) };
    validateScene(next.scene);validateActivity(definition,next);
    if (!capabilities(selectionsFor(definition, next.outfitId)).includes(next.posture)) throw Error('This outfit does not support that posture.');
    return next;
}
