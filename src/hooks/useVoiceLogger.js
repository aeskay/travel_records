
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

// Compute RMS (root-mean-square) amplitude of a Float32Array.
// Returns a value between 0 (silence) and ~1 (full scale).
function computeRms(audioData) {
    if (!audioData || audioData.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
}

// Minimum RMS energy required to attempt transcription.
const MIN_RMS_THRESHOLD = 0.0005;

export function useVoiceLogger() {
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const workerRef = useRef(null);
    const mimeTypeRef = useRef('audio/webm');

    const [status, setStatus] = useState('idle'); // idle | recording | transcribing | error
    const [transcript, setTranscript] = useState('');
    const [audioBlob, setAudioBlob] = useState(null);
    const [modelProgress, setModelProgress] = useState(null); // download progress 0-100
    const [error, setError] = useState(null);

    // ─── Worker setup ────────────────────────────────────────────────────────────
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/whisper.worker.js', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (e) => {
            const { status: workerStatus, transcript: resultText, message, data } = e.data;

            if (workerStatus === 'progress') {
                // data.progress is 0–100 during model download
                if (typeof data?.progress === 'number') {
                    setModelProgress(Math.round(data.progress));
                }
            } else if (workerStatus === 'complete') {
                setModelProgress(null);
                setTranscript(resultText ?? '');
                setStatus('idle');
            } else if (workerStatus === 'error') {
                setModelProgress(null);
                setError(message ?? 'Unknown transcription error');
                setStatus('error');
            }
        };

        worker.onerror = (e) => {
            console.error('Worker crashed:', e);
            setError('Transcription worker crashed: ' + e.message);
            setStatus('error');
        };

        workerRef.current = worker;

        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    // ─── Audio processing ────────────────────────────────────────────────────────
    // Defined with useCallback so stopRecording can safely depend on it.
    const processAudio = useCallback(async (blob) => {
        if (!workerRef.current) {
            setError('Transcription worker not available.');
            setStatus('error');
            return;
        }

        try {
            // Do NOT force sampleRate here — let the browser decode at its native rate,
            // then we resample manually. Forcing 16 kHz in the AudioContext constructor
            // causes silent failures on many Android devices.
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await blob.arrayBuffer();

            let decoded;
            try {
                decoded = await audioContext.decodeAudioData(arrayBuffer);
            } catch (decodeErr) {
                // Some Android versions can't decode webm in AudioContext.
                // Surface a clear error rather than hanging.
                throw new Error(
                    `Audio decode failed (${decodeErr.message}). ` +
                    'Try recording again or check browser support.'
                );
            } finally {
                // Always close the context to free hardware resources.
                audioContext.close();
            }

            // Grab mono channel data at whatever rate the OS decoded it at.
            const rawAudio = decoded.getChannelData(0);
            const nativeRate = decoded.sampleRate;

            // Resample to 16 kHz which Whisper expects.
            const audio16k = resampleAudio(rawAudio, nativeRate, 16000);

            // ── Pre-flight energy check ──────────────────────────────────────────
            // If the resampled audio is near-silent the model will always return
            // "No speech detected". Skip the worker round-trip and return empty.
            const rms = computeRms(audio16k);
            console.log(`[VoiceLogger] Audio RMS: ${rms.toFixed(5)} (threshold: ${MIN_RMS_THRESHOLD})`);

            if (rms < MIN_RMS_THRESHOLD) {
                console.warn('[VoiceLogger] Audio energy below threshold — skipping transcription.');
                setTranscript('');
                setStatus('idle');
                return;
            }

            // Transfer the underlying buffer instead of cloning it.
            // This avoids an OOM copy on mobile for longer recordings.
            workerRef.current.postMessage(
                { audio: audio16k, language: 'english' },
                [audio16k.buffer]
            );
        } catch (err) {
            console.error('Audio processing error:', err);
            setError(err.message);
            setStatus('error');
        }
    }, []); // workerRef is a ref — stable, no dep needed

    // ─── Start recording ─────────────────────────────────────────────────────────
    const startRecording = useCallback(async () => {
        setError(null);
        setTranscript('');
        setAudioBlob(null);
        setModelProgress(null);

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    // Do NOT request sampleRate: 16000 here.
                    // Android ignores it silently and can break the stream.
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

        // Pick the best supported MIME type.
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

        recorder.start(1000); // timeslice: flush a chunk every second
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
                // Release microphone immediately.
                recorder.stream.getTracks().forEach((t) => t.stop());

                const blob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
                setAudioBlob(blob);
                setStatus('transcribing');

                // Return blob immediately + a way to get the transcript when done
                const transcriptionPromise = new Promise((resolveTx, rejectTx) => {
                    // Create a one-off handler for this specific request
                    const handleMessage = (e) => {
                        const { status: wStatus, transcript: tx, message } = e.data;
                        if (wStatus === 'complete') {
                            cleanup();
                            resolveTx(tx);
                        } else if (wStatus === 'error') {
                            cleanup();
                            rejectTx(message);
                        }
                    };

                    const handleError = (e) => {
                        cleanup();
                        rejectTx("Worker error: " + (e.message || "Unknown error"));
                    };

                    const cleanup = () => {
                        workerRef.current?.removeEventListener('message', handleMessage);
                        workerRef.current?.removeEventListener('error', handleError);
                    };

                    if (workerRef.current) {
                        workerRef.current.addEventListener('message', handleMessage);
                        workerRef.current.addEventListener('error', handleError);

                        // Start processing in background
                        processAudio(blob).catch(err => {
                            cleanup();
                            rejectTx(err);
                        });
                    } else {
                        rejectTx("Worker not initialized");
                    }
                });

                resolve({ blob, transcriptionPromise });
            };

            recorder.stop();
        });
    }, [processAudio]);

    return {
        startRecording,
        stopRecording,
        status,
        transcript,
        audioBlob,
        modelProgress,
        error,
    };
}
