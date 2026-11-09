const quote = value => JSON.stringify(String(value).slice(0, 96));
const retry = ' No update was prepared or applied by this call. Correct the arguments and call lpc_present again with a new requestId.';

/** Describe structural failures without echoing speech or other arbitrary argument content. */
export function validateModelArguments(value, structure, {currentOutfitId} = {}) {
    // Use the validator-owned schema; the host can decorate the separately exposed copy.
    const schema = structure.validate.schema;
    const prefix = schema.properties.playback ? 'Invalid source presentation arguments. ' : 'Invalid presentation arguments. ';
    const fail = message => { throw Error(prefix + message + retry); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object of named presentation fields.');
    if (JSON.stringify(value).length > 4096) fail('Arguments exceed the 4096-character limit; shorten the request.');
    if (structure.validate(value)) return;
    if (Object.hasOwn(value, 'established') && value.established !== true) throw Error(prefix + 'established must be true only when the current response establishes the change. Do not retry imagined or unresolved changes. No update was prepared or applied by this call.');
    const ids = schema.properties.outfitId.enum;
    if (typeof value.outfitId === 'string' && !ids.includes(value.outfitId)) {
        throw Error(`Unknown outfitId ${quote(value.outfitId)}. Available outfit IDs: ${JSON.stringify(ids)}. Omit outfitId to keep the current outfit ${quote(currentOutfitId)}.${retry}`);
    }
    const unknownField = Object.keys(value).find(name => !Object.hasOwn(schema.properties, name));
    if (unknownField !== undefined) {
        const name = unknownField;
        const hint = schema.properties.playback && ['posture', 'activityId'].includes(name) ? ' This companion uses playback for poses and ongoing motion.' : '';
        fail(`Unknown field ${quote(name)}. Allowed fields: ${JSON.stringify(Object.keys(schema.properties))}.${hint}`);
    }
    const errors = structure.validate.errors ?? [];
    const issue = errors.find(error => !/\/(anyOf|oneOf)\//.test(error.schemaPath)) ?? errors.at(-1);
    if (issue?.keyword === 'required') fail(`Missing required field ${quote(issue.params.missingProperty)}.`);
    if (issue?.keyword === 'enum') fail(`Invalid field ${quote(issue.instancePath)}; allowed values: ${JSON.stringify(issue.params.allowedValues)}.`);
    if (issue?.keyword === 'const') fail(`Field ${quote(issue.instancePath)} must be ${JSON.stringify(issue.params.allowedValue)}.`);
    if (issue?.keyword === 'anyOf' && !issue.instancePath) {
        fail(`Include at least one presentation choice: ${JSON.stringify(Object.keys(schema.properties).filter(key => !schema.required.includes(key)))}.`);
    }
    fail(`Field ${quote(issue?.instancePath || 'arguments')}: ${issue?.message ?? 'check the listed field types and choices'}.`);
}
