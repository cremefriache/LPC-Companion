export const MOOD_EXPRESSIONS = Object.freeze({
    none: Object.freeze({ label: 'Default expression', itemId: null, faceDir: null }),
    calm: Object.freeze({ label: 'Calm (neutral)', itemId: 'face_neutral', faceDir: 'neutral' }),
    cheerful: Object.freeze({ label: 'Cheerful (happy)', itemId: 'face_happy', faceDir: 'happy' }),
    blush: Object.freeze({ label: 'Blushing', itemId: 'face_blush', faceDir: 'blush' }),
    thoughtful: Object.freeze({ label: 'Thoughtful (look aside)', itemId: 'face_look_l', faceDir: 'look_l' }),
    concerned: Object.freeze({ label: 'Concerned (sad)', itemId: 'face_sad', faceDir: 'sad' }),
    angry: Object.freeze({ label: 'Angry', itemId: 'face_angry', faceDir: 'anger' }),
    shock: Object.freeze({ label: 'Shocked', itemId: 'face_shock', faceDir: 'shock' }),
    eyeroll: Object.freeze({ label: 'Rolling eyes', itemId: 'face_eyeroll', faceDir: 'eyeroll' }),
    shame: Object.freeze({ label: 'Ashamed', itemId: 'face_shame', faceDir: 'shame' }),
    closed: Object.freeze({ label: 'Eyes closed', itemId: 'face_closed', faceDir: 'closed' }),
    look_right: Object.freeze({ label: 'Glancing right', itemId: 'face_look_r', faceDir: 'look_r' }),
});
export const MOODS = Object.freeze(Object.keys(MOOD_EXPRESSIONS));
export const moodLabel = id => MOOD_EXPRESSIONS[id]?.label ?? id;
export function validateSpeech(text) {
    if (typeof text !== 'string' || !text.trim() || [...text].length > 160) throw Error('Speech cues need 1–160 characters.');
    return text;
}
