// Offline Storage Service - SQLite for React Native

import SQLite from 'react-native-sqlite-storage';

// Enable promise-based API
SQLite.enablePromise(true);

let db: SQLite.SQLiteDatabase | null = null;

// Database initialization
export const initDatabase = async (): Promise<void> => {
  try {
    db = await SQLite.openDatabase({
      name: 'lazisnu_offline.db',
      location: 'default',
    });

    // Create tables
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS collections (
        offline_id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL,
        can_id TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        transfer_receipt_url TEXT,
        collected_at TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        device_info TEXT,
        synced INTEGER DEFAULT 0,
        sync_error TEXT,
        server_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS pending_tasks (
        id TEXT PRIMARY KEY,
        qr_code TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        owner_phone TEXT,
        owner_address TEXT,
        latitude REAL,
        longitude REAL,
        status TEXT DEFAULT 'ACTIVE',
        assigned_at TEXT,
        period TEXT
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        processed INTEGER DEFAULT 0
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

// Collection operations
export const collectionStorage = {
  // Save collection locally
  save: async (collection: {
    offline_id: string;
    assignment_id: string;
    can_id: string;
    amount: number;
    payment_method: 'CASH' | 'TRANSFER';
    transfer_receipt_url?: string;
    collected_at: string;
    latitude?: number;
    longitude?: number;
    device_info?: object;
  }): Promise<void> => {
    if (!db) throw new Error('Database not initialized');

    const {
      offline_id,
      assignment_id,
      can_id,
      amount,
      payment_method,
      transfer_receipt_url,
      collected_at,
      latitude,
      longitude,
      device_info,
    } = collection;

    await db.executeSql(
      `INSERT OR REPLACE INTO collections
       (offline_id, assignment_id, can_id, amount, payment_method, transfer_receipt_url, collected_at, latitude, longitude, device_info, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        offline_id,
        assignment_id,
        can_id,
        amount,
        payment_method,
        transfer_receipt_url || null,
        collected_at,
        latitude || null,
        longitude || null,
        device_info ? JSON.stringify(device_info) : null,
      ]
    );
  },

  // Get all unsynced collections
  getUnsynced: async (): Promise<any[]> => {
    if (!db) throw new Error('Database not initialized');

    const [results] = await db.executeSql(
      'SELECT * FROM collections WHERE synced = 0 ORDER BY created_at ASC'
    );

    const collections = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      collections.push({
        ...row,
        device_info: row.device_info ? JSON.parse(row.device_info) : null,
      });
    }
    return collections;
  },

  // Get count of unsynced
  getUnsyncedCount: async (): Promise<number> => {
    if (!db) throw new Error('Database not initialized');

    const [results] = await db.executeSql(
      'SELECT COUNT(*) as count FROM collections WHERE synced = 0'
    );

    return results.rows.item(0).count;
  },

  // Mark as synced
  markSynced: async (offlineId: string, serverId: string): Promise<void> => {
    if (!db) throw new Error('Database not initialized');

    await db.executeSql(
      'UPDATE collections SET synced = 1, server_id = ? WHERE offline_id = ?',
      [serverId, offlineId]
    );
  },

  // Mark as failed
  markFailed: async (offlineId: string, error: string): Promise<void> => {
    if (!db) throw new Error('Database not initialized');

    await db.executeSql(
      'UPDATE collections SET synced = 0, sync_error = ? WHERE offline_id = ?',
      [error, offlineId]
    );
  },

  // Get all collections (for history)
  getAll: async (limit = 50): Promise<any[]> => {
    if (!db) throw new Error('Database not initialized');

    const [results] = await db.executeSql(
      'SELECT * FROM collections ORDER BY collected_at DESC LIMIT ?',
      [limit]
    );

    const collections = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      collections.push({
        ...row,
        device_info: row.device_info ? JSON.parse(row.device_info) : null,
      });
    }
    return collections;
  },

  // Delete synced collections (cleanup)
  deleteSynced: async (): Promise<void> => {
    if (!db) throw new Error('Database not initialized');

    await db.executeSql('DELETE FROM collections WHERE synced = 1');
  },
};

// Tasks operations
export const taskStorage = {
  // Save tasks locally
  saveTasks: async (tasks: any[]): Promise<void> => {
    if (!db) throw new Error('Database not initialized');

    for (const task of tasks) {
      await db.executeSql(
        `INSERT OR REPLACE INTO pending_tasks
         (id, qr_code, owner_name, owner_phone, owner_address, latitude, longitude, status, assigned_at, period)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.qr_code,
          task.owner_name,
          task.owner_phone,
          task.owner_address,
          task.latitude || null,
          task.longitude || null,
          task.status || 'ACTIVE',
          task.assigned_at,
          task.period,
        ]
      );
    }
  },

  // Get all active tasks
  getActiveTasks: async (): Promise<any[]> => {
    if (!db) throw new Error('Database not initialized');

    const [results] = await db.executeSql(
      "SELECT * FROM pending_tasks WHERE status = 'ACTIVE' ORDER BY assigned_at ASC"
    );

    const tasks = [];
    for (let i = 0; i < results.rows.length; i++) {
      tasks.push(results.rows.item(i));
    }
    return tasks;
  },

  // Mark task as completed
  markCompleted: async (taskId: string): Promise<void> => {
    if (!db) throw new Error('Database not initialized');

    await db.executeSql(
      "UPDATE pending_tasks SET status = 'COMPLETED' WHERE id = ?",
      [taskId]
    );
  },

  // Get task by QR code
  getByQR: async (qrCode: string): Promise<any | null> => {
    if (!db) throw new Error('Database not initialized');

    const [results] = await db.executeSql(
      'SELECT * FROM pending_tasks WHERE qr_code = ? AND status = ?',
      [qrCode, 'ACTIVE']
    );

    if (results.rows.length > 0) {
      return results.rows.item(0);
    }
    return null;
  },
};

// Sync manager
export const syncManager = {
  // Check if online
  isOnline: async (): Promise<boolean> => {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const state = await NetInfo.fetch();
      return state.isConnected && state.isInternetReachable === true;
    } catch {
      return false;
    }
  },

  // Trigger sync
  sync: async (): Promise<{ success: number; failed: number }> => {
    const isConnected = await syncManager.isOnline();

    if (!isConnected) {
      return { success: 0, failed: 0 };
    }

    const unsyncedCollections = await collectionStorage.getUnsynced();
    let successCount = 0;
    let failedCount = 0;

    for (const collection of unsyncedCollections) {
      try {
        // Import API service dynamically to avoid circular dependency
        const { collectionService } = require('./api');
        const result = await collectionService.submitCollection(collection);

        if (result.success) {
          await collectionStorage.markSynced(
            collection.offline_id,
            result.data?.id || collection.offline_id
          );
          successCount++;
        } else {
          await collectionStorage.markFailed(
            collection.offline_id,
            result.error?.message || 'Unknown error'
          );
          failedCount++;
        }
      } catch (error: any) {
        await collectionStorage.markFailed(collection.offline_id, error.message);
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  },

  // Get sync status
  getStatus: async (): Promise<{
    pending: number;
    oldestPending: string | null;
  }> => {
    const count = await collectionStorage.getUnsyncedCount();
    const collections = await collectionStorage.getAll(1);

    return {
      pending: count,
      oldestPending: collections.length > 0 ? collections[0].collected_at : null,
    };
  },
};

// Close database
export const closeDatabase = async (): Promise<void> => {
  if (db) {
    await db.close();
    db = null;
  }
};

export default {
  initDatabase,
  closeDatabase,
  collections: collectionStorage,
  tasks: taskStorage,
  sync: syncManager,
};