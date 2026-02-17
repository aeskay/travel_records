import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Upload a base64 data URL to Firebase Storage and return the download URL.
 * @param {string} dataUrl - The base64 data URL (e.g. "data:image/png;base64,...")
 * @param {string} path - Storage path (e.g. "notes/image_123.png")
 * @returns {Promise<string>} The public download URL
 */
export const uploadDataUrl = async (dataUrl, path) => {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
};

/**
 * Process HTML content: find all base64 images and audio, upload them to Storage,
 * and replace the src attributes with download URLs.
 * @param {string} html - The raw HTML from contentEditable
 * @param {string} sectionId - Section ID for organizing uploads
 * @returns {Promise<string>} The processed HTML with storage URLs
 */
export const processMediaInContent = async (html, sectionId) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const timestamp = Date.now();

    // Process images
    const images = doc.querySelectorAll('img[src^="data:"]');
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const dataUrl = img.getAttribute('src');
        // Determine extension from MIME type
        const mime = dataUrl.split(';')[0].split(':')[1] || 'image/png';
        const ext = mime.split('/')[1] || 'png';
        const path = `notes/${sectionId}/${timestamp}_img_${i}.${ext}`;

        try {
            const url = await uploadDataUrl(dataUrl, path);
            img.setAttribute('src', url);
        } catch (err) {
            console.error('Failed to upload image:', err);
            // Keep the base64 as fallback — will fail at save if too large
        }
    }

    // Process audio
    const audios = doc.querySelectorAll('audio[src^="data:"]');
    for (let i = 0; i < audios.length; i++) {
        const audio = audios[i];
        const dataUrl = audio.getAttribute('src');
        const mime = dataUrl.split(';')[0].split(':')[1] || 'audio/webm';
        const ext = mime.split('/')[1] || 'webm';
        const path = `notes/${sectionId}/${timestamp}_audio_${i}.${ext}`;

        try {
            const url = await uploadDataUrl(dataUrl, path);
            audio.setAttribute('src', url);
        } catch (err) {
            console.error('Failed to upload audio:', err);
        }
    }

    return doc.body.innerHTML;
};
