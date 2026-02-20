// IndexedDB for offline storage
const DB_NAME = 'ShepherdShieldDB';
const DB_VERSION = 1;

export const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Pending messages store
      if (!db.objectStoreNames.contains('pendingMessages')) {
        db.createObjectStore('pendingMessages', { keyPath: 'tempId', autoIncrement: true });
      }

      // Cached data stores
      if (!db.objectStoreNames.contains('assignments')) {
        db.createObjectStore('assignments', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('alerts')) {
        db.createObjectStore('alerts', { keyPath: 'id' });
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
    
    const messageWithTimestamp = {
      ...message,
      timestamp: Date.now()
    };
    
    store.add(messageWithTimestamp);

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
    
    for (const message of pendingMessages) {
      try {
        await base44.entities.TeamMessage.create({
          channel: message.channel,
          content: message.content,
          sender_name: message.sender_name,
          sender_email: message.sender_email,
          message_type: message.message_type || 'text'
        });
      } catch (error) {
        console.error('Failed to sync message:', error);
      }
    }

    await clearPendingMessages();
    return true;
  } catch (error) {
    console.error('Sync failed:', error);
    return false;
  }
};