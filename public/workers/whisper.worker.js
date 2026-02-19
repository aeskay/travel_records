
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Skip local model checks since we are using CDN
env.allowLocalModels = false;
env.useBrowserCache = true;

// Define sentinel patterns
const NO_SPEECH_PATTERNS = [
    /^\s*\[BLANK_AUDIO\]\s*$/i,
    /^\s*\[SILENCE\]\s*$/i,
    /^\s*\[ Silence \]\s*$/i,
    /^\s*no speech detected\s*\.?\s*$/i,
    /^\s*\(no speech\)\s*$/i,
    /^\s*\.\s*$/,
];

function isSentinel(text) {
    if (!text || !text.trim()) return true;
    return NO_SPEECH_PATTERNS.some((re) => re.test(text.trim()));
}

class PipelineSingleton {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-base.en';
    static instancePromise = null;

    static async getInstance(progress_callback = null) {
        if (this.instancePromise === null) {
            console.log('[Worker] First-time initialization of pipeline:', this.model);
            // Store the promise itself to prevent race conditions from concurrent calls
            this.instancePromise = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instancePromise;
    }
}

self.onmessage = async (event) => {
    const { audio, language } = event.data;

    // audio arrives as a Float32Array
    if (!(audio instanceof Float32Array)) {
        self.postMessage({ status: 'error', message: 'Invalid audio data received by worker.' });
        return;
    }

    try {
        const transcriber = await PipelineSingleton.getInstance((data) => {
            self.postMessage({ status: 'progress', data });
        });

        console.log('[Worker] Starting transcription for audio chunk...');
        const output = await transcriber(audio, {
            chunk_length_s: 25,
            stride_length_s: 3,
            language: language || 'english',
            task: 'transcribe',
            return_timestamps: false,
        });

        const raw = output.text ?? '';
        console.log('[Worker] Raw transcript:', raw);

        const clean = isSentinel(raw) ? '' : raw.trim();
        self.postMessage({ status: 'complete', transcript: clean });
    } catch (e) {
        console.error('Worker transcription error:', e);
        self.postMessage({ status: 'error', message: e.message });
        // Reset promise on error so a retry can attempt to re-init
        PipelineSingleton.instancePromise = null;
    }
};
