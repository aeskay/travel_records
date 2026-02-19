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
    static model = 'Xenova/whisper-tiny.en';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const { audio, language } = event.data;

    // audio arrives as a Float32Array (transferred, not cloned)
    if (!(audio instanceof Float32Array)) {
        self.postMessage({ status: 'error', message: 'Invalid audio data received by worker.' });
        return;
    }

    try {
        const transcriber = await PipelineSingleton.getInstance((data) => {
            self.postMessage({ status: 'progress', data });
        });

        // Use smaller chunk/stride values so short clips (< 30s) aren't broken
        // into silent windows. return_timestamps: false keeps the output simple.
        const output = await transcriber(audio, {
            chunk_length_s: 25,
            stride_length_s: 3,
            language: language || 'english',
            task: 'transcribe',
            return_timestamps: false,
        });

        const raw = output.text ?? '';
        console.log('[Worker] Raw transcript:', raw);

        // Filter out Whisper's sentinel "no speech" strings so the app never
        // displays them as if they were a real transcript.
        const clean = isSentinel(raw) ? '' : raw.trim();

        self.postMessage({ status: 'complete', transcript: clean });
    } catch (e) {
        console.error('Worker transcription error:', e);
        self.postMessage({ status: 'error', message: e.message });
    }
};
