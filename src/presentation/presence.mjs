import { MOODS, MOOD_EXPRESSIONS, moodLabel, validateSpeech } from '../state/presence.mjs';
export { MOODS, MOOD_EXPRESSIONS, moodLabel };

/** Mood badge and expression indicator. */
export function createPresence({ document, onDismiss = () => {} }) {
    const mood = document.createElement('span'); mood.className = 'lpc-mood'; mood.hidden = true; mood.dataset.control = 'mood-label';
    mood.title = 'Pixel-art facial expression and presentation mood.';
    const speech = document.createElement('div'); speech.className = 'lpc-speech'; speech.hidden = true; speech.dataset.control = 'speech-bubble';
    const content = document.createElement('span'); content.dataset.control = 'speech-content'; content.setAttribute('role', 'status');
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.dataset.control = 'speech-dismiss'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Dismiss speech');
    speech.append(content, dismiss);
    let disposed = false;
    function clearSpeech() { content.textContent = ''; speech.hidden = true; }
    dismiss.onclick = () => { if (disposed) return; clearSpeech(); onDismiss(); };
    return {
        mood, speech, clearSpeech,
        setMood(id = 'none') { if (!MOODS.includes(id)) throw Error('Unknown presentation mood label.'); mood.textContent = id === 'none' ? '' : `Mood: ${id}`; mood.hidden = id === 'none'; },
        showSpeech(text) {
            if (disposed) return false;
            validateSpeech(text);
            content.textContent = text; speech.hidden = false;
            return true;
        },
        dispose() { disposed = true; clearSpeech(); mood.remove(); speech.remove(); },
    };
}
