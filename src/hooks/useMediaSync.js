import { useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getLocalMedia } from '../utils/mediaStore';
import { useUser } from '../context/UserContext';

const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const compressImageBlob = (blob, maxWidth = 1600, quality = 0.8) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;
            if (w > maxWidth) {
                h = Math.round((maxWidth / w) * h);
                w = maxWidth;
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            URL.revokeObjectURL(url);
            resolve(dataUrl);
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        };
        img.src = url;
    });
};

// Compress image to highest quality that fits within maxBytes
const compressImageToFit = async (blob, maxBytes) => {
    const tiers = [
        { maxWidth: 1600, quality: 0.82 },
        { maxWidth: 1280, quality: 0.75 },
        { maxWidth: 1024, quality: 0.65 },
        { maxWidth: 800, quality: 0.55 },
        { maxWidth: 600, quality: 0.45 }
    ];

    let dataUrl = null;
    for (const tier of tiers) {
        dataUrl = await compressImageBlob(blob, tier.maxWidth, tier.quality);
        if (dataUrl.length <= maxBytes) {
            return dataUrl;
        }
    }
    return dataUrl;
};

export const useMediaSync = () => {
    const { user } = useUser();

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'details'),
            where('hasPendingMedia', '==', true)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (!navigator.onLine) return; // Only process if online

            for (const document of snapshot.docs) {
                const detail = document.data();
                if (!detail.pendingMedia || detail.pendingMedia.length === 0) continue;

                let updatedContent = detail.content;
                const stillPending = [];
                let syncedCount = 0;

                // Firestore max doc size is 1,048,576 bytes; keep safe total budget of 880,000 bytes
                const baseSize = new Blob([updatedContent]).size;
                const maxTotalBudget = Math.max(200_000, 880_000 - baseSize);
                const perItemBudget = Math.floor(maxTotalBudget / detail.pendingMedia.length);

                for (const mediaId of detail.pendingMedia) {
                    try {
                        const blob = await getLocalMedia(mediaId);
                        if (!blob) {
                            // Blob not on this device (it was created on another device and hasn't synced yet)
                            stillPending.push(mediaId);
                            continue;
                        }

                        const isImage =
                            (blob.type && blob.type.startsWith('image/')) ||
                            new RegExp(`<img[^>]*local-media://${mediaId}`, 'i').test(updatedContent);

                        let dataUrl;
                        if (isImage) {
                            try {
                                dataUrl = await compressImageToFit(blob, perItemBudget);
                            } catch {
                                dataUrl = await blobToDataUrl(blob);
                            }
                        } else {
                            dataUrl = await blobToDataUrl(blob);
                        }

                        // Ensure data-media-id is preserved on the tag so the capturing device
                        // always loads its full-resolution original blob from local IndexedDB
                        const hasDataAttr = new RegExp(`data-media-id="${mediaId}"`, 'i').test(updatedContent);
                        if (hasDataAttr) {
                            updatedContent = updatedContent.replaceAll(`local-media://${mediaId}`, dataUrl);
                        } else {
                            updatedContent = updatedContent.replaceAll(
                                `src="local-media://${mediaId}"`,
                                `src="${dataUrl}" data-media-id="${mediaId}"`
                            );
                            updatedContent = updatedContent.replaceAll(`local-media://${mediaId}`, dataUrl);
                        }

                        // NOTE: We intentionally DO NOT delete the local media from IndexedDB
                        // so this device retains the 100% uncompressed original quality locally.
                        syncedCount++;
                    } catch (err) {
                        console.error('Failed to sync media:', mediaId, err);
                        stillPending.push(mediaId); // Retry later
                    }
                }

                // If any pending media was synced, update Firestore
                if (syncedCount > 0) {
                    try {
                        const detailRef = doc(db, 'details', document.id);
                        await updateDoc(detailRef, {
                            content: updatedContent,
                            pendingMedia: stillPending,
                            hasPendingMedia: stillPending.length > 0
                        });
                    } catch (err) {
                        console.error('Failed to update detail after media sync:', err);
                    }
                }
            }
        });

        return () => unsubscribe();
    }, [user]);
};


