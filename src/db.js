import { db } from './firebase';
import {
    collection,
    getDocs,
    doc,
    setDoc,
    addDoc,
    deleteDoc,
    updateDoc,
    query,
    where,
    orderBy,
    writeBatch
} from 'firebase/firestore';

// Collection refs
const sectionsRef = collection(db, 'sections');
const detailsRef = collection(db, 'details');

// Helper to snapshot to array
const snapToData = (snap) => snap.docs.map(d => ({ ...d.data(), id: d.id }));

export const getSections = async (username) => {
    // In shared mode, we ignore username and return all sections.
    // If you wanted private sections, you'd add: where('username', '==', username)
    const q = query(sectionsRef, orderBy('id'));
    const snap = await getDocs(q);
    return snapToData(snap);
};

export const addSection = async (section, username) => {
    // We use the Section ID as the document ID for easy lookup/deduplication
    await setDoc(doc(sectionsRef, section.id), { ...section, lastModifiedBy: username || 'anon' });
};

export const addSections = async (sections, username, { merge = false } = {}) => {
    // Firestore allows batches of up to 500 ops.
    const batch = writeBatch(db);
    let count = 0;

    for (const section of sections) {
        const docRef = doc(sectionsRef, section.id);
        const data = { ...section, lastModifiedBy: username || 'anon' };
        if (merge) {
            batch.set(docRef, data, { merge: true });
        } else {
            batch.set(docRef, data);
        }
        count++;
        if (count >= 400) {
            await batch.commit();
            count = 0;
        }
    }
    if (count > 0) await batch.commit();
};

export const getDetails = async (sectionId, username) => {
    const q = query(
        detailsRef,
        where('sectionId', '==', sectionId),
        // orderBy('timestamp', 'asc') // Requires an index in Firestore usually
    );
    const snap = await getDocs(q);
    // Sort manually to avoid index creation delay for the user right now
    const data = snapToData(snap);
    return data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

export const addDetail = async (detail, username) => {
    await addDoc(detailsRef, detail);
};

export const updateDetail = async (detail, username) => {
    const { id, ...data } = detail;
    await updateDoc(doc(detailsRef, id), data);
};

export const deleteDetail = async (id, username) => {
    await deleteDoc(doc(detailsRef, id));
};

export const deleteSection = async (sectionId, username) => {
    await deleteDoc(doc(sectionsRef, sectionId));
};

export const clearSections = async (username) => {
    console.warn("clearSections not fully implemented for Firestore shared DB to prevent accidental data loss.");
};

export const getAllData = async (username) => {
    const sectionsSnap = await getDocs(sectionsRef);
    const detailsSnap = await getDocs(detailsRef);
    return {
        sections: snapToData(sectionsSnap),
        details: snapToData(detailsSnap)
    };
};

export const restoreData = async (data, username) => {
    // Careful with this!
    if (data.sections) await addSections(data.sections, username);
    if (data.details) {
        for (const d of data.details) {
            await addDetail(d, username);
        }
    }
};
