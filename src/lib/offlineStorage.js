// IndexedDB offline storage utility for caching and pending operations

const DB_NAME = 'ShepherdShield';
const DB_VERSION = 5;

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
      if (!database.objectStoreNames.contains('assignments_v2')) {
        database.createObjectStore('assignments_v2', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('pending_checkins')) {
        database.createObjectStore('pending_checkins', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('pending_actions')) {
        database.createObjectStore('pending_actions', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('messages')) {
        database.createObjectStore('messages', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('specialEvents')) {
        database.createObjectStore('specialEvents', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('teammap')) {
        database.createObjectStore('teammap', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('incidents')) {
        database.createObjectStore('incidents', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('watchlist')) {
        database.createObjectStore('watchlist', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('sops')) {
        database.createObjectStore('sops', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('members')) {
        database.createObjectStore('members', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('commandPositions')) {
        database.createObjectStore('commandPositions', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('teammap_v2')) {
        database.createObjectStore('teammap_v2', { keyPath: 'id' });
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

export const savePendingMessage = async (messageData) => {
  const database = await getDB();
  const transaction = database.transaction(['pending_actions'], 'readwrite');
  const store = transaction.objectStore('pending_actions');
  const request = store.add({
    type: 'message',
    data: messageData,
    timestamp: new Date().toISOString()
  });
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const savePendingDM = async (dmChannel, otherUser) => {
  const database = await getDB();
  const transaction = database.transaction(['pending_actions'], 'readwrite');
  const store = transaction.objectStore('pending_actions');
  const request = store.add({
    type: 'dm_channel',
    channel: dmChannel,
    otherUser: otherUser,
    timestamp: new Date().toISOString()
  });
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getPendingMessages = async () => {
  const database = await getDB();
  const transaction = database.transaction(['pending_actions'], 'readonly');
  const store = transaction.objectStore('pending_actions');
  const request = store.getAll();
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const messages = request.result.filter(item => item.type === 'message');
      resolve(messages);
    };
    request.onerror = () => reject(request.error);
  });
};

export const clearPendingAction = async (id) => {
  const database = await getDB();
  const transaction = database.transaction(['pending_actions'], 'readwrite');
  const store = transaction.objectStore('pending_actions');
  const request = store.delete(id);
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const syncPendingMessages = async (base44) => {
  const pendingMessages = await getPendingMessages();
  
  for (const pending of pendingMessages) {
    try {
      await base44.entities.TeamMessage.create(pending.data);
      await clearPendingAction(pending.id);
    } catch (error) {
      console.error('Failed to sync pending message:', error);
    }
  }
};

export const savePendingEquipmentAction = async (action) => {
  const database = await getDB();
  const transaction = database.transaction(['pending_actions'], 'readwrite');
  const store = transaction.objectStore('pending_actions');
  const request = store.add({
    type: 'equipment',
    ...action,
    timestamp: new Date().toISOString()
  });
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const syncPendingEquipmentActions = async (base44) => {
   const database = await getDB();
   const transaction = database.transaction(['pending_actions'], 'readonly');
   const store = transaction.objectStore('pending_actions');
   const request = store.getAll();

   return new Promise(async (resolve) => {
     request.onsuccess = async () => {
       const equipmentActions = request.result.filter(item => item.type === 'equipment');

       for (const action of equipmentActions) {
         try {
           await base44.entities.Equipment.update(action.equipmentId, action.data);
           await clearPendingAction(action.id);
         } catch (error) {
           console.error('Failed to sync equipment action:', error);
         }
       }
       resolve(equipmentActions.length > 0);
     };
   });
};

export const savePersonalCheckInState = async (state) => {
   if (typeof localStorage === 'undefined') return;
   localStorage.setItem('personal_checkin_state', JSON.stringify(state));
};

export const getPersonalCheckInState = async () => {
   if (typeof localStorage === 'undefined') return null;
   const stored = localStorage.getItem('personal_checkin_state');
   return stored ? JSON.parse(stored) : null;
};

export const savePendingPersonalCheckIn = async (action) => {
   const database = await getDB();
   const transaction = database.transaction(['pending_actions'], 'readwrite');
   const store = transaction.objectStore('pending_actions');
   const request = store.add({
     type: 'personal_checkin',
     ...action,
     timestamp: new Date().toISOString()
   });

   return new Promise((resolve, reject) => {
     request.onsuccess = () => resolve(request.result);
     request.onerror = () => reject(request.error);
   });
};

export const syncPendingPersonalCheckIns = async (base44) => {
   const database = await getDB();
   const transaction = database.transaction(['pending_actions'], 'readonly');
   const store = transaction.objectStore('pending_actions');
   const request = store.getAll();

   return new Promise(async (resolve) => {
     request.onsuccess = async () => {
       const checkins = request.result.filter(item => item.type === 'personal_checkin');

       for (const action of checkins) {
         try {
           if (action.action?.type === 'check_in') {
             await base44.entities.PersonalCheckIn.create(action.action?.data);
           } else if (action.action?.type === 'check_out' && action.action?.recordId) {
             await base44.entities.PersonalCheckIn.update(action.action?.recordId, action.action?.data);
           }
           await clearPendingAction(action.id);
         } catch (error) {
           console.error('Failed to sync personal check-in:', error);
         }
       }
       resolve(checkins.length > 0);
     };
   });
};