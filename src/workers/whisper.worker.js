
import { pipeline, env } from '@xenova/transformers';

// Skip local model checks
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny.en';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, {
                progress_callback
            });
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const { audio, language } = event.data;

    try {
        // Retrieve the pipeline
        const transcriber = await PipelineSingleton.getInstance((data) => {
            self.postMessage({ status: 'progress', data });
        });

        // Run transcription
        const output = await transcriber(audio, {
            chunk_length_s: 30,
            stride_length_s: 5,
            language: language || 'english',
            task: 'transcribe',
        });

        self.postMessage({ status: 'complete', transcript: output.text });

    } catch (e) {
        console.error("Worker error:", e);
        self.postMessage({ status: 'error', message: e.message });
    }
};
