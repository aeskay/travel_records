import { db } from './firebase';
import {
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    deleteDoc,
    updateDoc,
    query,
    where,
    orderBy,
    writeBatch,
    onSnapshot
} from 'firebase/firestore';

// Collection refs
const sectionsRef = collection(db, 'sections');
const detailsRef = collection(db, 'details');
const privateNotesRef = collection(db, 'private_notes');
const projectsRef = collection(db, 'projects');

// Helper to snapshot to array
const snapToData = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data(), docId: d.id }));

// Helper to extract short ID from a potentially composite ID
const getShortId = (section, projectId) => {
    let sid = section.id || section.docId || "";
    if (projectId) {
        // Recursively remove project prefix to handle "double-prefixed" older IDs (e.g. Proj_Proj_Sec)
        while (sid.startsWith(`${projectId}_`)) {
            sid = sid.substring(projectId.length + 1);
        }
    }
    return sid;
};

export const getProjects = async (username) => {
    // Projects created by or accessible to user
    const q = query(projectsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snapToData(snap);
};

export const getProject = async (projectId) => {
    const d = await getDoc(doc(projectsRef, projectId));
    if (d.exists()) {
        return { id: d.id, ...d.data() };
    }
    return null;
};

export const createProject = async (name, username) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const newProject = {
        name,
        createdBy: username,
        createdAt: new Date().toISOString(),
        startDate: today.toISOString().split('T')[0], // YYYY-MM-DD
        endDate: tomorrow.toISOString().split('T')[0], // YYYY-MM-DD
        users: [{ email: username, role: 'admin' }] // Creator is always admin
    };
    const docRef = await addDoc(projectsRef, newProject);
    return { id: docRef.id, ...newProject };
};

export const updateProject = async (projectId, data, username) => {
    await updateDoc(doc(projectsRef, projectId), {
        ...data,
        lastModified: new Date().toISOString(),
        lastModifiedBy: username || 'anon'
    });
};

export const manageProjectUsers = async (projectId, action, payload, username) => {
    const projectRef = doc(projectsRef, projectId);
    const projectSnap = await getDoc(projectRef);
    if (!projectSnap.exists()) throw new Error("Project not found");

    const project = projectSnap.data();
    let users = project.users || []; // Backwards compatibility

    // Check if requester is admin (simple check here, strict check in UI/Rules)
    // Note: We trust the UI for now as we don't have backend rules

    if (action === 'add') {
        // payload: { email, role }
        if (users.find(u => u.email === payload.email)) throw new Error("User already exists");
        users.push(payload);
    } else if (action === 'remove') {
        // payload: { email }
        users = users.filter(u => u.email !== payload.email);
    } else if (action === 'updateRole') {
        // payload: { email, role }
        users = users.map(u => u.email === payload.email ? { ...u, role: payload.role } : u);
    }

    await updateDoc(projectRef, {
        users,
        lastModified: new Date().toISOString(),
        lastModifiedBy: username
    });
};

export const deleteProject = async (projectId, username) => {
    // Ideally we should delete all sections associated with this project too
    // But since we don't have a backend function, we'd have to allow orphan sections or client-side batch delete.
    // implementing client-side batch delete for safety.

    // 1. Delete details for this project? (Hard to query details by project directly without join, but sections have projectId)
    // For now, let's just delete the project doc. Sections will become orphaned (projectId points to nothing).
    // Or we can query sections and delete them.

    const sectionsQ = query(sectionsRef, where('projectId', '==', projectId));
    const sectionsSnap = await getDocs(sectionsQ);

    const batch = writeBatch(db);
    sectionsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    batch.delete(doc(projectsRef, projectId));
    await batch.commit();
};

export const getSections = async (username, projectId) => {
    try {
        console.log(`[getSections] Fetching for projectId: ${projectId}`);
        const sectionsRef = collection(db, "sections");
        let q;

        if (projectId) {
            q = query(sectionsRef, where("projectId", "==", projectId));
        } else {
            q = query(sectionsRef, where("username", "==", username));
        }

        const querySnapshot = await getDocs(q);
        const rawSections = snapToData(querySnapshot);
        console.log(`[getSections] Found: ${rawSections.length} raw records.`);

        // Deduplicate using a Map based on the Short ID
        // If multiple versions exist (due to the prefixing bug), pick the one with latest lastModified
        const dedupMap = new Map();

        rawSections.forEach(s => {
            const sid = getShortId(s, projectId);
            const current = dedupMap.get(sid);

            if (!current || new Date(s.lastModified || 0) > new Date(current.lastModified || 0)) {
                dedupMap.set(sid, s);
            }
        });

        const sections = Array.from(dedupMap.values());
        console.log(`[getSections] Returning: ${sections.length} unique sections.`);

        // Sort by the display ID
        return sections.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

    } catch (error) {
        console.error("Error getting sections:", error);
        return [];
    }
};

export const addSection = async (section, username, projectId) => {
    if (!projectId && !section.projectId) throw new Error("Project ID is required for addSection");
    const pid = projectId || section.projectId;

    // Normalize ID to prevent double-prefixing (e.g. TripA_TripA_Sec1)
    const shortId = getShortId(section, pid);
    const compositeDocId = `${pid}_${shortId}`;

    const data = {
        ...section,
        id: shortId, // Ensure internal ID is short
        projectId: pid,
        lastModifiedBy: username || 'anon',
        lastModified: new Date().toISOString()
    };
    await setDoc(doc(sectionsRef, compositeDocId), data, { merge: true });
};

export const addSections = async (sections, username, { merge = false, projectId = null } = {}) => {
    if (!projectId) throw new Error("Project ID is required for addSections");
    const batch = writeBatch(db);
    let count = 0;

    for (const section of sections) {
        const shortId = getShortId(section, projectId);
        const compositeDocId = `${projectId}_${shortId}`;
        const docRef = doc(sectionsRef, compositeDocId);

        const data = {
            ...section,
            id: shortId,
            projectId: projectId,
            lastModifiedBy: username || 'anon',
            lastModified: new Date().toISOString()
        };

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

export const getDetails = async (sectionDocId, username) => {
    const q = query(
        detailsRef,
        where('sectionId', '==', sectionDocId),
    );
    const snap = await getDocs(q);
    const data = snapToData(snap);
    return data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

export const subscribeToDetails = (sectionDocId, username, callback) => {
    const q = query(
        detailsRef,
        where('sectionId', '==', sectionDocId)
    );

    return onSnapshot(q, (snapshot) => {
        const data = snapToData(snapshot);
        const sortedData = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        callback(sortedData);
    }, (error) => {
        console.error("Error subscribing to details:", error);
        callback([]);
    });
};

export const addDetail = async (detail, username) => {
    // detail.sectionId should be the section's docId (composite)
    await addDoc(detailsRef, detail);
};

export const updateDetail = async (detail, username) => {
    const { id, ...data } = detail;
    await updateDoc(doc(detailsRef, id), data);
};

export const deleteDetail = async (id, username) => {
    await deleteDoc(doc(detailsRef, id));
};

export const deleteSection = async (sectionDocId, username) => {
    await deleteDoc(doc(sectionsRef, sectionDocId));
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



export const getPrivateNote = async (sectionId, username, projectId) => {
    if (!projectId) return null;
    // Composite ID including projectId for isolation
    const noteId = `${projectId}_${sectionId}_${username}`;
    const docRef = doc(privateNotesRef, noteId);
    try {
        const d = await getDoc(docRef);
        if (d.exists()) {
            return { id: d.id, ...d.data() };
        }
        return null;
    } catch (e) {
        console.error("Error fetching private note:", e);
        return null;
    }
};

export const savePrivateNote = async (sectionId, username, content, projectId) => {
    if (!projectId) return;
    const noteId = `${projectId}_${sectionId}_${username}`;
    await setDoc(doc(privateNotesRef, noteId), {
        sectionId,
        projectId,
        username,
        content,
        lastModified: new Date().toISOString()
    });
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

export const saveSharedDaysPlan = async (projectId, plan) => {
    if (!projectId) return;
    const planRef = collection(db, 'user_plans');
    // Save to a specific document for this project
    await setDoc(doc(planRef, 'PLAN_' + projectId), {
        plan,
        projectId,
        lastModified: new Date().toISOString()
    });
};

export const getSharedDaysPlan = async (projectId) => {
    if (!projectId) return [];
    const planRef = collection(db, 'user_plans');
    try {
        const d = await getDoc(doc(planRef, 'PLAN_' + projectId));
        if (d.exists()) {
            return d.data().plan || [];
        }
    } catch (e) {
        console.error("Error fetching shared days plan:", e);
    }
    return [];
};

// --- Data Management (Scoped) ---

export const getProjectData = async (projectId) => {
    if (!projectId) throw new Error("Project ID required");

    // Fetch only sections for this project
    const sectionsQuery = query(sectionsRef, where("projectId", "==", projectId));
    const sectionsSnap = await getDocs(sectionsQuery);
    const sections = snapToData(sectionsSnap);

    // Fetch details for these sections
    const detailsQuery = query(detailsRef, where("projectId", "==", projectId));
    const detailsSnap = await getDocs(detailsQuery);
    const details = snapToData(detailsSnap);

    // Fetch private notes
    const notesQuery = query(privateNotesRef, where("projectId", "==", projectId));
    const notesSnap = await getDocs(notesQuery);
    const notes = snapToData(notesSnap);

    return {
        metadata: {
            projectId,
            exportedAt: new Date().toISOString(),
            version: "2.0" // Scoped version
        },
        sections,
        details,
        notes
    };
};

export const restoreProjectData = async (data, targetProjectId, username) => {
    if (!targetProjectId) throw new Error("Target Project ID required");
    if (!data || !data.sections) throw new Error("Invalid backup file format");

    console.log(`[Restore] Restoring to project ${targetProjectId}...`);
    const batch = writeBatch(db);
    let opCount = 0;

    const sections = data.sections || [];
    const details = data.details || [];
    const notes = data.notes || [];

    // 2. Import Sections
    for (const section of sections) {
        const realId = section.id;
        const newDocId = `${targetProjectId}_${realId}`;

        batch.set(doc(sectionsRef, newDocId), {
            ...section,
            projectId: targetProjectId,
            lastModifiedBy: username || 'restore',
            lastModified: new Date().toISOString()
        });
        opCount++;
        if (opCount >= 400) { await batch.commit(); opCount = 0; }
    }

    // 3. Import Details
    for (const detail of details) {
        let shortSectionId = detail.sectionId;
        // Try to recover short ID from scoped ID if needed
        if (shortSectionId.includes('_')) {
            const parent = sections.find(s => s.docId === detail.sectionId || s.id === detail.sectionId);
            if (parent) shortSectionId = parent.id;
            else shortSectionId = shortSectionId.split('_').pop(); // Fallback
        }

        const newSectionDocId = `${targetProjectId}_${shortSectionId}`;
        const newDetailId = detail.docId ? `${targetProjectId}_${detail.docId}` : doc(detailsRef).id;
        const newRef = doc(collection(db, 'details'));

        batch.set(newRef, {
            ...detail,
            sectionId: newSectionDocId,
            projectId: targetProjectId
        });
        opCount++;
        if (opCount >= 400) { await batch.commit(); opCount = 0; }
    }

    // 4. Import Notes
    for (const note of notes) {
        const shortSectionId = note.sectionId;
        if (!shortSectionId) continue;

        const newNoteId = `${targetProjectId}_${shortSectionId}_${note.username}`;

        batch.set(doc(privateNotesRef, newNoteId), {
            ...note,
            projectId: targetProjectId,
            lastModified: new Date().toISOString()
        });
        opCount++;
        if (opCount >= 400) { await batch.commit(); opCount = 0; }
    }

    if (opCount > 0) await batch.commit();
    return { success: true, count: sections.length };
};

export const duplicateProject = async (sourceProjectId, newName, username) => {
    // 1. Create new project
    const newProject = await createProject(newName, username);
    const targetId = newProject.id;
    console.log(`[Duplicate] Created ${targetId}, copying from ${sourceProjectId}`);

    // 2. Fetch source data
    const sourceData = await getProjectData(sourceProjectId);

    // 3. Restore to new project
    await restoreProjectData(sourceData, targetId, username);

    return newProject;
};


