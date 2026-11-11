import { MOOD_EXPRESSIONS, MOODS, moodLabel } from '../catalog/curated-enhancements.mjs';

export { MOOD_EXPRESSIONS, MOODS, moodLabel };

export function validateSpeech(text) {
    if (typeof text !== 'string' || !text.trim() || [...text].length > 160) throw Error('Speech cues need 1–160 characters.');
    return text;
}
