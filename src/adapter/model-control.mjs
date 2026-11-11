import { activityAnimation, validateSequence } from '../state/animation-program.mjs';
import {
    TOOL_NAME,
    ALL_TOOL_NAMES,
    TOOL_DESCRIPTION,
    modelContract,
    modelContext,
    modelContextData,
    scopedToolsFor,
    translateScopedToolArgs,
    responseFingerprint,
    matchesResponse
} from '../state/model-contract.mjs';
import { readChatContext } from './context.mjs';
import { sessionKey } from './session.mjs';
import { equal } from '../state/history.mjs';
import { makeUuid } from '../state/uuid.mjs';
import { readOnlyContextFor, createPromptBindings, insertPromptMessage } from './tool-hub.mjs';

/** Per-open-panel, opt-in tool owner. No provider requests or pending writes. */
export function createModelControl({
    active,
    getContext,
    getRecord,
    isGenerating,
    prepare,
    apply,
    report,
    crypto,
    hub,
    toolPolicy,
    ownerKey = 'primary',
    label = 'Primary companion',
    resolveContext = readChatContext,
    contextKey = sessionKey,
    canTarget = () => true,
    responseAllowed = () => true,
    matchesAccepted = matchesResponse,
    deferGroupAcceptance = false,
    explicitTarget = false,
    defaultBindings = true,
    contractFor = modelContract,
    toolsFor = scopedToolsFor,
    choices,
    contextFor = modelContext,
    contextDataFor = modelContextData,
    activityFor = activityAnimation,
    programFor = validateSequence,
    description = TOOL_DESCRIPTION
}) {
    let enabled = false,
        disposed = false,
        run = null,
        epoch = 0,
        tail = Promise.resolve(),
        endTimer = null;
    const clearEndTimer = () => {
        if (endTimer !== null) {
            clearTimeout(endTimer);
            endTimer = null;
        }
    };
    const subscriptions = [];
    const prompts = new WeakMap();
    const promptBindings = createPromptBindings();
    const currentContext = () => {
        const context = resolveContext(getContext());
        return context && contextKey(context) === contextKey(active);
    };
    const toolsAllowed = () => (!toolPolicy || (toolPolicy.get().enabled !== false && toolPolicy.get().toolCalling === true))
        && (hub?.toolsAllowed?.() ?? true);
    const isScoped = () => Boolean(toolPolicy?.get()?.toolScope && toolPolicy.get().toolScope !== 'off' && !globalThis.__lpcLegacyPresentTool);
    const includeScene = () => Boolean(globalThis.__lpcLegacyPresentTool) || !toolPolicy?.get()?.toolScope || toolPolicy.get()
        .toolScope === 'scene';
    const sharingAllowed = () => !toolPolicy || (toolPolicy.get().enabled !== false && toolPolicy.get().shareContext === true);
    const contextAvailable = () => !disposed && currentContext() && getRecord()?.binding && !getRecord()?.conflict;
    const baseAvailable = () => toolsAllowed() && enabled && contextAvailable() && getContext().isToolCallingSupported?.() === true;
    const available = () => baseAvailable() && canTarget();
    const cancel = () => {
        clearEndTimer();
        const pending = run;
        epoch++;
        run = null;
        if (pending?.requests.size && !disposed)
            report('Pending model update discarded · last accepted appearance retained.');
    };
    function listen(name, handler) {
        const context = getContext(), event = context.eventTypes[name];
        if (event) {
            context.eventSource.on(event, handler);
            subscriptions.push([context.eventSource, event, handler]);
        }
    }
    async function invoke(rawArgs, toolName = TOOL_NAME) {
        const requestedEpoch = epoch;
        const task = tail.then(async () => {
            try {
                if (requestedEpoch !== epoch || !available() || !run || !isGenerating())
                    throw Error('Model controls require an enabled panel and an active supported generation.');
                const pending = run, token = epoch;
                if (toolName !== TOOL_NAME) {
                    const existing = [...pending.requests.values()].find(entry => entry.toolName === toolName
                        && equal(entry.rawArgs, rawArgs));
                    if (existing) return existing.result;
                }
                const sourceChoices = choices ? choices(pending.definition, pending.presentation.outfitId, pending.presentation.facing)
                    : undefined;
                const args = toolName === TOOL_NAME ? rawArgs : {
                    requestId: `${toolName}_${pending.requests.size + 1}`,
                    established: true,
                    ...translateScopedToolArgs(toolName, rawArgs, pending.definition, pending.presentation, { sourceChoices }),
                };
                const contract = contractFor(
                    pending.definition,
                    pending.presentation,
                    { includeScene: includeScene(), compact: isScoped() }
                );
                const checked = contract.validate(args);
                const nextDefinition = checked.definition ?? pending.definition;
                if (!checked.sequence && pending.sequence)
                    checked.sequence = programFor(
                        pending.sequence.map(({ actionId }) => ({ actionId })),
                        nextDefinition,
                        checked.presentation
                    );
                if (pending.requests.has(args.requestId)) {
                    const previous = pending.requests.get(args.requestId);
                    if (!equal(previous.args, args)) throw Error('requestId was already used with different arguments.');
                    return previous.result;
                }
                if (pending.requests.size >= 16)
                    throw Error('At most 16 companion requests are allowed per response.');
                await prepare(nextDefinition, checked.presentation, checked.actionId, checked.sequence);
                if (run !== pending || epoch !== token || !available())
                    throw Error('Generation or chat changed while preparing the action.');
                const result = JSON.stringify({
                    status: 'prepared',
                    applied: false,
                    token: pending.id,
                    requestId: args.requestId,
                    presentation: checked.presentation,
                    actionId: checked.actionId,
                    speech: checked.speech,
                    sequence: checked.sequence,
                    ...(hub ? { companionId: pending.definition.characterId } : {})
                });
                pending.requests.set(args.requestId, {
                    args: structuredClone(args),
                    rawArgs: structuredClone(rawArgs),
                    toolName,
                    result
                });
                pending.definition = nextDefinition;
                pending.presentation = checked.presentation;
                pending.actionId = checked.actionId ?? pending.actionId;
                if (checked.sequence) {
                    pending.sequence = checked.sequence;
                    if (args.sequence) pending.actionId = null;
                }
                pending.speech = checked.speech ?? pending.speech;
                pending.target = null;
                report('Model update prepared · waiting for an accepted response.');
                return result;
            } catch (error) {
                report(`Model request rejected: ${error.message}`);
                return JSON.stringify({ status: 'error', applied: false, error: error.message });
            }
        });
        tail = task.catch (() => {});
        return task;
    }
    listen('GENERATION_STARTED', (type, options, dryRun) => {
        if (dryRun) return;
        if (!available() && deferGroupAcceptance && baseAvailable() && run?.target && isGenerating()) {
            if (hub) register();
            return;
        }
        if (!available() || !getContext().canPerformToolCalls?.(type)) {
            cancel();
            if (hub) register();
            return;
        }
        if (run?.recursive && isGenerating()) {
            run.recursive = false;
            run.target = null;
            return;
        }
        cancel();
        const record = getRecord();
        run = {
            id: makeUuid(crypto),
            baselineDefinition: structuredClone(record.definition),
            definition: structuredClone(record.definition),
            baseline: structuredClone(record.presentation),
            presentation: structuredClone(record.presentation),
            actionId: null,
            sequence: null,
            speech: null,
            requests: new Map(),
            receipts: new Set(),
            target: null,
            recursive: false
        };
        if (hub) register();
    });
    listen(
        'CHAT_COMPLETION_PROMPT_READY',
        data => {
            if (hub) return;
            if (data.dryRun || !Array.isArray(data.chat)) return;
            // Mutate outgoing prompt only; never card prose or stored chat messages.
            const previous = prompts.get(data.chat);
            if (previous && data.chat.includes(previous)) data.chat.splice(data.chat.indexOf(previous), 1);
            prompts.delete (data.chat);
            promptBindings.restore(data.chat);
            if (!sharingAllowed() || !contextAvailable() || (!toolPolicy && (!available() || !run))) return;
            const writable = available() && run;
            const state = writable ? run : getRecord();
            const outfit = state.definition.outfits.find(outfit => outfit.id === state.presentation.outfitId);
            const bindings = {
                '[[LPC_OUTFIT]]': outfit.name,
                '[[LPC_POSTURE]]': activityFor(state.presentation),
                '[[LPC_FACING]]': state.presentation.facing
            };
            promptBindings.apply(data.chat, content => {
                for (const [marker, value]of Object.entries(bindings)) content = content.replaceAll(marker, () => value);
                return content;
            });
            const injected = {
                role: 'system',
                content: writable ? contextFor(
                    state.definition,
                    state.presentation,
                    { compact: isScoped(), includeScene: includeScene() }
                ) : readOnlyContextFor([{ record: getRecord, label, contextDataFor }])
            };
            insertPromptMessage(data.chat, injected);
            prompts.set(data.chat, injected);
        }
    );
    listen('TOOL_CALLS_PERFORMED', invocations => {
        if (!run || !available()) return;
        for (const invocation of invocations ?? []) {
            if (!ALL_TOOL_NAMES.includes(invocation.name) || invocation.error) continue;
            try {
                const result = JSON.parse(invocation.result);
                const request = run.requests.get(result.requestId);
                if (request?.result === invocation.result && result.token === run.id) run.receipts.add(invocation);
            } catch { /* Foreign/malformed results cannot authorize a commit. */
            }
        }
        if (run.receipts.size) {
            run.recursive = true;
            run.target = null;
        }
    });
    listen('MESSAGE_RECEIVED', index => {
        if (!run || !run.receipts.size || !available()) return;
        const chat = getContext().chat;
        const lastTool = chat.findLastIndex(message => message?.is_system && message.extra?.tool_invocations?.some(invocation => run.receipts.has(invocation)));
        if (index > lastTool && lastTool >= 0 && responseAllowed(chat[index])) {
            clearEndTimer();
            run.target = responseFingerprint(chat, chat[index]);
            run.targetMessage = chat[index];
            if (!deferGroupAcceptance && !isGenerating()) return accept();
        }
    });
    async function accept() {
        clearEndTimer();
        const pending = run;
        if (!pending) return;
        if (!pending.target || !(deferGroupAcceptance ? baseAvailable() : available()) || isGenerating()) {
            if (!isGenerating()) cancel();
            return;
        }
        const context = getContext();
        if (context.chat[pending.target.index] !== pending.targetMessage || pending.targetMessage.mes !== pending.target.mes
            || !responseAllowed(pending.targetMessage)) {
            cancel();
            return;
        }
        // saveReply finalizes swipe metadata after MESSAGE_RECEIVED; capture its completed shape now.
        pending.target = responseFingerprint(context.chat, pending.targetMessage);
        const verifiedResults = new Set(context.chat.flatMap(message => message?.is_system ? message.extra?.tool_invocations
            ?? [] : []).filter(invocation => pending.receipts.has(invocation)).map(invocation => invocation.result));
        if ([...pending.requests.values()].some(request => !verifiedResults.has(request.result)) || !matchesAccepted(context.chat,
            pending.target) || !equal(getRecord().presentation, pending.baseline) || !equal(getRecord().definition,
            pending.baselineDefinition ?? pending.definition)) {
            cancel();
            return;
        }
        const token = epoch;
        run = null;
        try {
            const current = () => toolsAllowed() && !disposed && enabled && epoch === token && currentContext()
                && responseAllowed(pending.targetMessage) && matchesAccepted(getContext().chat, pending.target);
            const outcome = await apply(pending, current);
            if (current())
                report(outcome?.actionFailed ? 'Model appearance saved; the brief action could not start.' : 'Model presentation applied to the accepted response.');
        } catch (error) {
            report(`Model update was not applied: ${error.message} The last valid appearance is retained.`);
        }
    }
    listen('GENERATION_ENDED', () => {
        if (deferGroupAcceptance) return;
        if (run && run.receipts.size && !run.target && !isGenerating()) {
            const pending = run;
            clearEndTimer();
            endTimer = setTimeout(() => {
                endTimer = null;
                if (run === pending && !run.target && !isGenerating()) cancel();
            }, 0);
            return;
        }
        return accept();
    });
    if (deferGroupAcceptance) listen('GROUP_WRAPPER_FINISHED', accept);
    for (const name of [
        'GENERATION_STOPPED',
        'CHAT_CHANGED',
        'MESSAGE_SWIPED',
        'MESSAGE_SWIPE_DELETED',
        'MESSAGE_EDITED'
    ]) listen(name, cancel);
    listen('MESSAGE_DELETED', () => {
        if (deferGroupAcceptance && run?.target) {
            if (!getContext().chat.includes(run.targetMessage) || run.targetMessage.mes !== run.target.mes) cancel();
        } else if (!isGenerating() || run?.target) cancel();
    });
    function unregisterAll(context = getContext()) {
        for (const name of ALL_TOOL_NAMES) context?.unregisterFunctionTool?.(name);
    }
    function register() {
        if (hub) {
            if (enabled && !disposed && getRecord()?.definition)
                hub.update(ownerKey, {
                    label,
                    available,
                    describeAvailable: contextAvailable,
                    record: getRecord,
                    invoke,
                    cancel,
                    state: () => run ? {
                        definition: run.definition,
                        presentation: run.presentation,
                        prepared: run.requests.size > 0
                    } : null,
                    explicit: explicitTarget,
                    defaultBindings,
                    contractFor,
                    toolsFor,
                    contextDataFor,
                    activityFor,
                    description
                });
            else hub.remove(ownerKey);
            return;
        }
        const context = getContext();
        unregisterAll(context);
        if (toolsAllowed() && enabled && typeof context.registerFunctionTool === 'function' && getRecord()?.definition) {
            if (isScoped()) {
                for (const tool of toolsFor(getRecord().definition, getRecord().presentation, { includeScene: includeScene() })) {
                    context.registerFunctionTool({
                        ...tool,
                        action: args => invoke(args, tool.name),
                        shouldRegister: available,
                        formatMessage: () => `Preparing ${tool.displayName.toLowerCase()}`,
                        stealth: false,
                    });
                }
            } else {
                context.registerFunctionTool({
                    name: TOOL_NAME,
                    displayName: 'Companion presentation',
                    description,
                    parameters: contractFor(
                        getRecord().definition,
                        getRecord().presentation,
                        { includeScene: includeScene(), compact: false }
                    ).schema,
                    action: args => invoke(args, TOOL_NAME),
                    shouldRegister: available,
                    formatMessage: () => 'Preparing companion presentation',
                    stealth: false
                });
            }
        }
    }
    const unsubscribePolicy = toolPolicy?.subscribe(() => {
        if (!toolsAllowed()) cancel();
        if (!disposed) register();
    });
    return {
        cancel,
        refresh: register,
        enable(value) {
            enabled = value;
            cancel();
            register();
            report(deferGroupAcceptance && enabled && baseAvailable() ? 'Model controls enabled for this member’s group turns · updates wait for the completed batch.'
                : available() ? 'Model controls enabled for this open panel.' : 'Model tools unavailable or disabled · manual controls remain available.');
        },
        dispose() {
            if (disposed) return;
            enabled = false;
            disposed = true;
            cancel();
            unsubscribePolicy?.();
            if (hub) hub.remove(ownerKey);
            else unregisterAll();
            for (const [source, event, handler]of subscriptions) source.removeListener(event, handler);
        },
    };
}
