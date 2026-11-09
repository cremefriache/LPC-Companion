import { activityName } from '../state/animation-program.mjs';
import { PARTY_SCENES, partyScene } from '../state/party.mjs';
import { createStage } from './stage.mjs';
import { createPlayer, CUE_REPEAT_MS } from './player.mjs';
import { createPresence } from './presence.mjs';
import {sourceExtents} from './source-frames.mjs';

/** Two accepted sheet references, four small players, one bounded background cache. */
export function createPartyView({document,window,baseUrl,getEmbeddedAssets,onDetails,onMove,onModel,onSpeechDismiss=()=>{},preferences}) {
    const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
    const root=el('section');root.className='lpc-party-view';root.dataset.control='party-view';
    const bar=el('div');bar.className='lpc-party-toolbar';
    const layout=el('select');layout.dataset.control='party-layout';layout.setAttribute('aria-label','Companion view');
    for(const [id,name]of [['together','Together view'],['party','Party strip']]){const option=el('option',name);option.value=id;layout.append(option);}
    const scene=el('select');scene.dataset.control='party-visible-scene';scene.setAttribute('aria-label','View scene');
    const pause=el('button','Pause all');pause.type='button';pause.dataset.control='party-pause';pause.setAttribute('aria-pressed','false');
    const stage=el('div');stage.className='lpc-party-stage';stage.dataset.control='party-stage';stage.setAttribute('aria-label','Shared companion scene');
    const caption=el('span');caption.className='lpc-stage-caption';stage.append(caption);
    const empty=el('p','No companions are in this scene. Select another scene or move a companion here.');empty.className='lpc-party-empty';stage.append(empty);
    const strip=el('div');strip.className='lpc-party-strip';strip.setAttribute('aria-label','All configured companions');
    const status=el('p','Scene membership follows chat history. View and layout choices are yours.');status.setAttribute('role','status');status.dataset.control='party-status';
    bar.append(layout,scene,pause);root.append(bar,stage,strip,status);
    const background=createStage({document,window,baseUrl,element:stage,getEmbeddedAssets});
    const actors=new Map();let disposed=false,paused=false,token=0,shown='together',viewChosen=false;
    const toolsAllowed=()=>!preferences||(preferences.get().enabled!==false&&preferences.get().toolCalling===true);
    const syncModel=actor=>{actor.model.disabled=actor.modelBusy||!toolsAllowed();if(!toolsAllowed())actor.model.checked=false;};
    const unsubscribePreferences=preferences?.subscribe(()=>{if(!disposed)for(const actor of actors.values())syncModel(actor);});
    function fitActors(){
        const sheets=[...actors.values()].flatMap(a=>[a.sheet,...a.fitSheets??[]]).filter(Boolean),source=sheets.some(s=>s.layout.sourceBounds),fit={left:0,right:0,above:0,below:0};
        if(source)for(const sheet of sheets){const e=sourceExtents(sheet.layout);for(const key of Object.keys(fit))fit[key]=Math.max(fit[key],e[key]);}
        for(const actor of actors.values())for(const player of actor.players)player.setFitExtents(source?fit:null);
    }
    function applyPause(actor){for(const player of actor.players)player.pause(paused||actor.paused);}
    async function showScene(id=shown){
        const generation=++token;
        try{const prepared=await background.prepare(partyScene(id));if(disposed||generation!==token)return;
            if(shown!==id)for(const actor of actors.values())actor.players[1].cancel();shown=id;scene.value=id;background.publish(prepared);stage.dataset.sceneId=id;
            const members=[...actors.values()].filter(actor=>(actor.presentation?.partySceneId??'together')===id);
            for(const actor of actors.values()){actor.figure.hidden=!members.includes(actor);actor.figure.style.left=`${(members.indexOf(actor)+1)/(members.length+1)*100}%`;}
            empty.hidden=members.length>0;status.textContent=`${PARTY_SCENES.find(([key])=>key===id)[1]} · ${members.length} companion${members.length===1?'':'s'}. Visual scene only.`;
        }catch(error){if(!disposed&&generation===token){scene.value=shown;status.textContent=`${error.message} The previous shared scene is retained. Select a scene to retry.`;}}
    }
    function updateChoices(){const selected=scene.value||shown;scene.replaceChildren();for(const [id,name]of PARTY_SCENES){const count=[...actors.values()].filter(actor=>(actor.presentation?.partySceneId??'together')===id).length,option=el('option',`${name} (${count})`);option.value=id;scene.append(option);}scene.value=selected;}
    function actorFor(key,label){
        if(actors.has(key))return actors.get(key);
        const row=el('div');row.className='lpc-party-member';row.dataset.partyMember=key;
        const choose=el('button');choose.type='button';choose.dataset.control='party-details';choose.setAttribute('aria-label',`Open controls for ${label}`);choose.setAttribute('aria-expanded','false');choose.setAttribute('aria-controls',key==='primary'?'lpc-companion-panel':`lpc-companion-${key}-panel`);
        const thumbnail=el('canvas');thumbnail.width=thumbnail.height=80;thumbnail.setAttribute('aria-hidden','true');
        const info=el('span'),name=el('strong',label),summary=el('small');info.append(name,summary);choose.append(thumbnail,info);
        const locationLabel=el('label','Scene'),location=el('select');location.dataset.control='party-membership';location.setAttribute('aria-label',`Shared scene for ${label}`);locationLabel.append(location);
        for(const [id,name]of PARTY_SCENES){const option=el('option',name);option.value=id;location.append(option);}
        const modelLabel=el('label','Tools'),model=el('input');model.type='checkbox';model.dataset.control='party-model';model.setAttribute('aria-label',`Allow tool calls for this companion: ${label}`);modelLabel.prepend(model);
        row.append(choose,locationLabel,modelLabel);strip.append(row);
        const figure=el('div');figure.className='lpc-party-figure';figure.dataset.partyActor=key;
        const sprite=el('button');sprite.type='button';sprite.dataset.control='party-sprite';sprite.setAttribute('aria-label',`Open controls for ${label}`);
        const canvas=el('canvas');canvas.width=canvas.height=192;canvas.setAttribute('aria-hidden','true');sprite.append(canvas,el('span',label));
        const presence=createPresence({document,onDismiss:()=>{onSpeechDismiss(key);choose.focus();}});figure.append(sprite);stage.append(figure);
        const actor={row,figure,location,model,summary,presence,paused:false,modelBusy:false,players:[createPlayer(thumbnail,row,window),createPlayer(canvas,figure,window)]};actors.set(key,actor);
        choose.onclick=sprite.onclick=()=>onDetails(key);
        location.onchange=async()=>{location.disabled=true;try{if(!await onMove(key,location.value))throw Error('Scene membership was not saved. The accepted membership is retained.');}catch(error){status.textContent=error.message;}finally{location.value=actor.presentation?.partySceneId??'together';location.disabled=false;}};
        model.onchange=async()=>{if(disposed||!toolsAllowed()){syncModel(actor);return;}const requested=model.checked;actor.modelBusy=true;syncModel(actor);try{if(await onModel(key,requested)===false&&!disposed&&actors.get(key)===actor){model.checked=false;status.textContent='Open this companion and resolve its recovery message before enabling tool calls.';}}catch(error){if(!disposed&&actors.get(key)===actor){model.checked=false;status.textContent=error.message;}}finally{if(!disposed&&actors.get(key)===actor){actor.modelBusy=false;syncModel(actor);}}};syncModel(actor);
        return actor;
    }
    layout.onchange=()=>{for(const actor of actors.values())actor.players[1].cancel();root.dataset.layout=layout.value;stage.hidden=layout.value==='party';scene.hidden=layout.value==='party';};root.dataset.layout='together';
    scene.onchange=()=>{viewChosen=true;void showScene(scene.value);};
    pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Resume all':'Pause all';pause.setAttribute('aria-pressed',String(paused));for(const actor of actors.values())applyPause(actor);};
    return {element:root,prepare:(presentation,assets)=>background.prepare(partyScene(presentation.partySceneId),assets),
        publish(key,label,result){if(disposed)return;if(!viewChosen){shown=result.presentation.partySceneId??'together';viewChosen=true;}const actor=actorFor(key,label);actor.presentation=structuredClone(result.presentation);actor.row.dataset.companionId=result.definition.characterId;actor.row.dataset.outfit=result.presentation.outfitId;actor.row.dataset.sceneId=result.presentation.partySceneId??'together';actor.figure.dataset.companionId=result.definition.characterId;
            actor.sheet=result.sheet;actor.fitSheets=null;actor.baseSummary=`${result.definition.outfits.find(outfit=>outfit.id===result.presentation.outfitId).name} · ${result.presentation.playback?result.presentation.playback.actionId:activityName(result.presentation)}${result.presentation.moodId&&result.presentation.moodId!=='none'?' · '+result.presentation.moodId:''}`;actor.summary.textContent=actor.baseSummary;actor.location.value=result.presentation.partySceneId??'together';for(const player of actor.players)player.publish(result.sheet,result.presentation.facing);fitActors();applyPause(actor);updateChoices();void showScene();},
        cue(key,sheet,facing,duration){const actor=actors.get(key);if(actor){actor.fitSheets=[sheet];fitActors();actor.players[0].playSequence([{sheet,durationMs:duration}],facing,()=>{actor.fitSheets=null;fitActors();},()=>{actor.fitSheets=[sheet];fitActors();},{repeatMs:CUE_REPEAT_MS});if(!stage.hidden&&!actor.figure.hidden)actor.players[1].playOnce(sheet,facing,duration,undefined,{repeatMs:CUE_REPEAT_MS});}},
        sequence(key,steps,facing,done,progress){const actor=actors.get(key);if(!actor)return false;const sheets=steps.map(s=>s.sheet);actor.fitSheets=sheets;fitActors();const update=(index,total)=>{actor.fitSheets=sheets;fitActors();actor.summary.textContent=`${actor.baseSummary} · ${index+1}/${total} ${steps[index].actionId}`;progress?.(index,total);};const finish=reason=>{actor.fitSheets=null;fitActors();actor.summary.textContent=actor.baseSummary;done?.(reason);};actor.players[0].playSequence(steps,facing,finish,update,{repeatMs:CUE_REPEAT_MS});if(!stage.hidden&&!actor.figure.hidden)actor.players[1].playSequence(steps,facing,undefined,undefined,{repeatMs:CUE_REPEAT_MS});return true;},
        stop(key){const actor=actors.get(key);if(actor){actor.players.forEach(player=>player.cancel());actor.summary.textContent=actor.baseSummary;actor.fitSheets=null;fitActors();}},
        pause(key,value){const actor=actors.get(key);if(actor){actor.paused=value;applyPause(actor);}},
        speech(key,text){const actor=actors.get(key);if(actor){if(text)actor.presence.showSpeech(text);else actor.presence.clearSpeech();}},
        clearSpeech(){for(const actor of actors.values())actor.presence.clearSpeech();},
        model(key,value){const actor=actors.get(key);if(actor){actor.model.checked=Boolean(value)&&toolsAllowed();syncModel(actor);}},
        retain(keys){for(const [key,actor]of actors)if(!keys.has(key)){actor.players.forEach(player=>player.dispose());actor.presence.dispose();actor.row.remove();actor.figure.remove();actors.delete(key);}fitActors();updateChoices();void showScene();},
        cancel(){for(const actor of actors.values()){actor.players.forEach(player=>player.cancel());actor.presence.clearSpeech();}background.cancelTransition();},
        dispose(){if(disposed)return;disposed=true;unsubscribePreferences?.();token++;for(const actor of actors.values()){actor.players.forEach(player=>player.dispose());actor.presence.dispose();}actors.clear();background.dispose();root.remove();},
    };
}
