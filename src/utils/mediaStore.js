import { openDB } from 'idb';

const DB_NAME = 'trip-media-db';
const STORE_NAME = 'offlineMedia';

const getDB = async () => {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    });
};

/**
 * Saves a raw media Blob locally.
 * @param {string} id - Unique media ID.
 * @param {Blob} blob - The raw image or audio Blob.
 * @param {string} type - 'image' or 'audio'
 */
export const saveLocalMedia = async (id, blob, type) => {
    const db = await getDB();
    await db.put(STORE_NAME, {
        id,
        blob,
        type,
        timestamp: new Date().toISOString()
    });
};

/**
 * Retrieves a locally saved media Blob.
 * @param {string} id 
 * @returns {Blob|null}
 */
export const getLocalMedia = async (id) => {
    const db = await getDB();
    const record = await db.get(STORE_NAME, id);
    return record ? record.blob : null;
};

/**
 * Deletes a media blob from local storage after it has been synced.
 * @param {string} id 
 */
export const deleteLocalMedia = async (id) => {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
};
