import { openDB } from 'idb';

const getDBName = (username) => username ? `section-db-${username}` : 'section-info-db';
const DB_VERSION = 1;

export const initDB = async (username) => {
    return openDB(getDBName(username), DB_VERSION, {
        upgrade(db) {
            // Store for sections
            if (!db.objectStoreNames.contains('sections')) {
                const sectionStore = db.createObjectStore('sections', { keyPath: 'id' });
                sectionStore.createIndex('type', 'type');
                sectionStore.createIndex('coordinates', 'coordinates');
            }

            // Store for details/notes
            if (!db.objectStoreNames.contains('details')) {
                const detailStore = db.createObjectStore('details', { keyPath: 'id', autoIncrement: true });
                detailStore.createIndex('sectionId', 'sectionId');
                detailStore.createIndex('timestamp', 'timestamp');
            }
        },
    });
};

export const getSections = async (username) => {
    const db = await initDB(username);
    return db.getAll('sections');
};

export const addSection = async (section, username) => {
    const db = await initDB(username);
    return db.put('sections', section);
};

export const addSections = async (sections, username) => {
    const db = await initDB(username);
    const tx = db.transaction('sections', 'readwrite');
    const store = tx.objectStore('sections');
    for (const section of sections) {
        await store.put(section);
    }
    await tx.done;
};

export const getDetails = async (sectionId, username) => {
    const db = await initDB(username);
    return db.getAllFromIndex('details', 'sectionId', sectionId);
};

export const addDetail = async (detail, username) => {
    const db = await initDB(username);
    return db.add('details', detail);
};

export const clearSections = async (username) => {
    const db = await initDB(username);
    const tx = db.transaction(['sections', 'details'], 'readwrite');
    await tx.objectStore('sections').clear();
    await tx.objectStore('details').clear();
    await tx.done;
};

export const updateDetail = async (detail, username) => {
    const db = await initDB(username);
    return db.put('details', detail);
};

export const deleteDetail = async (id, username) => {
    const db = await initDB(username);
    return db.delete('details', id);
};

export const getAllData = async (username) => {
    const db = await initDB(username);
    const sections = await db.getAll('sections');
    const details = await db.getAll('details');
    return { sections, details };
};

export const restoreData = async (data, username) => {
    const db = await initDB(username);
    const tx = db.transaction(['sections', 'details'], 'readwrite');
    await tx.objectStore('sections').clear();
    await tx.objectStore('details').clear();

    if (data.sections) {
        for (const s of data.sections) await tx.objectStore('sections').put(s);
    }
    if (data.details) {
        for (const d of data.details) await tx.objectStore('details').put(d);
    }
    await tx.done;
};
