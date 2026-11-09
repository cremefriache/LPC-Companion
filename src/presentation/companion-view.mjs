import {generatorImportReport} from '../state/generator-import.mjs';
import { composeActivity, composeSequence } from './animation-sheets.mjs';
import { ACTIVITIES, activityAnimation, activityName, actionName, supportedActions, validateSequence } from '../state/animation-program.mjs';
import { PARTY_SCENES, partyScene } from '../state/party.mjs';
import { createOutfitGallery } from './outfit-gallery.mjs';
import { duplicateOutfit, removeOutfit, applyPalettePreset, PALETTE_PRESETS, neutralFaceForHead, changeBodyType, MAX_OUTFITS, nextOutfitId } from '../state/wardrobe.mjs';
import { createPresence, MOODS, moodLabel } from './presence.mjs';
import { createModelControl } from '../adapter/model-control.mjs';
import { catalog, label, selectionsFor, capabilities } from '../catalog/catalog.mjs';
import { createDefinition } from '../state/defaults.mjs';
import { validateDefinition, validatePresentation } from '../state/validate.mjs';
import { createRenderTransaction } from '../state/render-transaction.mjs';
import { createBrowserComposer } from './browser-composer.mjs';
import { createPlayer, CUE_REPEAT_MS } from './player.mjs';
import { BRIEF_ACTIONS } from '../state/actions.mjs';
import { makeUuid } from '../adapter/uuid.mjs';
import { exportCompanion } from '../state/packages.mjs';
import { exportPortableCompanion, importCompanionDocument } from '../state/portable-packages.mjs';
import { PACKAGE_LIMIT } from '../state/portable-assets.mjs';
import { BACKGROUNDS, LIGHTS, SCENE_PRESETS } from '../catalog/scenes.mjs';
import { createStage, drawScenePreview } from './stage.mjs';
import { ACTION_ICONS, createBlockerBanner, createControlGroup, createIcon, createLuciteIcon, createSectionHeader, createToggleRow, decorateButton, decorateIconButton } from './molecules.mjs';
import { readRepertoire, subscribeRepertoire, isActionEnabledInRepertoire } from '../state/repertoire.mjs';
import { createRepertoireCustomizer } from './repertoire-ui.mjs';
import { attachTamagotchiBehaviors } from './floating-launcher.mjs';

export function createCompanionView({ document, window, active, sessions, baseUrl, initialRecord,onSourceStudio,settingsContainer,settingsId, isGenerating = () => false, revealSettings = () => {}, viewId='lpc-companion', title='LPC Companion', chatOnly=false, toolHub, preferences, modelOptions={}, onPanelClosed=()=>{}, onPanelOpened=()=>{}, canAutoOpen=()=>true, returnFocus=null,whenContextReady=async()=>{}, preparePresentation=async()=>null, onPresentation=()=>{}, onCue=()=>{},onSequence=()=>false,onStopSequence=()=>{},onPause=()=>{}, onSpeech=()=>{}, onModelEnabled=()=>{}, onEditorClosed=()=>{} }) {
    const container = settingsContainer??document.querySelector('#extensions_settings');
    if (!container) return null;
    const element = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const button = (text, action, control) => {
        const node = element('button', text); node.type = 'button'; node.onclick = action;
        if (control) node.dataset.control = control;
        return node;
    };
    function select(text, options, control) {
        const wrap = element('label', undefined, 'lpc-field');
        const input = element('select'); input.dataset.control = control;
        for (const [value, name] of options) { const option = element('option', name); option.value = value; input.append(option); }
        wrap.append(element('span', text), input);
        return { wrap, input };
    }
    function sceneControls(prefix, initial, changed) {
        const wrap = element('fieldset'); wrap.append(element('legend', prefix ? 'Starting scene' : 'Stage layout'));
        const background = select('Background', BACKGROUNDS, `${prefix}scene-background`);
        const light = select('Background light', LIGHTS, `${prefix}scene-light`);
        const preset = select('Scene layout', [['','Custom layout'],...Object.entries(SCENE_PRESETS).map(([id,value])=>[id,value.name])], `${prefix}scene-preset`);
        const ranges = Object.fromEntries([['x','Horizontal placement',0,1,0.05],['y','Vertical placement',0,1,0.05],['scale','Character scale',0.5,1.25,0.05]].map(([id,name,min,max,step])=>{
            const label=element('label',undefined,'lpc-field'), input=element('input'), output=element('output');
            input.type='range'; input.min=min; input.max=max; input.step=step; input.dataset.control=`${prefix}scene-${id}`;
            label.append(element('span',name),input,output);input.oninput=()=>{output.textContent=Number(input.value).toFixed(2);};
            wrap.append(label);return [id,{input,output}];
        }));
        wrap.prepend(wrap.querySelector('legend'),background.wrap,light.wrap,preset.wrap);
        let selected;
        const read=()=>structuredClone(selected);
        const set=value=>{selected={...value,lightId:value.lightId??'day'};background.input.value=value.backgroundId;light.input.value=value.lightId??'day';preset.input.value='';for(const [id,control]of Object.entries(ranges)){control.input.value=value[id];control.output.textContent=Number(value[id]).toFixed(2);}};
        const inputs=[background.input,light.input,...Object.values(ranges).map(value=>value.input),preset.input];
        for(const input of inputs)input.onchange=()=>{
            if(input===preset.input && Object.hasOwn(SCENE_PRESETS,preset.input.value))set(SCENE_PRESETS[preset.input.value].scene);
            else {
                preset.input.value='';
                if(input===background.input)selected.backgroundId=input.value;
                else if(input===light.input)selected.lightId=input.value;
                else for(const [id,control]of Object.entries(ranges))if(input===control.input)selected[id]=Number(input.value);
            }
            changed(read());
        };
        wrap.append(element('p','Visual approximations only. Backdrops and placement do not establish story location or time. Lighting affects the background, not skin or clothes.','lpc-note'));
        set(initial);return {wrap,read,set,inputs};
    }
    const root = element('section', undefined, 'lpc-companion lpc-settings-card'); root.id = settingsId??viewId;
    const cardHead = createSectionHeader(document, {
        icon: 'sparkles',
        title: title==='LPC Companion'?'Current companion':title,
        subtitle: chatOnly ? 'Chat-local companion snapshot' : 'Character defaults & active chat continuity',
    });
    const heading = cardHead.heading; heading.id = `${viewId}-title`;
    root.setAttribute('aria-labelledby', heading.id);
    const notice = element('p', 'Companion defaults are saved on this character. Each chat keeps its own snapshot and accepted appearance history.', 'lpc-note');
    const shouldOpenStudioOnSetup = () => Boolean(onSourceStudio && !window.testHost && !sessions.get(active)?.definition);
    const launch = decorateButton(document, button('Set up companion', () => {
        if (shouldOpenStudioOnSetup()) return onSourceStudio(undefined, undefined, 'both');
        return open(!sessions.get(active)?.definition);
    }, 'open'), 'sparkles');
    launch.classList.add('lpc-primary-wide');
    const launchError = element('p', undefined, 'lpc-status-banner'); launchError.setAttribute('role', 'status');
    const credits = element('a', 'Artwork & code credits');
    credits.href = new URL('assets/lpc/credits.html', baseUrl).href; credits.target = '_blank'; credits.rel = 'noopener';
    if(chatOnly)notice.textContent='This companion is a chat-local snapshot with its own UUID. Source card defaults are copied once; this panel never writes them.';
    let studioLaunchBtn = null;
    const launcherActions=element('div',undefined,'lpc-settings-primary-actions lpc-settings-actions');launcherActions.append(launch);if(onSourceStudio){studioLaunchBtn=decorateButton(document,button('Catalog studio',()=>void onSourceStudio(),'source-studio'),'sliders');studioLaunchBtn.hidden=Boolean(!window.testHost&&!initialRecord?.definition);launcherActions.append(studioLaunchBtn);const importJson=decorateButton(document,button('Import JSON',()=>void onSourceStudio(undefined,undefined,undefined,true),'import-generator-json'),'upload');importJson.setAttribute('aria-label','Import generator JSON');importJson.title='Paste or choose a .json character exported by the official LPC generator';launcherActions.append(importJson);}launcherActions.append(credits);
    const files=element('details',undefined,'lpc-files');files.dataset.control='files';files.append(element('summary','Sharing & recovery'));
    root.append(cardHead.element,notice,launcherActions,launchError,files); container.append(root);
    let modelControl, wardrobeGallery, editorGallery, refreshAvailability, presence, stageView;
    let refreshDepth = 0;
    const refreshDisabled = new Map();
    const refreshWaiters = [];
    const waitForRefresh = () => refreshDepth ? new Promise(resolve => refreshWaiters.push(resolve)) : Promise.resolve();
    let panel, composer, player, transaction, previewTransaction, record, editor, refreshRender, showImported, showDefinitionEditor, tamaBehaviors = null;
    const urls = new Map();
    let disposed = false, requested = null, command = 0, lastCandidate = null, panelEpoch = 0, importEpoch = 0;
    let stagedAssets = {}, managedDockTarget=null;
    let exportJob=null,clearProgram=null,pendingModelConsent=false;
    const toolsAllowed=()=>!preferences||(preferences.get().enabled!==false&&preferences.get().toolCalling===true);
    function syncModelToggle(){const input=panel?.querySelector('[data-control=model-controls]');if(input)input.disabled=!toolsAllowed()||refreshDepth>0;}
    function enableModel(value){
        pendingModelConsent=false;
        if(disposed||!panel||!modelControl)return false;
        const input=panel.querySelector('[data-control=model-controls]'),requested=Boolean(value)&&toolsAllowed();input.checked=requested;syncModelToggle();
        try{modelControl.enable(requested);onModelEnabled(requested);return !value||requested;}
        catch(error){input.checked=false;modelControl.enable(false);onModelEnabled(false);const status=panel.querySelector('[data-control=model-status]');if(status)status.textContent=error.message;return false;}
    }
    const unsubscribePreferences=preferences?.subscribe((next,previous)=>{
        if(disposed)return;
        if(next.toolCalling!==previous?.toolCalling||next.enabled!==previous?.enabled){pendingModelConsent=next.enabled!==false&&next.toolCalling===true;if(panel)enableModel(pendingModelConsent);}
        if(next.dock&&next.dock!==previous?.dock){
            if(record)record.dock=next.dock;
            if(panel&&!managedDockTarget){
                const dockInput=panel.querySelector('[data-control=dock]');
                if(dockInput)dockInput.value=next.dock;
                panel.dataset.dock=next.dock;
                (next.dock==='inline'?root:document.body).append(panel);
                tamaBehaviors?.sync();
            }
        }
    });


    function close(focus = true) {
        pendingModelConsent=false;
        importEpoch++;panelEpoch++;
        command++;
        clearProgram?.();clearProgram=null;
        onModelEnabled(false);
        tamaBehaviors?.dispose(); tamaBehaviors = null;
        modelControl?.dispose(); modelControl = null;
        presence?.dispose(); presence = null;
        stageView?.dispose(); stageView = null;
        wardrobeGallery?.dispose(); editorGallery?.dispose(); wardrobeGallery = editorGallery = null;
        transaction?.dispose(); previewTransaction?.dispose(); player?.dispose(); composer?.dispose();
        panel?.remove(); panel = null; editor = null;
        stagedAssets = {};
        transaction = previewTransaction = player = composer = null;
        refreshDisabled.clear();
        lastCandidate = requested = refreshRender = showImported = showDefinitionEditor = refreshAvailability = null;
        onPanelClosed();
        if (focus && !disposed) { if(returnFocus)returnFocus();else{revealSettings(); launch.focus();} }
    }
    async function open(edit, fromRefresh = false, quiet = false) {
        if (disposed) return;
        if (panel) {onPanelOpened({automatic:fromRefresh||quiet});if(!fromRefresh&&!quiet)panel.querySelector('button')?.focus();return;}
        const opening = ++panelEpoch;
        try {
            const loaded = await sessions.create(active);
            if (!fromRefresh) await waitForRefresh();
            if (disposed || opening !== panelEpoch) return;
            record = sessions.get(active) ?? loaded;
            if (record.conflict) throw Error(record.conflict);
        } catch (error) { if (!disposed) launchError.textContent = error.message; return; }
        record.dock = preferences?.get().dock ?? record.dock ?? 'left';
        panel = element('section', undefined, 'lpc-companion lpc-panel'); panel.id = `${viewId}-panel`;
        panel.setAttribute('aria-label', `${title} panel`); panel.dataset.dock = managedDockTarget ? 'inline' : record.dock;
        const header = element('header');
        const headerLead = element('div', undefined, 'lpc-panel-title-wrap');
        const headerCopy = element('div', undefined, 'lpc-header-copy');
        const resolveAvatarTitle = () => {
            if (chatOnly && title && title !== 'LPC Companion') {
                const clean = title.replace(/^Companion\s*·\s*/i, '').trim();
                return clean ? `${clean}'s avatar` : title;
            }
            const ctx = window.SillyTavern?.getContext?.();
            const charName = ctx?.characters?.[active?.characterIndex]?.name?.trim() || ctx?.name2?.trim() || (title && title !== 'LPC Companion' && title !== 'Primary companion' ? title.trim() : '');
            return charName ? `${charName}'s avatar` : 'Character avatar';
        };
        const headerKicker = element('span', chatOnly ? 'Companion avatar' : 'Character avatar', 'lpc-header-kicker');
        const panelHeading = element('span', resolveAvatarTitle(), 'lpc-eyebrow');
        headerCopy.append(headerKicker, panelHeading);
        headerLead.append(createLuciteIcon(document, 'shirt', 'lpc-lucite-icon-sm'), headerCopy);
        const dock = select('Panel position', [['left', 'Left dock'], ['right', 'Right dock'], ['inline', 'In settings']], 'dock'); dock.input.value = record.dock;
        dock.input.setAttribute('aria-label', 'Panel position');
        dock.wrap.classList.add('lpc-toolbar-dock', 'lpc-header-dock');
        dock.input.onchange = () => {
            record.dock = dock.input.value;
            if (!managedDockTarget) preferences?.set({ dock: dock.input.value });
            panel.dataset.dock = managedDockTarget ? 'inline' : record.dock;
            (managedDockTarget ?? (record.dock === 'inline' ? root : document.body)).append(panel);
            tamaBehaviors?.sync();
            if (!managedDockTarget && record.dock === 'inline') revealSettings();
        };
        const setMinimized = value => {
            record.minimized = Boolean(value);
            if (record.minimized) panel.dataset.minimized = 'true';
            else delete panel.dataset.minimized;
            minimizeBtn.setAttribute('aria-pressed', String(record.minimized));
            decorateIconButton(document, minimizeBtn, record.minimized ? 'maximize' : 'minus', record.minimized ? 'Expand companion controls' : 'Minimize to compact view');
            tamaBehaviors?.sync();
        };
        const minimizeBtn = decorateIconButton(document, button('', event => { event.stopPropagation(); setMinimized(!record.minimized); }, 'minimize'), 'minus', 'Minimize to compact view');
        const closeBtn = decorateIconButton(document, button('', event => { event.stopPropagation(); close(); }, 'hide'), 'x', 'Close panel');
        if (quiet && record.minimized === undefined && !window.testHost && !window.review && !managedDockTarget && (window.visualViewport?.width ?? window.innerWidth) > 700) record.minimized = true;
        setMinimized(Boolean(record.minimized && !edit));
        const headerActions = element('div', undefined, 'lpc-header-actions');
        headerActions.append(dock.wrap, minimizeBtn, closeBtn);
        header.append(headerLead, headerActions);
        const stageCard = element('div', undefined, 'lpc-stage-card');
        const stage = element('div', undefined, 'lpc-stage');
        stage.onclick = event => { if ((record?.minimized || panel?.dataset.minimized === 'true') && !tamaBehaviors?.shouldSuppressStageClick?.() && !event.target.closest('button,[data-control=tama-resize]')) setMinimized(false); };
        const canvas = element('canvas'); canvas.width = 192; canvas.height = 192; canvas.dataset.control = 'character';
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Companion preview loading');
        presence = createPresence({ document, onDismiss: () => { onSpeech(null); panel?.querySelector('[data-control=hide]')?.focus(); } });
        const stageCaption = element('span', 'A moment in the conversation', 'lpc-stage-caption');
        stageCaption.prepend(createIcon(document, 'trees'));
        stage.append(stageCaption, presence.mood, canvas);
        const outfitName = element('h3', 'Preparing your companion…', 'lpc-outfit-name');
        const status = element('p', 'Loading local sprites…', 'lpc-status'); status.setAttribute('role', 'status');
        const activityStatus=element('p','Resting','lpc-activity');activityStatus.dataset.control='activity-status';
        const sessionNote = element('p', record.binding ? 'Saved chat appearance' : 'Preview · Apply setup to save', 'lpc-note lpc-group-note');
        const controls = element('div', undefined, 'lpc-controls');
        const outfit = select('Outfit', [], 'outfit');
        const wardrobeBrowser = element('details', undefined, 'lpc-wardrobe-browser'); wardrobeBrowser.dataset.control = 'wardrobe-browser';
        const wardrobeSummary = element('summary');
        const wardrobeSummaryLead = element('span', undefined, 'lpc-summary-lead');
        wardrobeSummaryLead.append(createIcon(document, 'sparkles'), element('span', 'Browse outfits · favorites first'));
        wardrobeSummary.append(wardrobeSummaryLead);
        wardrobeBrowser.append(wardrobeSummary);
        const supportNote = element('p', '', 'lpc-note'); supportNote.dataset.control = 'capabilities';
        const posture = select('Resting posture', [['idle', 'Idle'], ['walk', 'Walk']], 'posture');
        const activity=select('Ongoing activity',Object.entries(ACTIVITIES).map(([id,value])=>[id,value.name]),'activity');activity.input.title='Sitting holds a static source pose with direct entry/exit cuts; no chair or transition animation is implied.';
        const facing = select('Facing', [['south', 'Front'], ['west', 'Left'], ['north', 'Back'], ['east', 'Right']], 'facing');
        const liveScene = sceneControls('', record.presentation?.scene ?? {backgroundId:'plain',x:0.5,y:1,scale:1}, scene => {
            if(record.definition) void render({definition:record.definition,presentation:{...record.presentation,scene}});
        });
        const partySceneControl = select('Shared scene', PARTY_SCENES.map(([id,name])=>[id,name]), 'party-scene');
        partySceneControl.input.value=record.presentation?.partySceneId??'together';
        partySceneControl.input.onchange=()=>{if(record.definition)void render({definition:record.definition,presentation:{...record.presentation,partySceneId:partySceneControl.input.value}});};
        const sceneSummary = element('summary');
        const sceneSummaryLead = element('span', undefined, 'lpc-summary-lead');
        sceneSummaryLead.append(createIcon(document, 'trees'), element('span', 'Stage, Lighting & Placement'));
        sceneSummary.append(sceneSummaryLead);
        const sceneDetails = element('details',undefined,'lpc-scene-controls'); sceneDetails.append(sceneSummary,partySceneControl.wrap,liveScene.wrap);
        const mood = select('Mood / expression', MOODS.map(id => [id, moodLabel(id)]), 'mood');
        const pause = decorateButton(document, button(record.paused ? 'Resume' : 'Pause', () => {
            record.paused = !record.paused; player.pause(record.paused); onPause(record.paused); decorateButton(document, pause, record.paused ? 'play' : 'pause', record.paused ? 'Resume' : 'Pause');
            pause.setAttribute('aria-pressed', String(record.paused));
        }, 'pause'), record.paused ? 'play' : 'pause'); pause.setAttribute('aria-pressed', String(record.paused));
        const run = decorateButton(document, button('Run preview', () => {
            modelControl?.cancel();
            if (record.definition) void render({ definition: record.definition, presentation: record.presentation, animation: 'run', mode: 'preview' });
        }, 'run'), 'play');
        const rest = decorateButton(document, button('Return to rest', () => { modelControl?.cancel(); if (record.definition) void render({ definition: record.definition, presentation: record.presentation, mode: 'preview' }); }, 'rest'), 'rotate');
        run.title = 'Loop the supported run animation. Return to rest ends the preview.';
        const actions = element('div', undefined, 'lpc-actions');
        const cueButtons = BRIEF_ACTIONS.map(actionId => decorateButton(document, button(actionName(actionId), () => void playCue(actionId), actionId), ACTION_ICONS[actionId] ?? 'wand'));
        actions.append(...cueButtons, run, rest);
        const sequenceDetails=element('details',undefined,'lpc-sequence-controls');sequenceDetails.dataset.control='sequence-controls';
        const sequenceSummary = element('summary');
        const sequenceSummaryLead = element('span', undefined, 'lpc-summary-lead');
        sequenceSummaryLead.append(createIcon(document, 'play'), element('span', 'Action sequences'));
        sequenceSummary.append(sequenceSummaryLead);
        sequenceDetails.append(sequenceSummary,element('p','Play up to four actions in order, then resume the current activity. New requests replace the whole sequence.','lpc-note'));
        const sequenceGrid = element('div', undefined, 'lpc-field-grid');
        const choices=Array.from({length:4},(_,index)=>{const control=select(`Step ${index+1}`,[['','No step'],...BRIEF_ACTIONS.map(id=>[id,actionName(id)])],`sequence-step-${index+1}`);control.input.value=index===0?'jump':index===1?'spellcast':'';sequenceGrid.append(control.wrap);return control.input;});
        sequenceDetails.append(sequenceGrid);
        const progressLabel=element('p','','lpc-note');progressLabel.dataset.control='sequence-status';progressLabel.setAttribute('role','status');
        let recentProgram=null,playingProgram=null;
        const playSeqBtn = decorateButton(document, button('Play sequence',()=>void playProgram(choices.filter(input=>input.value).map(input=>({actionId:input.value}))),'sequence-play'), 'play');
        const replay=decorateButton(document, button('Replay last sequence',()=>{if(recentProgram)void playProgram(recentProgram);},'sequence-replay'), 'rotate');replay.disabled=true;
        const stop=decorateButton(document, button('Stop sequence',()=>{modelControl?.cancel();stopPlayback();status.textContent='Sequence stopped · returned to the current activity.';},'sequence-stop'), 'stop');
        function stopPlayback(forget=false){command++;playingProgram=null;player?.cancel();onStopSequence();if(record?.presentation){panel.dataset.animation=activityAnimation(record.presentation);canvas.setAttribute('aria-label',`Companion ${activityName(record.presentation)}`);}if(!forget&&recentProgram)progressLabel.textContent='Sequence stopped. Replay is available.';if(forget){recentProgram=null;replay.disabled=true;progressLabel.textContent='';}delete panel.dataset.sequenceStep;}
        clearProgram=()=>stopPlayback(true);
        const stopActivity=decorateButton(document, button('Stop activity',()=>{if(record.definition)void render({definition:record.definition,presentation:{...record.presentation,activityId:'none',posture:'idle'}});},'activity-stop'), 'rotate');
        const sequenceButtons = element('div', undefined, 'lpc-sequence-buttons');
        sequenceButtons.append(playSeqBtn, replay, stop, stopActivity);
        sequenceDetails.append(sequenceButtons, progressLabel);
        const actionLabel=id=>actionName(id);
        async function playCue(actionId,response=null){return playProgram([{actionId}],response);}
        const prepareProgram=(sequence,definition,presentation)=>composeSequence(composer,sequence,definition,presentation);
        async function playProgram(sequence,response=null,prepared=null){
            if(refreshDepth){status.textContent='Wait for saved appearance reconciliation to finish.';return false;}
            if(response===null)modelControl?.cancel();
            if(stage.getAttribute('aria-busy')==='true'){status.textContent='Wait for the appearance update to finish.';return false;}
            const id=++command;
            try{
                const {definition,presentation}=record;if(!definition)return false;
                const validated=validateSequence(sequence.map(({actionId})=>({actionId})),definition,presentation);
                const [steps,resting]=prepared??await Promise.all([prepareProgram(validated.map(({actionId})=>({actionId})),definition,presentation),composeActivity(composer,selectionsFor(definition,presentation.outfitId),presentation)]);
                if(disposed||id!==command||opening!==panelEpoch)return false;
                const playback={};playingProgram=playback;player.publish(resting,presentation.facing);recentProgram=validated.map(({actionId})=>({actionId}));replay.disabled=false;
                const label=recentProgram.map(step=>actionLabel(step.actionId)).join(' → ');
                const progress=(index,total)=>{if(disposed||playingProgram!==playback)return;panel.dataset.animation=steps[index].actionId;panel.dataset.sequenceStep=String(index);progressLabel.textContent=`${index+1}/${total} · ${actionLabel(steps[index].actionId)} · then ${activityName(presentation).toLowerCase()}`;activityStatus.textContent=`${index+1}/${total} · ${actionLabel(steps[index].actionId)}`;canvas.setAttribute('aria-label',`Companion performing ${actionLabel(steps[index].actionId)}`);};
                const done=reason=>{if(disposed||playingProgram!==playback)return;delete panel.dataset.sequenceStep;panel.dataset.animation=activityAnimation(record.presentation);const facingLabel={south:'Front',west:'Left',north:'Back',east:'Right'}[record.presentation.facing]??record.presentation.facing;activityStatus.textContent=`Activity · ${activityName(record.presentation)} (${facingLabel})`;canvas.setAttribute('aria-label',`Companion ${activityName(record.presentation)}`);progressLabel.textContent=`Last: ${label} · ${reason==='completed'?'complete':reason==='reduced-motion'?'skipped for reduced motion':'stopped'}. Replay is available.`;status.textContent=reason==='reduced-motion'?'Reduced motion · current activity retained.':'Ready · returned to the current activity.';};
                status.textContent=`${label} · returns to the current activity. No story outcome is implied.`;
                const hidden=Boolean(managedDockTarget?.hidden);if(!hidden&&response===null)stage.scrollIntoView({block:'nearest'});const shared=onSequence(steps,presentation.facing,hidden?done:undefined,hidden?progress:undefined);
                if(hidden&&shared)return true;
                player.playSequence(steps,presentation.facing,done,progress,{repeatMs:CUE_REPEAT_MS});return true;
            }catch(error){if(!disposed&&id===command)status.textContent=`${error.message} Your last valid appearance is retained.`;return false;}
        }
        const editButton = decorateButton(document, button('Edit', () => {
            if (onSourceStudio && !window.testHost) { void onSourceStudio(record.definition ?? lastCandidate?.definition, record.presentation, 'replacement'); return; }
            showEditor(record.definition ?? lastCandidate?.definition);
        }, 'edit'), 'sliders');
        editButton.title = 'Edit this chat appearance';
        editButton.setAttribute('aria-label', 'Edit this chat');
        const editDefaults = decorateButton(document, button('Edit future defaults', () => showEditor(record.defaults ?? record.definition, 'defaults'), 'edit-defaults'), 'sliders');
        if(chatOnly)editDefaults.hidden=true;
        const applyDefaults = decorateButton(document, button('Preview defaults here', () => showEditor(record.defaults ?? record.definition), 'apply-defaults'), 'refresh');
        if(chatOnly)applyDefaults.hidden=true;
        const reset = decorateButton(document, button('Preview chat start', () => showEditor(record.initial ?? record.definition), 'reset'), 'rotate');
        const retry = decorateButton(document, button('Retry', () => { if (lastCandidate) void render(lastCandidate); }, 'retry'), 'refresh'); retry.hidden = true;
        const panelToolbar = element('div', undefined, 'lpc-stage-footer lpc-panel-toolbar');
        const stageMeta = element('div', undefined, 'lpc-stage-meta');
        const stageTitleRow = element('div', undefined, 'lpc-stage-title-row');
        stageTitleRow.append(createIcon(document, 'star', 'lpc-svg-icon lpc-stage-star'), outfitName);
        stageMeta.append(stageTitleRow, activityStatus);
        const stageTransport = element('div', undefined, 'lpc-stage-transport');
        stageTransport.append(pause, editButton);
        panelToolbar.append(stageMeta, stageTransport);
        stageCard.append(stage, panelToolbar);
        const appearanceGroup = createControlGroup(document, { icon: 'shirt', title: 'Appearance & Pose', rightNode: sessionNote });
        const poseGrid = element('div', undefined, 'lpc-field-grid');
        poseGrid.append(activity.wrap, posture.wrap, facing.wrap, mood.wrap);
        appearanceGroup.element.append(outfit.wrap, wardrobeBrowser, poseGrid);
        const capabilityBadge = element('span', 'Ready', 'lpc-badge');
        const actionsGroup = createControlGroup(document, { icon: 'wand', title: 'Actions & Sequences', rightNode: capabilityBadge });
        const blockerBanner = createBlockerBanner(document);
        const repertoireCustomizer = createRepertoireCustomizer({
            document,
            window,
            getDefinition: () => record.definition,
            getOutfitId: () => record.presentation?.outfitId,
            onChange: () => {
                updateAvailability();
                modelControl?.refresh();
            },
        });
        actionsGroup.element.append(actions, blockerBanner.element, supportNote, sequenceDetails, repertoireCustomizer.element);
        const editorLaunches=element('div',undefined,'lpc-editor-launches');editorLaunches.append(editDefaults,applyDefaults,reset);
        if(onSourceStudio)editorLaunches.append(decorateButton(document, button('Full catalog studio',()=>void onSourceStudio(),'panel-source-studio'), 'sparkles'));
        const studioGroup = createControlGroup(document, { icon: 'sliders', title: 'Studio & Defaults' });
        studioGroup.element.append(editorLaunches);
        controls.append(appearanceGroup.element, actionsGroup.element, sceneDetails, studioGroup.element);
        const modelToggle = element('input');
        modelToggle.type = 'checkbox';
        modelToggle.dataset.control = 'model-controls';
        modelToggle.hidden = true;
        const modelStatus = element('p', '', 'lpc-note');
        modelStatus.dataset.control = 'model-status';
        modelStatus.setAttribute('role', 'status');
        panel.append(header, stageCard, controls, modelToggle, status, modelStatus, retry);
        (managedDockTarget ?? (record.dock === 'inline' ? root : document.body)).append(panel);
        tamaBehaviors = attachTamagotchiBehaviors({ document, window, panel, stageEl: stage, isMinimized: () => Boolean(record?.minimized || panel?.dataset.minimized === 'true'), isManaged: () => Boolean(managedDockTarget), onRedraw: () => player?.redraw() });
        onPanelOpened({automatic:fromRefresh||quiet});
        const embedded = () => ({ ...record.binding?.embeddedAssets, ...stagedAssets });
        composer = createBrowserComposer(document, baseUrl, embedded);
        stageView = createStage({document,window,baseUrl,element:stage,getEmbeddedAssets:embedded});
        wardrobeGallery = createOutfitGallery({ document, compose: (...args) => composer.compose(...args), label: 'Choose an outfit', onSelect: id => { outfit.input.value = id; outfit.input.dispatchEvent(new window.Event('change')); } });
        wardrobeBrowser.append(wardrobeGallery.element);
        wardrobeBrowser.ontoggle = () => {
            if (disposed || opening !== panelEpoch) return;
            if (wardrobeBrowser.open && record.definition) void wardrobeGallery.render(record.definition, record.presentation.outfitId);
            else wardrobeGallery.clear();
        };
        player = createPlayer(canvas, stage, window); player.pause(record.paused);
        function updateAvailability() {
            if (!record.definition || !record.presentation) return;
            dock.input.disabled=Boolean(managedDockTarget);dock.wrap.hidden=Boolean(managedDockTarget);
            editDefaults.disabled = applyDefaults.disabled = reset.disabled = !record.binding;
            outfit.input.disabled = posture.input.disabled = facing.input.disabled = mood.input.disabled = !record.binding;
            for (const input of liveScene.inputs) input.disabled = !record.binding;
            const currentSelections = selectionsFor(record.definition, record.presentation.outfitId);
            const supported = capabilities(currentSelections);
            const rep = readRepertoire(record.definition, record.presentation.outfitId, window.localStorage);
            repertoireCustomizer.sync();
            run.hidden = !rep.poses.includes('run');
            run.disabled = !supported.includes('run'); run.title = run.disabled ? 'This outfit has no complete run animation.' : 'Loop run until Return to rest.';
            const actionsSupported=supportedActions(currentSelections);
            const visibleActionIds = BRIEF_ACTIONS.filter(id => isActionEnabledInRepertoire(id, rep));
            const supportedVisibleActions = visibleActionIds.filter(id => actionsSupported.includes(id));
            supportNote.textContent = `Available: ${[...supported.filter(id=>!['sit','emote'].includes(id)),...(supported.includes('sit')?['sit_low','sit_upright']:[]),...actionsSupported.filter(id=>id==='arms_raise')].map(id=>ACTIVITIES[id]?.name??actionName(id)).join(', ')}.`;
            cueButtons.forEach((button, index) => {
                const actionId = BRIEF_ACTIONS[index];
                button.hidden = !isActionEnabledInRepertoire(actionId, rep);
                button.disabled = !actionsSupported.includes(actionId);
                button.title = button.disabled ? Object.values(currentSelections).map(selection=>catalog.items[selection.itemId].unavailableAnimations?.[actionId]).find(Boolean)??'This outfit has no complete animation for this action.' : actionId==='arms_raise'?'Brief standing arm gesture; side views lift a leg. Returns to the accepted activity.':'Play once, then return to rest.';
            });
            const blockers = [];
            for (const selection of Object.values(currentSelections)) {
                const item = catalog.items[selection.itemId];
                if (!item) continue;
                const blockedNames = [
                    ...(!supported.includes('run') && !item.animations?.includes('run') ? ['Run'] : []),
                    ...visibleActionIds.filter(id => !actionsSupported.includes(id) && item.unavailableAnimations?.[id]).map(actionName),
                ];
                if (blockedNames.length) blockers.push(`${item.name} disables ${blockedNames.join(', ')}`);
            }
            blockerBanner.set(blockers.length ? `${blockers.join(' · ')}. Switch outfits or edit garments to use them.` : '');
            capabilityBadge.textContent = blockers.length ? `${supportedVisibleActions.length}/${visibleActionIds.length} ready` : 'All ready';
            capabilityBadge.dataset.tone = blockers.length ? 'warn' : 'ready';
            capabilityBadge.prepend(createIcon(document, blockers.length ? 'alert' : 'check'));
            activity.input.disabled=!record.binding;stopActivity.disabled=!record.binding;
            for (const option of activity.input.options) {
                option.hidden = option.value !== 'none' && option.value !== record.presentation.activityId && !rep.poses.includes(option.value);
                option.disabled = option.value !== 'none' && !supported.includes(ACTIVITIES[option.value].animationId);
            }
            for (const option of mood.input.options) {
                option.hidden = option.value !== 'none' && option.value !== (record.presentation.moodId ?? 'none') && !rep.expressions.includes(option.value);
            }
            for (const input of choices) {
                for (const option of input.options) {
                    option.hidden = Boolean(option.value) && option.value !== input.value && !isActionEnabledInRepertoire(option.value, rep);
                    option.disabled = Boolean(option.value) && !actionsSupported.includes(option.value);
                }
            }
            for (const option of posture.input.options) option.disabled = !supported.includes(option.value);
            syncModelToggle();
        }
        refreshAvailability = updateAvailability;
        let renderSequence = 0;
        transaction = createRenderTransaction(async (candidate, current) => {
            const guarded = () => current() && (candidate.origin !== 'model' || candidate.isCurrent?.() === true);
            if (!guarded()) throw Error('The model response is no longer active.');
            const definition = validateDefinition(candidate.definition);
            const presentation = validatePresentation(definition, definition.startingPresentation, candidate.presentation);
            const animation=candidate.animation??activityAnimation(presentation);
            const [sheet, preparedStage, preparedParty] = await Promise.all([candidate.animation?composer.compose(selectionsFor(definition,presentation.outfitId),animation,presentation.moodId):composeActivity(composer,selectionsFor(definition,presentation.outfitId),presentation),stageView.prepare(presentation.scene),preparePresentation(presentation,embedded()),stageView.prepare(partyScene(presentation.partySceneId))]);
            if (!guarded()) throw Error('The appearance request is no longer active.');
            const inputs = [...panel.querySelectorAll('button:not([data-control=hide],[data-control=minimize]), select, input')];
            const previous = inputs.map(node => node.disabled); inputs.forEach(node => { node.disabled = true; });
            try {
                const saved = await sessions.commit(active, { ...candidate, definition, presentation }, guarded);
                return { ...saved, animation, sheet, preparedStage, preparedParty };
            } finally { inputs.forEach((node, index) => { node.disabled = previous[index]; }); }
        }, (candidate, result) => {
            record = sessions.get(active) ?? record;
            if (result.defaultsOnly) { status.textContent = 'Future defaults saved. This chat is unchanged.'; return; }
            clearProgram?.();record.definition=result.definition;record.presentation=result.presentation;
            sessionNote.textContent = record.binding ? 'Saved chat appearance · changes follow the active response' : 'Preview · Apply setup to save';
            requested = structuredClone(result.presentation);
            stageView.publish(result.preparedStage,{transition:candidate.mode!=='restore'});
            liveScene.set(result.presentation.scene); partySceneControl.input.value=result.presentation.partySceneId??'together';
            player.publish(result.sheet, result.presentation.facing);
            outfit.input.replaceChildren();
            for (const entry of result.definition.outfits) { const option = element('option', entry.name); option.value = entry.id; outfit.input.append(option); }
            outfit.input.value = result.presentation.outfitId; mood.input.value = result.presentation.moodId ?? 'none'; presence.setMood(result.presentation.moodId ?? 'none');
            wardrobeBrowser.hidden = !record.binding;
            if (wardrobeBrowser.open) void wardrobeGallery.render(result.definition, result.presentation.outfitId);
            const facingLabel = { south: 'Front', west: 'Left', north: 'Back', east: 'Right' }[result.presentation.facing] ?? result.presentation.facing;
            activity.input.value=result.presentation.activityId??'none';activityStatus.textContent=`Activity · ${activityName(result.presentation)} (${facingLabel})`;posture.input.value = result.presentation.posture; facing.input.value = result.presentation.facing;
            dock.input.disabled=Boolean(managedDockTarget);dock.wrap.hidden=Boolean(managedDockTarget);
            editDefaults.disabled = applyDefaults.disabled = reset.disabled = !record.binding;
            outfit.input.disabled = posture.input.disabled = facing.input.disabled = mood.input.disabled = !record.binding;
            const name = result.definition.outfits.find(entry => entry.id === result.presentation.outfitId).name;
            outfitName.textContent = name;
            if (!editor) panelHeading.textContent = resolveAvatarTitle();
            canvas.setAttribute('aria-label', `Companion wearing ${name}, ${result.animation}, facing ${result.presentation.facing}`);
            panel.dataset.ready = 'true'; panel.dataset.outfit = result.presentation.outfitId; panel.dataset.animation = result.animation; panel.dataset.facing = result.presentation.facing;
            panel.dataset.identity = JSON.stringify(result.definition.identity);
            panel.dataset.companionId=root.dataset.companionId=result.definition.characterId;
            updateAvailability();
            status.textContent = candidate.mode==='preview'&&candidate.animation==='run' ? 'Run preview · use Return to rest to finish.' : '';
            decorateButton(document, launch, 'sparkles', 'Open companion');
            modelControl?.refresh();
            onPresentation(result);onPause(record.paused);onModelEnabled(Boolean(modelToggle.checked));
        });
        async function render(candidate, isCurrent) {
            if (refreshDepth && candidate.mode !== 'restore' && candidate.origin !== 'model') { status.textContent = 'Wait for saved appearance reconciliation to finish.'; return false; }
            stageView.cancelTransition();
            if (isCurrent) Object.defineProperty(candidate, 'isCurrent', { value: isCurrent });
            const id = ++command;
            const rendering = ++renderSequence;
            if (candidate.origin !== 'model' && candidate.mode !== 'restore' && candidate.mode !== 'preview') modelControl?.cancel();
            player.cancel();
            lastCandidate = structuredClone(candidate); retry.hidden = true;
            stage.setAttribute('aria-busy', 'true'); status.textContent = 'Preparing layers…';
            try { return await transaction.submit(candidate); }
            catch (error) {
                if (id !== command || disposed || !panel) return;
                status.textContent = `${error.message} Your last valid appearance is retained.`; retry.hidden = false;
                requested = structuredClone(record.presentation);
                if(record.presentation) liveScene.set(record.presentation.scene);
                if (wardrobeBrowser.open && record.definition) void wardrobeGallery.render(record.definition, record.presentation.outfitId);
                if (record.presentation) { activity.input.value=record.presentation.activityId??'none';outfit.input.value = record.presentation.outfitId; posture.input.value = record.presentation.posture; facing.input.value = record.presentation.facing; mood.input.value = record.presentation.moodId ?? 'none'; }
                return false;
            } finally { if (rendering === renderSequence && opening === panelEpoch && panel) {stage.setAttribute('aria-busy', 'false');syncModelToggle();} }
        }
        for (const [field, control] of [['activityId',activity],['outfitId', outfit], ['posture', posture], ['facing', facing], ['moodId', mood]]) control.input.onchange = () => {
            if (!record.definition) return;
            requested = { ...(requested ?? record.presentation), [field]: control.input.value };
            void render({ definition: record.definition, presentation: requested });
        };

        modelControl = createModelControl({ toolPolicy:preferences,active, getContext: () => window.SillyTavern.getContext(), getRecord: () => record,
            isGenerating, crypto: window.crypto, hub:toolHub, ownerKey:viewId, label:title, ...modelOptions,
            prepare: async (definition,presentation,actionId,sequence) => {
                await Promise.all([composeActivity(composer,selectionsFor(definition,presentation.outfitId),presentation),stageView.prepare(presentation.scene),preparePresentation(presentation,embedded()),stageView.prepare(partyScene(presentation.partySceneId))]);
                if(sequence)await prepareProgram(sequence.map(({actionId})=>({actionId})),definition,presentation);else if(actionId)await prepareProgram([{actionId}],definition,presentation);
            },
            apply: async (pending, current) => {
                await (sessions.whenIdle?.() ?? Promise.resolve());
                await Promise.resolve();
                while (refreshDepth) { await whenContextReady(); await waitForRefresh(); }
                await whenContextReady(); await waitForRefresh();
                if (!current()) throw Error('The response changed before publication.');
                const selections = selectionsFor(pending.definition, pending.presentation.outfitId);
                const sequence=pending.sequence??(pending.actionId?[{actionId:pending.actionId}]:null);
                const prepared=sequence?await Promise.all([prepareProgram(sequence.map(({actionId})=>({actionId})),pending.definition,pending.presentation),composeActivity(composer,selections,pending.presentation)]):null;
                if (!current()) throw Error('The response changed during final preparation.');
                const applied = await render({ definition: pending.definition, presentation: pending.presentation, origin: 'model', response: pending.target }, current);
                if (!applied || !current()) throw Error('The response update could not be confirmed.');
                if(sequence){
                    const receipt = window.SillyTavern.getContext().chat[pending.target.index]?.extra?.lpc_companion_receipts;
                    const anchor = receipt ? { messageId: receipt.messageId, swipeId: receipt.swipeId } : { messageId: makeUuid(window.crypto), swipeId: makeUuid(window.crypto) };
                    const played=await playProgram(sequence,anchor,prepared);
                    if (pending.speech && current()) {presence.showSpeech(pending.speech);onSpeech(pending.speech);}
                    return { actionFailed: !played };
                }
                if (pending.speech && current()) {presence.showSpeech(pending.speech);onSpeech(pending.speech);}
            },
            report: message => { if (!disposed && opening === panelEpoch) modelStatus.textContent = message; },
        });
        modelToggle.onchange = () => enableModel(modelToggle.checked);
        if(preferences)enableModel(pendingModelConsent || toolsAllowed());
        refreshRender = render; showDefinitionEditor = showEditor; showImported = (value, assets) => showEditor(value, 'replacement', assets);
        function showEditor(definition, scope = 'replacement', assets = {}) {
            if (!definition) return;
            setMinimized(false);
            if(definition.schemaVersion===2){void onSourceStudio?.(definition,definition.startingPresentation,scope);return;}
            stagedAssets = assets;
            editorGallery?.dispose(); editor?.remove(); previewTransaction?.dispose();
            let draft = structuredClone(definition);
            editor = element('form', undefined, 'lpc-editor');editor.dataset.control='editor';panel.dataset.editing='true';panelHeading.textContent=scope==='defaults'?'Future defaults':'Companion studio';
            const editorTitle = element('h4', 'Companion setup');
            const editorNote = element('p', scope==='defaults'?'Applies to new chats. Existing chats keep their current appearance.':record.binding?'Preview identity, outfits and a starting scene, then apply your changes to this chat.':'Preview identity, outfits and a starting scene before saving.', 'lpc-note');
            const studioPromo = element('div', undefined, 'lpc-studio-promo-bar');
            if (onSourceStudio) {
                const topStudioBtn = decorateButton(document, button('Open Full Catalog Studio (668 items, Closet & Swimwear)', () => void onSourceStudio(undefined, undefined, scope), 'editor-source-studio-top'), 'sparkles');
                topStudioBtn.classList.add('lpc-primary-wide');
                studioPromo.append(element('p', 'Viewing the basic 48-item starter setup. For all 668 items, the Character Closet, visual color swatches, and Swimwear / Lingerie / Bath assets, open the Full Catalog Studio:', 'lpc-note'), topStudioBtn);
            }
            const outfitViews = element('section', undefined, 'lpc-outfit-views'); outfitViews.dataset.control = 'outfit-views';
            outfitViews.setAttribute('role', 'group'); outfitViews.setAttribute('aria-label', 'Selected outfit from four directions');
            const previewTitle = element('strong', 'Outfit preview'), previewGrid = element('div', undefined, 'lpc-outfit-views-grid');
            const directionViews = [['south','Front'],['north','Back'],['west','Left'],['east','Right']].map(([facing, name]) => {
                const figure = element('figure'); figure.dataset.previewFacing = facing;
                const canvas = element('canvas'); canvas.width = canvas.height = 192; canvas.dataset.previewFacing = facing;
                if (facing === 'south') canvas.dataset.control = 'preview';
                canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${name} outfit preview`);
                const unavailable = element('p', 'View unavailable for this pose.', 'lpc-note'); unavailable.hidden = true;
                figure.append(canvas, element('figcaption', name), unavailable); previewGrid.append(figure);
                return { facing, name, canvas, unavailable };
            });
            outfitViews.append(previewTitle, previewGrid);
            const error = element('p'); error.setAttribute('role', 'status'); error.dataset.control = 'editor-status';
            const fields = element('fieldset'); fields.append(element('legend', 'Identity'));
            const bodyType = select('Body type (identity edit)', catalog.bodyTypes.map(id => [id, label(id)]), 'body-type'); bodyType.input.value = draft.identity.bodyType;
            const skin = select('Skin tone', catalog.paletteChoices.body.map(value => [value, label(value)]), 'skin'); skin.input.value = draft.identity.body.paletteId.split('.').at(-1);
            const hair = select('Hair / beard color', catalog.paletteChoices.hair.map(value => [value, label(value)]), 'hair'); hair.input.value = (draft.identity.hair?.paletteId??draft.identity.beard?.paletteId??'hair.ulpc.dark_brown').split('.').at(-1);
            const hairStyle=select('Hair style (identity edit)',[['','Bald / no hair'],...catalog.slots.hair.filter(id=>catalog.items[id].bodyTypes.includes(draft.identity.bodyType)).map(id=>[id,catalog.items[id].name])],'hair-style');hairStyle.input.value=draft.identity.hair?.itemId??'';
            const headStyle=select('Head style (identity edit)',[],'head-style');
            const updateHeadChoices=()=>{headStyle.input.replaceChildren(...catalog.slots.head.filter(id=>catalog.items[id].bodyTypes.includes(draft.identity.bodyType)).map(id=>{const option=element('option',catalog.items[id].name);option.value=id;return option;}));headStyle.input.value=draft.identity.head.itemId;};
            updateHeadChoices();
            const featureControls=['beard','ears'].map(slot=>{const choice=select(slot==='beard'?'Beard (matches hair color)':'Ears (match skin tone)',[['',slot==='beard'?'None':'Default'],...catalog.slots[slot].map(id=>[id,catalog.items[id].name])],slot);choice.input.value=draft.identity[slot]?.itemId??'';return {slot,choice};});
            const expression=select('Face layer',[['','Head default'],['neutral','Neutral overlay']],'expression');expression.input.value=draft.identity.expression?'neutral':'';
            fields.append(expression.wrap,bodyType.wrap,headStyle.wrap,skin.wrap,hairStyle.wrap,hair.wrap,...featureControls.map(({choice})=>choice.wrap));
            const wardrobe = element('fieldset'); wardrobe.append(element('legend', 'Named outfits'));
            const chosen = select('Edit outfit', draft.outfits.map(value => [value.id, value.name]), 'edit-outfit');
            const nameWrap = element('label', undefined, 'lpc-field'); const name = element('input'); name.type = 'text'; name.maxLength = 80; name.required = true; name.dataset.control = 'outfit-name'; nameWrap.append(element('span', 'Outfit name'), name);
            const shirt = select('Top', [['', 'No top'], ...catalog.slots.clothes.map(id => [id, catalog.items[id].name])], 'shirt');
            const shirtColor = select('Top color', catalog.paletteChoices.cloth.map(id => [id, label(id)]), 'shirt-color');
            const legs = select('Bottoms', [['', 'No bottoms'], ...catalog.slots.legs.map(id => [id, catalog.items[id].name])], 'legs');
            const legsColor = select('Bottom color', catalog.paletteChoices.cloth.map(id => [id, label(id)]), 'legs-color');
            const palettePreset = select('Top and bottoms palette', [['', 'Custom colors'], ...Object.entries(PALETTE_PRESETS).map(([id, preset]) => [id, preset.name])], 'palette-preset');
            const { wrap: favoriteLabel, input: favorite } = createToggleRow(document, {
                control: 'favorite',
                title: 'Favorite outfit',
                hint: 'Pin to the front of the outfit gallery',
                icon: 'star',
                className: 'lpc-model-toggle',
            });
            const extraControls = ['shoes', 'cape', 'accessory', 'prop'].map(slot => {
                const names = { shoes: 'Footwear', cape: 'Cape', accessory: 'Cape accessory', prop: 'Visual prop' };
                const choice = select(names[slot], [['', 'None'], ...catalog.slots[slot].filter(id=>catalog.items[id].bodyTypes.includes(draft.identity.bodyType)).map(id => [id, id==='shield_heater_revised_wood'?'Wooden heater shield (legacy Brown)':catalog.items[id].name])], slot);
                const color = select(`${names[slot]} color`, [], `${slot}-color`);
                const syncColors = palette => {const material=catalog.items[choice.input.value]?.material??'original',values=catalog.paletteChoices[material];const selected=palette??color.input.value;color.input.replaceChildren(...values.map(id=>{const option=element('option',label(id));option.value=id;return option;}));color.input.value=values.includes(selected)?selected:values[0];color.wrap.hidden=material==='original';color.input.disabled=material==='original';};
                choice.input.addEventListener('change',()=>syncColors());syncColors();
                const refreshChoices=()=>{const selected=choice.input.value;choice.input.replaceChildren(...[['','None'],...catalog.slots[slot].filter(id=>catalog.items[id].bodyTypes.includes(draft.identity.bodyType)).map(id=>[id,id==='shield_heater_revised_wood'?'Wooden heater shield (legacy Brown)':catalog.items[id].name])].map(([id,name])=>{const option=element('option',name);option.value=id;return option;}));choice.input.value=selected;};
                return { slot, choice, color, syncColors, refreshChoices };
            });
            const extraNote = element('p', 'Footwear is optional. Shoes and sandals draw under trousers; boots draw over them. Cape trim requires the solid cape; capes disable Run and Jump. Props imply no inventory or combat state.', 'lpc-note');
            const extraCapabilities = element('p', '', 'lpc-note'); extraCapabilities.dataset.control = 'editor-capabilities';
            function updateBodyChoices() {
                for(const control of extraControls)control.refreshChoices();
                for (const [slot, control] of [['clothes', shirt], ['legs', legs]]) {
                    control.input.replaceChildren();
                    for (const [id, text] of [['', slot === 'clothes' ? 'No top' : 'No bottoms'], ...catalog.slots[slot].filter(id => catalog.items[id].bodyTypes.includes(draft.identity.bodyType)).map(id => [id, catalog.items[id].name])]) {
                        const option = element('option', text); option.value = id; control.input.append(option);
                    }
                }
            }
            const starting = select('Starting outfit', draft.outfits.map(value => [value.id, value.name]), 'starting-outfit'); starting.input.value = draft.startingPresentation.outfitId;
            const startingPosture = select('Starting posture', [['idle', 'Idle'], ['walk', 'Walk']], 'starting-posture'); startingPosture.input.value = draft.startingPresentation.posture;
            const startingActivity=select('Starting activity',Object.entries(ACTIVITIES).map(([id,value])=>[id,value.name]),'starting-activity');startingActivity.input.value=draft.startingPresentation.activityId??'none';
            const startingParty = select('Starting shared scene',PARTY_SCENES.map(([id,name])=>[id,name]),'starting-party-scene');startingParty.input.value=draft.startingPresentation.partySceneId??'together';
            const startingMood = select('Starting mood / expression', MOODS.map(id => [id, moodLabel(id)]), 'starting-mood'); startingMood.input.value = draft.startingPresentation.moodId ?? 'none';
            const startingFacing = select('Starting facing', [['south', 'Front'], ['west', 'Left'], ['north', 'Back'], ['east', 'Right']], 'starting-facing'); startingFacing.input.value = draft.startingPresentation.facing;
            function loadOutfit() {
                const value = draft.outfits.find(value => value.id === chosen.input.value);
                name.value = value.name; favorite.checked = value.favorite === true; palettePreset.input.value = '';
                remove.disabled = draft.outfits.length <= 1;
                for (const { slot, choice, syncColors } of extraControls) { choice.input.value = value.selections[slot]?.itemId ?? ''; syncColors(value.selections[slot]?.paletteId.split('.').at(-1)); }
                shirt.input.value = value.selections.clothes?.itemId ?? ''; shirtColor.input.value = value.selections.clothes?.paletteId.split('.').at(-1) ?? 'white';
                legs.input.value = value.selections.legs?.itemId ?? ''; legsColor.input.value = value.selections.legs?.paletteId.split('.').at(-1) ?? 'white';
            }
            function selectOutfit(id) { chosen.input.value = id; loadOutfit(); outfitViews.scrollIntoView({block:'nearest'}); void updatePreview(); }
            function appendOutfitOption(entry) {
                for (const control of [chosen.input, starting.input]) { const option = element('option', entry.name); option.value = entry.id; control.append(option); }
                selectOutfit(entry.id);
            }
            const duplicate = decorateButton(document, button('Duplicate outfit', () => {
                try {
                    const id = nextOutfitId(draft.outfits);
                    draft = duplicateOutfit(draft, chosen.input.value, id);
                    appendOutfitOption(draft.outfits.at(-1));
                } catch (failure) { error.textContent = failure.message; }
            }, 'duplicate-outfit'), 'copy');
            palettePreset.input.onchange = () => {
                if (!palettePreset.input.value) return;
                try { const presetId = palettePreset.input.value; draft = applyPalettePreset(draft, chosen.input.value, presetId); loadOutfit(); palettePreset.input.value = presetId; void updatePreview(); }
                catch (failure) { error.textContent = failure.message; }
            };
            editorGallery = createOutfitGallery({ document, compose: (...args) => composer.compose(...args), label: 'Preview and edit outfits', onSelect: selectOutfit });
            editorGallery.element.dataset.control = 'editor-gallery';
            const add = decorateButton(document, button('Add outfit', () => {
                if (draft.outfits.length >= MAX_OUTFITS) { error.textContent = 'A companion can have up to 99 outfits.'; return; }
                const id = nextOutfitId(draft.outfits);
                draft.outfits.push({ id, name: 'New outfit', selections: {} });
                appendOutfitOption(draft.outfits.at(-1));
            }, 'add-outfit'), 'plus');
            const remove = decorateButton(document, button('Remove outfit', () => {
                try {
                    const id = chosen.input.value;
                    draft = removeOutfit(draft, id);
                    for (const control of [chosen.input, starting.input]) [...control.options].find(option => option.value === id)?.remove();
                    starting.input.value = draft.startingPresentation.outfitId;
                    selectOutfit(draft.outfits[0].id);
                } catch (failure) { error.textContent = failure.message; }
            }, 'remove-outfit'), 'trash');
            remove.title = 'Keep at least one outfit. Apply saves the removal; Cancel discards it.';
            wardrobe.append(editorGallery.element, chosen.wrap, outfitViews, nameWrap, favoriteLabel, shirt.wrap, shirtColor.wrap, legs.wrap, legsColor.wrap, palettePreset.wrap, ...extraControls.flatMap(({ choice, color }) => color ? [choice.wrap, color.wrap] : [choice.wrap]), extraNote, extraCapabilities, add, duplicate, remove);
            const startingScene = sceneControls('starting-',draft.startingPresentation.scene,()=>void updatePreview());
            const editorRepertoire = createRepertoireCustomizer({
                document,
                window,
                getDefinition: () => draft,
                getOutfitId: () => chosen.input.value,
                onChange: () => {
                    updateAvailability();
                    modelControl?.refresh();
                },
            });
            const defaults = element('fieldset'); defaults.append(element('legend', 'Starting presentation'), starting.wrap, startingPosture.wrap,startingActivity.wrap, startingFacing.wrap, startingMood.wrap, startingParty.wrap,startingScene.wrap, editorRepertoire.element);
            previewTransaction = createRenderTransaction(async value => {
                const checked = validateDefinition(value), outfitId = chosen.input.value;
                const [sheet,scene] = await Promise.all([composeActivity(composer,selectionsFor(checked,outfitId),checked.startingPresentation),stageView.prepare(checked.startingPresentation.scene)]);
                return {sheet,scene,outfitId,outfitName:checked.outfits.find(outfit=>outfit.id===outfitId).name};
            }, (value, result) => {
                for (const {facing, name, canvas, unavailable} of directionViews) {
                    const supported = result.sheet.layout.directions.includes(facing);
                    if (supported) drawScenePreview(canvas,result.sheet,{...value.startingPresentation,facing},result.scene);
                    canvas.hidden = !supported; unavailable.hidden = supported;
                    canvas.setAttribute('aria-label', `${result.outfitName}: ${name} outfit preview`);
                }
                previewTitle.textContent = `Preview: ${result.outfitName}`;
                outfitViews.dataset.outfitId = result.outfitId; outfitViews.dataset.ready = 'true'; outfitViews.setAttribute('aria-busy', 'false');
                if(error.dataset.state!=='error'&&editor?.getAttribute('aria-busy')!=='true'){error.textContent='Preview ready. Apply to save this appearance.';error.dataset.state='ready';}
            });
            async function updatePreview() {
                if(editor?.getAttribute('aria-busy')==='true')return;error.dataset.state='previewing';
                outfitViews.dataset.ready = 'false'; outfitViews.setAttribute('aria-busy', 'true');
                shirtColor.input.disabled = !shirt.input.value;
                legsColor.input.disabled = !legs.input.value;
                try {
                    const entry = draft.outfits.find(value => value.id === chosen.input.value);
                    entry.name = name.value;
                    entry.favorite = favorite.checked;
                    // Outfit replacement always creates fresh garment selections.
                    entry.selections = {};
                    if (shirt.input.value) entry.selections.clothes = { itemId: shirt.input.value, paletteId: `cloth.ulpc.${shirtColor.input.value}` };
                    if (legs.input.value) entry.selections.legs = { itemId: legs.input.value, paletteId: `cloth.ulpc.${legsColor.input.value}` };
                    for (const { slot, choice, color } of extraControls) if (choice.input.value) entry.selections[slot] = { itemId: choice.input.value, paletteId: `${catalog.items[choice.input.value].material}.ulpc.${color.input.value}` };
                    draft.identity.body.paletteId = draft.identity.head.paletteId = `body.ulpc.${skin.input.value}`;
                    draft.identity.head.itemId=headStyle.input.value;
                    if(hairStyle.input.value){draft.identity.hair={itemId:hairStyle.input.value,paletteId:`hair.ulpc.${hair.input.value}`};delete draft.identity.bald;}else{delete draft.identity.hair;draft.identity.bald=true;}
                    if(expression.input.value)draft.identity.expression={itemId:neutralFaceForHead(draft.identity.head.itemId),paletteId:draft.identity.body.paletteId};else delete draft.identity.expression;
                    for(const {slot,choice}of featureControls){if(choice.input.value)draft.identity[slot]={itemId:choice.input.value,paletteId:slot==='beard'?`hair.ulpc.${hair.input.value}`:draft.identity.body.paletteId};else delete draft.identity[slot];}
                    if(startingActivity.input.value!=='none'||Object.hasOwn(draft.startingPresentation,'activityId'))draft.startingPresentation.activityId=startingActivity.input.value;
                    draft.startingPresentation = { ...draft.startingPresentation, outfitId: starting.input.value, posture: startingPosture.input.value, facing: startingFacing.input.value, moodId: startingMood.input.value, partySceneId:startingParty.input.value, scene:startingScene.read() };
                    for (const control of [chosen.input, starting.input]) for (const option of control.options) option.textContent = draft.outfits.find(value => value.id === option.value).name;
                    const checked = validateDefinition(draft);
                    extraCapabilities.textContent = `This outfit supports: ${capabilities(selectionsFor(checked, chosen.input.value)).map(id => id === 'spellcast' ? 'Cast gesture' : label(id)).join(', ')}.`;
                    void editorGallery.render(checked, chosen.input.value);
                    await previewTransaction.submit(checked);
                } catch (failure) { outfitViews.setAttribute('aria-busy', 'false'); error.textContent=failure.message;error.dataset.state='error'; }
            }
            bodyType.input.onchange = () => {
                try { draft = changeBodyType(draft, bodyType.input.value);updateHeadChoices();hairStyle.input.value=draft.identity.hair?.itemId??''; updateBodyChoices(); loadOutfit(); void updatePreview(); }
                catch (failure) { bodyType.input.value = draft.identity.bodyType; error.textContent = failure.message; }
            };
            chosen.input.onchange = () => selectOutfit(chosen.input.value);
            for (const control of [name, favorite, expression.input, ...featureControls.map(({choice})=>choice.input), headStyle.input, skin.input, hairStyle.input, hair.input, shirt.input, shirtColor.input, legs.input, legsColor.input, starting.input, startingPosture.input, startingActivity.input, startingFacing.input, startingMood.input, startingParty.input, ...extraControls.flatMap(({ choice, color }) => color ? [choice.input, color.input] : [choice.input])]) control.addEventListener(control === name ? 'input' : 'change', () => { if (control === shirtColor.input || control === legsColor.input) palettePreset.input.value = ''; void updatePreview(); });
            const apply = decorateButton(document, button(scope === 'defaults' ? 'Save future defaults' : record.binding ? 'Apply to this chat' : 'Save setup and initialize chat', null, 'apply'), 'check'); apply.type = 'submit';
            const cancel = decorateButton(document, button('Cancel edits', () => { stagedAssets = {}; previewTransaction.dispose(); editorGallery.dispose(); editorGallery = null; editor.remove();editor=null;delete panel.dataset.editing;panelHeading.textContent=resolveAvatarTitle();editButton.focus();onEditorClosed({saved:false,scope}); }, 'cancel'), 'x');
            editor.onsubmit = async event => {
                event.preventDefault();const form=editor;const previousInputs=[...form.querySelectorAll('button,input,select,textarea')].map(node=>[node,node.disabled]);for(const [node]of previousInputs)node.disabled=true;editor.setAttribute('aria-busy','true');error.textContent='Saving your changes…';error.dataset.state='busy';
                try {
                    const checked = validateDefinition(draft);
                    checked.revision++;
                    const applied = await render({ definition: checked, presentation: checked.startingPresentation, mode: scope, embeddedAssets: stagedAssets });
                    if (applied && opening === panelEpoch && editor) { stagedAssets = {}; previewTransaction.dispose(); editorGallery.dispose(); editorGallery = null; editor.remove();editor=null;delete panel.dataset.editing;panelHeading.textContent=resolveAvatarTitle();editButton.focus();await onEditorClosed({saved:true,scope}); }
                    else if(editor&&opening===panelEpoch){error.textContent=status.textContent;error.dataset.state='error';}
                } catch (failure) { error.textContent=failure.message;error.dataset.state='error'; }
                finally{for(const [node,disabled]of previousInputs)if(node.isConnected)node.disabled=disabled;if(editor===form)editor.setAttribute('aria-busy','false');}
            };
            const editorActions=element('div',undefined,'lpc-editor-actions');editorActions.append(apply,cancel);
            if(onSourceStudio)editorActions.append(button('Switch to Full Catalog Studio',()=>void onSourceStudio(undefined,undefined,scope),'editor-source-studio'));
            editor.append(editorTitle,editorNote,...(onSourceStudio?[studioPromo]:[]),fields,wardrobe,defaults,error,editorActions); panel.append(editor);
            updateBodyChoices();loadOutfit();void updatePreview();editorTitle.tabIndex=-1;editorTitle.focus({preventScroll:true});panel.scrollTop=0;editorTitle.scrollIntoView({block:'start'});
        }
        const definition = record.definition ?? createDefinition(makeUuid(window.crypto));
        requested = record.presentation ?? definition.startingPresentation;
        await render({ definition, presentation: requested, mode: record.binding ? 'restore' : 'preview' });
        if (edit && panel && opening === panelEpoch) showEditor(record.definition ?? definition);
    }
    function download(value, name) {
        const url = window.URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
        const link = element('a'); link.href = url; link.download = name; link.click();
        const timer = window.setTimeout(() => { window.URL.revokeObjectURL(url); urls.delete(url); }, 1000); urls.set(url, timer);
    }
    files.append(button('Export companion', async () => {
        try { download(exportCompanion((await sessions.create(active))?.definition), 'lpc-companion.json'); } catch (error) { launchError.textContent = error.message; }
    }, 'export'));
    files.append(button('Export complete companion with artwork', async event => {
        const control = event.currentTarget; control.disabled = true;
        const job = { controller: new window.AbortController(), composer: null, stage:null };
        exportJob = job;
        const timeout = window.setTimeout(() => { job.controller.abort(); job.composer?.dispose(); job.stage?.dispose(); }, 10000);
        try {
            const saved = await sessions.create(active), definition = validateDefinition(saved?.definition);
            if (disposed || job.controller.signal.aborted) throw Error('Companion export was closed or timed out. Retry when local artwork is available.');
            const assets = saved.binding?.embeddedAssets ?? {};
            job.composer = createBrowserComposer(document, baseUrl, () => assets);
            const preview = element('canvas'); preview.width = preview.height = 128;
            job.stage=createStage({document,window,baseUrl,getEmbeddedAssets:()=>assets});
            const [sheet,scene]=await Promise.all([composeActivity(job.composer,selectionsFor(definition,definition.startingPresentation.outfitId),definition.startingPresentation),job.stage.prepare(definition.startingPresentation.scene)]);
            drawScenePreview(preview,sheet,definition.startingPresentation,scene);
            const value = await exportPortableCompanion(definition, { preview: preview.toDataURL('image/png').split(',')[1], loadBytes: async path => {
                if (disposed || job.controller.signal.aborted) throw Error('Companion export was closed or timed out.');
                if (assets[path]) return Uint8Array.from(window.atob(assets[path]), c => c.charCodeAt(0));
                const response = await window.fetch(new URL(`assets/lpc/${path}`, baseUrl), { signal: job.controller.signal });
                if (!response.ok) throw Error('Artwork export failed. Reinstall the complete local asset pack or import a complete companion.');
                return new Uint8Array(await response.arrayBuffer());
            } });
            if (!disposed) download(value, 'lpc-companion-complete.json');
        } catch (error) { if (!disposed) launchError.textContent = error.message; }
        finally { window.clearTimeout(timeout); job.composer?.dispose(); job.stage?.dispose(); if (exportJob === job) exportJob = null; control.disabled = false; }
    }, 'export-complete'));
    files.append(button('Export recovery backup', async () => {
        try { download(await sessions.backup(active), 'lpc-companion-backup.json'); } catch (error) { launchError.textContent = error.message; }
    }, 'backup'));
    const imported = element('input'); imported.type = 'file'; imported.accept = '.json,application/json'; imported.dataset.control = 'import';
    const importLabel=element('label','Import setup for preview','lpc-import');importLabel.append(imported);files.append(importLabel);
    const pasteLabel=element('label','Paste generator or companion JSON','lpc-import'),paste=element('textarea');paste.rows=6;paste.maxLength=PACKAGE_LIMIT;paste.dataset.control='import-json';paste.spellcheck=false;pasteLabel.append(paste);files.append(pasteLabel);
    const previewPasted=button('Preview pasted JSON',async()=>{await previewImport(paste.value);},'import-json-preview');files.append(previewPasted);
    async function previewImport(content){
        const request=++importEpoch;
        try{
            const text=await content;if(request!==importEpoch||disposed)return;
            launchError.textContent='';
            if(typeof text!=='string'||text.length>PACKAGE_LIMIT)throw Error('Import exceeds 2 MB.');
            const local=sessions.get(active)?.definition?.characterId??makeUuid(window.crypto);
            const {definition,embeddedAssets}=importCompanionDocument(text,local);
            const value=JSON.parse(text);
            await open(false);if(!panel||disposed||request!==importEpoch)return;
            showImported?.(definition,embeddedAssets);
            const report=element('p',value.version===2?generatorImportReport(value,definition):'Validated companion package. Preview before Apply. Nothing is saved until Apply.','lpc-note');report.dataset.control='import-report';report.setAttribute('role','status');editor?.prepend(report);
        }catch(error){if(!disposed&&request===importEpoch)launchError.textContent=error.message;}
    }
    imported.onchange=async()=>{try{const file=imported.files[0];if(!file)return;if(file.size>PACKAGE_LIMIT){launchError.textContent='Import exceeds 2 MB.';return;}await previewImport(file.text());}finally{imported.value='';}};
    const independent = button('Create independent companion for this card and chat', async () => resolve('fork'), 'independent'); independent.hidden = true;
    const renamed = button('Confirm rename and retain identity', async () => resolve('rename'), 'confirm-rename'); renamed.hidden = true;
    root.append(independent, renamed);
    async function resolve(choice) {
        try {
            const candidate = sessions.get(active)?.defaults;
            if (!candidate) throw Error('Export the unsupported data for recovery; it cannot be overwritten automatically.');
            const check = createBrowserComposer(document, baseUrl);
            try { await composeActivity(check,selectionsFor(candidate,candidate.startingPresentation.outfitId),candidate.startingPresentation); } finally { check.dispose(); }
            await sessions.resolve(active, choice); await refresh();
        } catch (error) { launchError.textContent = error.message; }
    }
    function cancelActions() { clearProgram?.();command++;player?.cancel(); presence?.clearSpeech(); onSpeech(null); stageView?.cancelTransition(); }
    function beginReconciliation() {
        refreshDepth++;
        const refreshingPanel = panel;
        refreshingPanel?.setAttribute('aria-busy', 'true');
        for (const node of refreshingPanel?.querySelectorAll('button:not([data-control=hide]), select, input') ?? []) {
            if (!refreshDisabled.has(node)) refreshDisabled.set(node, node.disabled);
            node.disabled = true;
        }
        let released = false;
        return () => {
            if (released) return;
            released = true;
            finishReconciliation();
        };
    }
    function finishReconciliation() {
        refreshDepth--;
        if (!refreshDepth) {
            for (const [node, disabled] of refreshDisabled) if (node.isConnected) node.disabled = disabled;
            refreshDisabled.clear();
            refreshAvailability?.();
            panel?.setAttribute('aria-busy', 'false');
            for (const resolve of refreshWaiters.splice(0)) resolve();
        }
    }
    async function refresh(loadedOverride) {
        cancelActions();
        const release = beginReconciliation();
        try {
            launchError.textContent = 'Loading saved companion…';
            const loaded = loadedOverride??await sessions.load(active);
            if (disposed) return;
            record = loaded;
            if (panel && record.minimized === undefined) record.minimized = panel.dataset.minimized === 'true';
            independent.hidden = renamed.hidden = !loaded.conflict;
            if (loaded.conflict) { launchError.textContent = loaded.conflict; return; }
            launchError.textContent = '';
            decorateButton(document, launch, 'sparkles', loaded.definition ? 'Open companion' : 'Set up companion');
            if (studioLaunchBtn) studioLaunchBtn.hidden = Boolean(!window.testHost && !loaded.definition);
            if (loaded.definition) {
                if (panel && refreshRender) await refreshRender({ definition: loaded.definition, presentation: loaded.presentation, mode: 'restore' });
                else if(canAutoOpen()) await open(false, true);
            }
        } catch (error) { if (!disposed) launchError.textContent = error.message; }
        finally {
            release();
        }
    }
    files.append(button('Reload saved appearance',()=>void refresh(),'reload-state'));
    void refresh(initialRecord);
    return { async editDefinition(definition,scope){await open(false);if(panel)showDefinitionEditor?.(definition,scope);},refresh, beginReconciliation, cancelActions, clearSpeech(){presence?.clearSpeech();onSpeech(null);}, endInspectorCue(){player?.cancel();},setPartyScene:async id=>{await whenContextReady();await waitForRefresh();if(!record?.definition||!refreshRender)return false;return refreshRender({definition:record.definition,presentation:{...record.presentation,partySceneId:id}});},enableModel,openQuiet:()=>open(false,false,true),open:()=>shouldOpenStudioOnSetup()?onSourceStudio(undefined,undefined,'both'):open(!sessions.get(active)?.definition), hide:()=>close(false), isOpen:()=>Boolean(panel), setManagedDock(target){managedDockTarget=target;if(panel&&target){panel.dataset.dock='inline';target.append(panel);tamaBehaviors?.sync();refreshAvailability?.();}}, remove() { disposed = true; unsubscribePreferences?.();exportJob?.controller.abort(); exportJob?.composer?.dispose(); exportJob?.stage?.dispose(); close(false); for (const [url, timer] of urls) { window.clearTimeout(timer); window.URL.revokeObjectURL(url); } urls.clear(); root.remove(); } };
}
