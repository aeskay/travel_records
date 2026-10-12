import { useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getLocalMedia, deleteLocalMedia } from '../utils/mediaStore';
import { useUser } from '../context/UserContext';

const blobToDataUrl = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const compressImageBlob = (blob, maxWidth = 800, quality = 0.6) => {
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
                const syncedIds = [];

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
                                dataUrl = await compressImageBlob(blob, 800, 0.6);
                                // If the resulting content would approach Firestore's 1MB limit, compress further
                                const projectedSize = new Blob([updatedContent]).size + dataUrl.length;
                                if (projectedSize > 850_000) {
                                    dataUrl = await compressImageBlob(blob, 500, 0.4);
                                }
                            } catch {
                                dataUrl = await blobToDataUrl(blob);
                            }
                        } else {
                            dataUrl = await blobToDataUrl(blob);
                        }

                        // Replace local-media:// protocol with compressed dataUrl in HTML
                        updatedContent = updatedContent.replaceAll(`local-media://${mediaId}`, dataUrl);
                        syncedIds.push(mediaId);
                    } catch (err) {
                        console.error('Failed to sync media:', mediaId, err);
                        stillPending.push(mediaId); // Retry later
                    }
                }

                // If content changed or pending list shrank, update Firestore first, then clean up local DB
                if (syncedIds.length > 0) {
                    try {
                        const detailRef = doc(db, 'details', document.id);
                        await updateDoc(detailRef, {
                            content: updatedContent,
                            pendingMedia: stillPending,
                            hasPendingMedia: stillPending.length > 0
                        });

                        for (const mediaId of syncedIds) {
                            await deleteLocalMedia(mediaId);
                        }
                    } catch (err) {
                        console.error('Failed to update detail after media sync:', err);
                    }
                }
            }
        });

        return () => unsubscribe();
    }, [user]);
};

