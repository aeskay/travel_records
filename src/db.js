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
const snapToData = (snap) => snap.docs.map(d => ({ ...d.data(), id: d.id }));

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
    const newProject = {
        name,
        createdBy: username,
        createdAt: new Date().toISOString(),
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
    // If no projectId is passed, we might resolve to empty or all, 
    // but for this new system we really want a projectId. 
    // However, for debugging migration, we might want to be robust.

    // To avoid "Missing Index" errors on username+projectId, let's query by username ONLY first.
    // Then filter by projectId in JS. This is safe for < 1000 items.

    try {
        console.log(`[getSections] Fetching for projectId: ${projectId} (fallback: checks username)`);
        const sectionsRef = collection(db, "sections");
        let q;

        if (projectId) {
            // Priority: Query by Project ID directly.
            // This avoids username index issues if the username on sections is missing/different.
            q = query(sectionsRef, where("projectId", "==", projectId));
        } else {
            // Fallback: Query by username (only for non-project views if any)
            q = query(sectionsRef, where("username", "==", username));
        }

        const querySnapshot = await getDocs(q);
        const sections = snapToData(querySnapshot);
        console.log(`[getSections] Found: ${sections.length} sections.`);

        // Sort manually to avoid index requirements for now
        return sections.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

    } catch (error) {
        console.error("Error getting sections:", error);
        return [];
    }
};

export const addSection = async (section, username, projectId) => {
    // We use the Section ID as the document ID for easy lookup/deduplication
    const data = {
        ...section,
        lastModifiedBy: username || 'anon',
        lastModified: new Date().toISOString()
    };
    if (projectId) {
        data.projectId = projectId;
    }
    await setDoc(doc(sectionsRef, section.id), data, { merge: true });
};

export const addSections = async (sections, username, { merge = false, projectId = null } = {}) => {
    // Firestore allows batches of up to 500 ops.
    const batch = writeBatch(db);
    let count = 0;

    for (const section of sections) {
        const docRef = doc(sectionsRef, section.id);
        const data = {
            ...section,
            lastModifiedBy: username || 'anon',
            lastModified: new Date().toISOString()
        };
        if (projectId) {
            data.projectId = projectId;
        }

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

export const subscribeToDetails = (sectionId, username, callback) => {
    const q = query(
        detailsRef,
        where('sectionId', '==', sectionId)
    );

    // onSnapshot returns an unsubscribe function
    return onSnapshot(q, (snapshot) => {
        const data = snapToData(snapshot);
        // Sort manually to match getDetails behavior
        const sortedData = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        callback(sortedData);
    }, (error) => {
        console.error("Error subscribing to details:", error);
        callback([]);
    });
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



export const getPrivateNote = async (sectionId, username) => {
    // Unique ID for the private note based on section + user
    const noteId = `${sectionId}_${username}`;
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

export const savePrivateNote = async (sectionId, username, content) => {
    const noteId = `${sectionId}_${username}`;
    await setDoc(doc(privateNotesRef, noteId), {
        sectionId,
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

export const migrateLegacyData = async (username) => {
    // 1. Check if any projects exist
    const projectsSnap = await getDocs(projectsRef);
    if (!projectsSnap.empty) {
        return null; // Already migrated or started fresh
    }

    console.log("Migrating legacy data to default project...");

    // 2. Create Default Project
    const defaultProject = await createProject('2026 Round Trip (Legacy)', username);
    const projectId = defaultProject.id;

    // 3. Fetch ALL sections
    // Note: This fetches everything. If huge, might need pagination, but likely okay for now.
    const sectionsSnap = await getDocs(sectionsRef);
    const allSections = snapToData(sectionsSnap);

    // 4. Update all with projectId
    // Use batches
    const batch = writeBatch(db);
    let count = 0;

    for (const s of allSections) {
        // Only update if no projectId
        if (!s.projectId) {
            const ref = doc(sectionsRef, s.id);
            batch.update(ref, { projectId: projectId });
            count++;
            if (count >= 400) {
                await batch.commit();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();

    console.log(`Migration complete. ${allSections.length} sections moved to project ${projectId}`);
    return defaultProject;
};

export const consolidateLegacyProjects = async (username) => {
    console.log("Starting consolidation...");

    // 1. Get all projects
    const projectsSnap = await getDocs(projectsRef);
    const projects = snapToData(projectsSnap);

    // Find all legacy projects
    const legacyProjects = projects.filter(p => p.name.includes("Legacy"));

    if (legacyProjects.length < 2) {
        return { message: "No duplicates to consolidate.", deletedProjects: 0, totalSections: 0 };
    }

    // Sort by creation time (keep oldest or newest? Let's keep the one with most recent activity or just first)
    // Actually, sorting by createdAt allows us to keep the 'original'.
    legacyProjects.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const master = legacyProjects[0];
    const duplicates = legacyProjects.slice(1);

    console.log(`Master Project: ${master.id} (${master.name})`);

    // 2. Get ALL sections
    // Get everything to be safe
    const sectionsSnap = await getDocs(sectionsRef);
    const allSections = snapToData(sectionsSnap);

    const batch = writeBatch(db);
    let updatedCount = 0;
    let opsCount = 0;

    // 3. Move sections from duplicates to master
    for (const s of allSections) {
        // If section belongs to a duplicate project, move it to master
        if (duplicates.find(d => d.id === s.projectId)) {
            const ref = doc(sectionsRef, s.id);
            batch.update(ref, { projectId: master.id });
            updatedCount++;
            opsCount++;
        }

        // Also fix orphans if any? Maybe not for now, stay focused on duplicates.
        // But if they are orphans likely they belong to legacy.
        if (!s.projectId) {
            const ref = doc(sectionsRef, s.id);
            batch.update(ref, { projectId: master.id });
            updatedCount++;
            opsCount++;
        }

        if (opsCount >= 400) {
            await batch.commit();
            opsCount = 0;
        }
    }

    if (opsCount > 0) {
        await batch.commit();
        opsCount = 0;
    }

    // 4. Delete duplicate projects
    // Create new batch for deletions
    const deleteBatch = writeBatch(db);
    for (const dup of duplicates) {
        deleteBatch.delete(doc(projectsRef, dup.id));
    }
    await deleteBatch.commit();

    return {
        totalSections: allSections.length,
        movedSections: updatedCount,
        deletedProjects: duplicates.length,
        masterProject: master
    };
};


