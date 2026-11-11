import { assertStateInvariants } from './invariants.mjs';
import { createHistoryEngine } from './history.mjs';
import { createRosterValidator } from './roster.mjs';
import { createSourceReadiness } from './source-contracts.mjs';
import { createStateValidator } from './validate.mjs';

/** Isolated v1/v2 state contracts, artwork validation, and history engine wired via explicit readiness. */
export function createStateEngine({ readiness = createSourceReadiness() } = {}) {
    const validator = createStateValidator({ readiness });
    const history = createHistoryEngine({
        validateContract: validator.validateContract,
        validateDefinition: validator.validateDefinition,
        validatePresentation: validator.validatePresentation,
        assertStateInvariants,
    });
    const validateRoster = createRosterValidator({
        validateContract: validator.validateContract,
        validateDefinition: validator.validateDefinition,
        reconstruct: history.reconstruct,
    });
    return Object.freeze({
        readiness,
        ...validator,
        ...history,
        validateRoster,
    });
}
