// IndexedDB offline storage utility for caching and pending operations

const DB_NAME = 'ShepherdShield';
const DB_VERSION = 1;

let db = null;

const getDB = async () => {
  if (db) return db;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Create object stores if they don't exist
      if (!database.objectStoreNames.contains('assignments')) {
        database.createObjectStore('assignments', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('pending_checkins')) {
        database.createObjectStore('pending_checkins', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('pending_actions')) {
        database.createObjectStore('pending_actions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
};

export const cacheData = async (storeName, data) => {
  const database = await getDB();
  const transaction = database.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  // Clear existing data
  store.clear();
  
  // Cache new data
  if (Array.isArray(data)) {
    data.forEach(item => store.add(item));
  } else {
    store.add(data);
  }
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedData = async (storeName) => {
  const database = await getDB();
  const transaction = database.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);
  const request = store.getAll();
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const savePendingCheckIn = async (data) => {
  const database = await getDB();
  const transaction = database.transaction(['pending_checkins'], 'readwrite');
  const store = transaction.objectStore('pending_checkins');
  const request = store.add({
    ...data,
    timestamp: new Date().toISOString()
  });
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getPendingCheckIns = async () => {
  const database = await getDB();
  const transaction = database.transaction(['pending_checkins'], 'readonly');
  const store = transaction.objectStore('pending_checkins');
  const request = store.getAll();
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const clearPendingCheckIn = async (id) => {
  const database = await getDB();
  const transaction = database.transaction(['pending_checkins'], 'readwrite');
  const store = transaction.objectStore('pending_checkins');
  const request = store.delete(id);
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const syncPendingCheckIns = async (base44) => {
  const pendingCheckIns = await getPendingCheckIns();
  
  for (const pending of pendingCheckIns) {
    try {
      await base44.entities.Assignment.update(pending.assignmentId, pending.data);
      await clearPendingCheckIn(pending.id);
    } catch (error) {
      console.error('Failed to sync pending check-in:', error);
    }
  }
};