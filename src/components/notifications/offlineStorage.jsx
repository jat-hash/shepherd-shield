// IndexedDB for offline storage
const DB_NAME = 'ShepherdShieldDB';
const DB_VERSION = 4;

export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('pendingMessages')) {
        db.createObjectStore('pendingMessages', { keyPath: 'tempId', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('assignments')) {
        db.createObjectStore('assignments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('alerts')) {
        db.createObjectStore('alerts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('specialEvents')) {
        db.createObjectStore('specialEvents', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('equipment')) {
        db.createObjectStore('equipment', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingCheckIns')) {
        db.createObjectStore('pendingCheckIns', { keyPath: 'tempId', autoIncrement: true });
      }
    };
  });
};

// Save data to cache
export const cacheData = async (storeName, data) => {
  try {
    const db = await openDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    if (Array.isArray(data)) {
      data.forEach(item => store.put(item));
    } else {
      store.put(data);
    }
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Cache error:', error);
  }
};

// Get cached data
export const getCachedData = async (storeName) => {
  try {
    const db = await openDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Get cache error:', error);
    return [];
  }
};

// Save pending message
export const savePendingMessage = async (message) => {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingMessages'], 'readwrite');
    const store = transaction.objectStore('pendingMessages');
    store.add({ ...message, timestamp: Date.now() });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Save pending message error:', error);
  }
};

// Get pending messages
export const getPendingMessages = async () => {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingMessages'], 'readonly');
    const store = transaction.objectStore('pendingMessages');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Get pending messages error:', error);
    return [];
  }
};

// Clear pending messages
export const clearPendingMessages = async () => {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingMessages'], 'readwrite');
    const store = transaction.objectStore('pendingMessages');
    store.clear();
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Clear pending messages error:', error);
  }
};

// Sync pending messages when back online
export const syncPendingMessages = async (base44) => {
  try {
    const pendingMessages = await getPendingMessages();
    const failed = [];
    for (const message of pendingMessages) {
      try {
        const { tempId, timestamp, isPending, ...msgData } = message;
        await base44.entities.TeamMessage.create({
          ...msgData,
          message_type: msgData.message_type || 'text'
        });
      } catch (error) {
        console.error('Failed to sync message:', error);
        failed.push(message);
      }
    }
    await clearPendingMessages();
    // Re-save any that failed so they aren't lost
    for (const msg of failed) {
      await savePendingMessage(msg).catch(() => {});
    }
    return failed.length === 0;
  } catch (error) {
    console.error('Sync failed:', error);
    return false;
  }
};

// ---- Pending Check-ins (offline check-in/out) ----

export const savePendingCheckIn = async (action) => {
  // action: { assignmentId, type: 'check_in'|'check_out'|'reset', data: {...} }
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingCheckIns'], 'readwrite');
    const store = transaction.objectStore('pendingCheckIns');
    store.add({ ...action, timestamp: Date.now() });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Save pending check-in error:', error);
  }
};

export const getPendingCheckIns = async () => {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingCheckIns'], 'readonly');
    const store = transaction.objectStore('pendingCheckIns');
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return [];
  }
};

export const clearPendingCheckIns = async () => {
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingCheckIns'], 'readwrite');
    const store = transaction.objectStore('pendingCheckIns');
    store.clear();
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Clear pending check-ins error:', error);
  }
};

export const syncPendingCheckIns = async (base44) => {
  try {
    const pending = await getPendingCheckIns();
    for (const action of pending) {
      try {
        await base44.entities.Assignment.update(action.assignmentId, action.data);
      } catch (error) {
        console.error('Failed to sync check-in:', error);
      }
    }
    await clearPendingCheckIns();
    return true;
  } catch (error) {
    console.error('Sync check-ins failed:', error);
    return false;
  }
};