import { useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { getLocalMedia, deleteLocalMedia } from '../utils/mediaStore';
import { useUser } from '../context/UserContext';

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

                for (const mediaId of detail.pendingMedia) {
                    try {
                        const blob = await getLocalMedia(mediaId);
                        if (!blob) {
                            // Blob not on this device (it was created on another device and hasn't synced yet)
                            stillPending.push(mediaId);
                            continue;
                        }

                        // Upload to Firebase Storage
                        const storageRef = ref(storage, `media/${user.username}/${mediaId}`);
                        const uploadSnap = await uploadBytes(storageRef, blob);
                        const downloadUrl = await getDownloadURL(uploadSnap.ref);

                        // Replace local-media:// protocol with real downloadUrl in HTML
                        updatedContent = updatedContent.replace(`local-media://${mediaId}`, downloadUrl);
                        
                        // Delete from local DB to free up space
                        await deleteLocalMedia(mediaId);
                    } catch (err) {
                        console.error('Failed to sync media:', mediaId, err);
                        stillPending.push(mediaId); // Retry later
                    }
                }

                // If content changed or pending list shrank, update Firestore
                if (stillPending.length !== detail.pendingMedia.length) {
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
