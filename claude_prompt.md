I am building a React PWA for travel logging. I need a feature that records the user's voice (saved as an audio file) while simultaneously transcribing it to text (saved as the note content).

**Stack:**
- React (Vite)
- Firebase (Storage/Firestore)
- Native Web APIs (`MediaRecorder`, `SpeechRecognition`)

**The Goal:**
- When the user presses "Record", the app should:
  1. Start `MediaRecorder` to capture the audio blob (to be saved later).
  2. Start `SpeechRecognition` to capture the text transcript live.

**The Problem:**
- This works perfectly on Desktop Chrome.
- On **Android Chrome (Mobile)**, it is extremely unreliable.
  - Often `SpeechRecognition` starts but never returns `onresult` (no transcript), as if the microphone is being hogged by `MediaRecorder`.
  - Sometimes it throws a "network" error immediately.
  - We tried `continuous: true` -> failed (known bug on Android).
  - We tried `continuous: false` with a manual restart loop in `onend` -> better, but still frequently fails to capture audio or cuts out when `MediaRecorder` is running.

**Constraints:**
- **No paid APIs.** (We cannot use OpenAI Whisper or Google Cloud Speech-to-Text).
- Must be a client-side or free solution.
- The user will be in noisy environments (roads), so pure dictation isn't enough; we need the original audio for verification.

**Question:**
What is the most robust pattern or library to achieve simultaneous audio recording and speech-to-text on mobile web without paying for an API?
- Is there a way to stream the `MediaRecorder` audio *into* the `SpeechRecognition` engine?
- Is there a specific library (like `react-speech-recognition` or others) that handles these mobile quirks better than raw API calls?
- Should we decouple them? (e.g. Record first, then transcode? But we want live text if possible, or at least automatic transcription after stop without a paid backend).
