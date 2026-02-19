
import { useRef, useState, useEffect, useCallback } from 'react';

// Resample a Float32Array from sourceRate to targetRate using linear interpolation.
// Required because AudioContext may not honour the sampleRate constraint on mobile,
// but Whisper always expects 16 kHz input.
function resampleAudio(audioData, sourceRate, targetRate) {
    if (sourceRate === targetRate) return audioData;
    const ratio = sourceRate / targetRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        const pos = i * ratio;
        const index = Math.floor(pos);
        const frac = pos - index;
        const a = audioData[index] ?? 0;
        const b = audioData[index + 1] ?? 0;
        result[i] = a + frac * (b - a);
    }
    return result;
}

export function useVoiceLogger() {
    const mediaRecorderRef = useRef(null);
    const pendingRequests = useRef(new Map());
    const workerRef = useRef(null);
    const mimeTypeRef = useRef('audio/webm');
    const audioChunksRef = useRef([]);

    const [status, setStatus] = useState('idle');
    const [audioBlob, setAudioBlob] = useState(null);
    const [error, setError] = useState(null);
    const [modelProgress, setModelProgress] = useState(null);

    // ─── Worker setup ────────────────────────────────────────────────────────────
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/whisper.worker.js', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (e) => {
            const { status: workerStatus, transcript: resultText, message, data, id } = e.data;

            if (!id) return; // Ignore messages without ID (shouldn't happen with new worker)

            const request = pendingRequests.current.get(id);
            if (!request) return;

            if (workerStatus === 'progress') {
                setModelProgress(data);
            } else if (workerStatus === 'complete') {
                request.resolve(resultText);
                pendingRequests.current.delete(id);
            } else if (workerStatus === 'error') {
                request.reject(new Error(message));
                pendingRequests.current.delete(id);
            }
        };

        worker.onerror = (e) => {
            console.error('Worker crashed:', e);
            // Reject all pending requests
            for (const [id, req] of pendingRequests.current) {
                req.reject(new Error('Worker crashed: ' + e.message));
            }
            pendingRequests.current.clear();
            setStatus('error');
        };

        workerRef.current = worker;

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    // ─── Transcription ───────────────────────────────────────────────────────────
    const transcribeAudio = useCallback(async (blob) => {
        if (!workerRef.current) {
            throw new Error('Transcription worker not available.');
        }

        const id = 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        return new Promise(async (resolve, reject) => {
            try {
                // Store the resolver
                pendingRequests.current.set(id, { resolve, reject });

                // Process Audio
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = await blob.arrayBuffer();
                let decoded;
                try {
                    decoded = await audioContext.decodeAudioData(arrayBuffer);
                } finally {
                    audioContext.close();
                }

                const rawAudio = decoded.getChannelData(0);
                const nativeRate = decoded.sampleRate;
                const audio16k = resampleAudio(rawAudio, nativeRate, 16000);

                workerRef.current.postMessage(
                    { audio: audio16k, language: 'english', id },
                    [audio16k.buffer]
                );
            } catch (err) {
                pendingRequests.current.delete(id);
                reject(err);
            }
        });
    }, []);

    // ─── Start recording ─────────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        setError(null);
        // setTranscript(''); // Removed, hook no longer tracks single transcript
        setAudioBlob(null);
        setModelProgress(null);

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
        } catch (err) {
            console.error('Microphone access error:', err);
            setError('Could not access microphone: ' + err.message);
            setStatus('error');
            return;
        }

        const preferredTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
        ];
        const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
        mimeTypeRef.current = mimeType || 'audio/webm';

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onerror = (e) => {
            console.error('MediaRecorder error:', e);
            setError('Recording error: ' + e.error?.message);
            setStatus('error');
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setStatus('recording');
    }, []);

    // ─── Stop recording ──────────────────────────────────────────────────────────
    const stopRecording = useCallback(() => {
        return new Promise((resolve) => {
            const recorder = mediaRecorderRef.current;

            if (!recorder || recorder.state === 'inactive') {
                resolve(null);
                return;
            }

            recorder.onstop = async () => {
                recorder.stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
                setAudioBlob(blob);
                setStatus('idle');
                resolve(blob);
            };

            recorder.stop();
        });
    }, []);

    return {
        startRecording,
        stopRecording,
        transcribeAudio, // Direct method
        status,
        audioBlob,
        error,
        modelProgress,
    };
}
