// IndexedDB for offline storage
const DB_NAME = 'ShepherdShieldDB';
const DB_VERSION = 5;

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
      if (!db.objectStoreNames.contains('team_users')) {
        db.createObjectStore('team_users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingEquipmentActions')) {
        db.createObjectStore('pendingEquipmentActions', { keyPath: 'tempId', autoIncrement: true });
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

// ---- Pending Equipment Check-in/out (offline) ----

export const savePendingEquipmentAction = async (action) => {
  // action: { equipmentId, type: 'check-in'|'check-out', data: {...}, userName }
  try {
    const db = await openDB();
    const transaction = db.transaction(['pendingEquipmentActions'], 'readwrite');
    const store = transaction.objectStore('pendingEquipmentActions');
    store.add({ ...action, timestamp: Date.now() });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Save pending equipment action error:', error);
  }
};

export const syncPendingEquipmentActions = async (base44) => {
  try {
    const db = await openDB();
    const tx = db.transaction(['pendingEquipmentActions'], 'readonly');
    const store = tx.objectStore('pendingEquipmentActions');
    const request = store.getAll();
    const pending = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const action of pending) {
      try {
        await base44.entities.Equipment.update(action.equipmentId, action.data);
      } catch (error) {
        console.error('Failed to sync equipment action:', error);
      }
    }
    const tx2 = db.transaction(['pendingEquipmentActions'], 'readwrite');
    tx2.objectStore('pendingEquipmentActions').clear();
    return true;
  } catch (error) {
    console.error('Sync equipment actions failed:', error);
    return false;
  }
};

// ---- Pending DM Channels (track DMs started offline) ----

export const savePendingDM = async (dmChannel, otherUser) => {
  // Save the DM channel so it persists even if offline
  try {
    const db = await openDB();
    const transaction = db.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    // Store a marker message so the channel is tracked
    store.put({
      id: `dm-marker-${dmChannel}`,
      channel: dmChannel,
      content: '',
      sender_name: otherUser.full_name || otherUser.email,
      sender_email: otherUser.email,
      created_date: new Date().toISOString(),
      is_pinned: false,
      read_by: [],
      isPending: true
    });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Save pending DM error:', error);
  }
};