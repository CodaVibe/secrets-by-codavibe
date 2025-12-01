/**
 * IndexedDB Schema Tests
 *
 * Tests for the IndexedDB database schema, initialization, and utility functions.
 * Uses fake-indexeddb for testing in Node.js environment.
 *
 * Validates: P19.1-P19.4, AC5.1, AC5.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
	openDatabase,
	closeDatabase,
	deleteDatabase,
	DB_NAME,
	DB_VERSION,
	getMetadata,
	setMetadata,
	deleteMetadata,
	getSyncMetadata,
	updateSyncMetadata,
	getStoreCount,
	clearAllStores,
	isIndexedDBAvailable,
	getDatabaseStats,
	toService,
	toCredential,
	toSubscription,
	type IDBService,
	type IDBCredential,
	type IDBSubscription,
} from './indexeddb';

describe('IndexedDB Schema', () => {
	beforeEach(async () => {
		// Clean up before each test
		await deleteDatabase();
	});

	afterEach(async () => {
		// Clean up after each test
		await closeDatabase();
	});

	// ==================== DATABASE INITIALIZATION ====================

	describe('openDatabase', () => {
		it('should open database with correct name and version', async () => {
			const db = await openDatabase();

			expect(db.name).toBe(DB_NAME);
			expect(db.version).toBe(DB_VERSION);
		});

		it('should create all required object stores', async () => {
			const db = await openDatabase();

			expect(db.objectStoreNames.contains('services')).toBe(true);
			expect(db.objectStoreNames.contains('credentials')).toBe(true);
			expect(db.objectStoreNames.contains('subscriptions')).toBe(true);
			expect(db.objectStoreNames.contains('metadata')).toBe(true);
		});

		it('should return cached instance on subsequent calls', async () => {
			const db1 = await openDatabase();
			const db2 = await openDatabase();

			expect(db1).toBe(db2);
		});

		it('should create services store with correct indexes', async () => {
			const db = await openDatabase();
			const tx = db.transaction('services', 'readonly');
			const store = tx.objectStore('services');

			expect(store.indexNames.contains('by-userId')).toBe(true);
			expect(store.indexNames.contains('by-updatedAt')).toBe(true);
			expect(store.indexNames.contains('by-pendingSync')).toBe(true);
		});

		it('should create credentials store with correct indexes', async () => {
			const db = await openDatabase();
			const tx = db.transaction('credentials', 'readonly');
			const store = tx.objectStore('credentials');

			expect(store.indexNames.contains('by-serviceId')).toBe(true);
			expect(store.indexNames.contains('by-updatedAt')).toBe(true);
			expect(store.indexNames.contains('by-pendingSync')).toBe(true);
		});

		it('should create subscriptions store with correct indexes', async () => {
			const db = await openDatabase();
			const tx = db.transaction('subscriptions', 'readonly');
			const store = tx.objectStore('subscriptions');

			expect(store.indexNames.contains('by-userId')).toBe(true);
			expect(store.indexNames.contains('by-nextRenewal')).toBe(true);
			expect(store.indexNames.contains('by-updatedAt')).toBe(true);
			expect(store.indexNames.contains('by-pendingSync')).toBe(true);
		});
	});

	describe('closeDatabase', () => {
		it('should close database connection', async () => {
			await openDatabase();
			await closeDatabase();

			// Opening again should create a new instance
			const db = await openDatabase();
			expect(db).toBeDefined();
		});

		it('should handle closing when not open', async () => {
			// Should not throw
			await closeDatabase();
		});
	});

	describe('deleteDatabase', () => {
		it('should delete the database', async () => {
			const db = await openDatabase();
			await db.put('metadata', {
				key: 'test',
				value: 'value',
				updatedAt: new Date().toISOString(),
			});

			await deleteDatabase();

			// Reopen and verify data is gone
			const newDb = await openDatabase();
			const result = await newDb.get('metadata', 'test');
			expect(result).toBeUndefined();
		});
	});

	// ==================== METADATA OPERATIONS ====================

	describe('Metadata Operations', () => {
		describe('setMetadata / getMetadata', () => {
			it('should store and retrieve string metadata', async () => {
				await setMetadata('testKey', 'testValue');
				const result = await getMetadata('testKey');

				expect(result?.key).toBe('testKey');
				expect(result?.value).toBe('testValue');
				expect(result?.updatedAt).toBeDefined();
			});

			it('should store and retrieve number metadata', async () => {
				await setMetadata('count', 42);
				const result = await getMetadata('count');

				expect(result?.value).toBe(42);
			});

			it('should store and retrieve boolean metadata', async () => {
				await setMetadata('enabled', true);
				const result = await getMetadata('enabled');

				expect(result?.value).toBe(true);
			});

			it('should store and retrieve null metadata', async () => {
				await setMetadata('nullable', null);
				const result = await getMetadata('nullable');

				expect(result?.value).toBe(null);
			});

			it('should update existing metadata', async () => {
				await setMetadata('key', 'value1');
				await setMetadata('key', 'value2');
				const result = await getMetadata('key');

				expect(result?.value).toBe('value2');
			});

			it('should return undefined for non-existent key', async () => {
				const result = await getMetadata('nonexistent');
				expect(result).toBeUndefined();
			});
		});

		describe('deleteMetadata', () => {
			it('should delete metadata', async () => {
				await setMetadata('toDelete', 'value');
				await deleteMetadata('toDelete');
				const result = await getMetadata('toDelete');

				expect(result).toBeUndefined();
			});

			it('should handle deleting non-existent key', async () => {
				// Should not throw
				await deleteMetadata('nonexistent');
			});
		});

		describe('getSyncMetadata', () => {
			it('should return default values when no sync metadata exists', async () => {
				const syncMeta = await getSyncMetadata();

				expect(syncMeta.lastSyncedAt).toBe(null);
				expect(syncMeta.userId).toBe(null);
				expect(syncMeta.syncInProgress).toBe(false);
			});

			it('should return stored sync metadata', async () => {
				await updateSyncMetadata({
					lastSyncedAt: 1234567890,
					userId: 'user-123',
					syncInProgress: true,
				});

				const syncMeta = await getSyncMetadata();

				expect(syncMeta.lastSyncedAt).toBe(1234567890);
				expect(syncMeta.userId).toBe('user-123');
				expect(syncMeta.syncInProgress).toBe(true);
			});
		});

		describe('updateSyncMetadata', () => {
			it('should update partial sync metadata', async () => {
				await updateSyncMetadata({ lastSyncedAt: 1000 });
				await updateSyncMetadata({ userId: 'user-456' });

				const syncMeta = await getSyncMetadata();

				expect(syncMeta.lastSyncedAt).toBe(1000);
				expect(syncMeta.userId).toBe('user-456');
			});

			it('should update all sync metadata at once', async () => {
				await updateSyncMetadata({
					lastSyncedAt: 2000,
					userId: 'user-789',
					syncInProgress: false,
				});

				const syncMeta = await getSyncMetadata();

				expect(syncMeta.lastSyncedAt).toBe(2000);
				expect(syncMeta.userId).toBe('user-789');
				expect(syncMeta.syncInProgress).toBe(false);
			});
		});
	});

	// ==================== STORE OPERATIONS ====================

	describe('Store Operations', () => {
		describe('getStoreCount', () => {
			it('should return 0 for empty stores', async () => {
				const count = await getStoreCount('services');
				expect(count).toBe(0);
			});

			it('should return correct count after adding items', async () => {
				const db = await openDatabase();

				await db.put('services', {
					id: 'service-1',
					userId: 'user-1',
					name: 'Test Service',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				await db.put('services', {
					id: 'service-2',
					userId: 'user-1',
					name: 'Test Service 2',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				const count = await getStoreCount('services');
				expect(count).toBe(2);
			});
		});

		describe('clearAllStores', () => {
			it('should clear all stores', async () => {
				const db = await openDatabase();

				// Add data to all stores
				await db.put('services', {
					id: 'service-1',
					userId: 'user-1',
					name: 'Test',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				await db.put('credentials', {
					id: 'cred-1',
					serviceId: 'service-1',
					type: 'password',
					label: 'Password',
					encryptedValue: 'encrypted',
					iv: 'iv',
					displayOrder: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				await db.put('subscriptions', {
					id: 'sub-1',
					userId: 'user-1',
					serviceName: 'Netflix',
					cost: 15.99,
					currency: 'USD',
					billingCycle: 'monthly',
					nextRenewal: Date.now(),
					startDate: Date.now(),
					isTrial: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				await setMetadata('test', 'value');

				// Clear all
				await clearAllStores();

				// Verify all stores are empty
				expect(await db.count('services')).toBe(0);
				expect(await db.count('credentials')).toBe(0);
				expect(await db.count('subscriptions')).toBe(0);
				expect(await db.count('metadata')).toBe(0);
			});
		});

		describe('getDatabaseStats', () => {
			it('should return correct statistics', async () => {
				const db = await openDatabase();

				// Add some data
				await db.put('services', {
					id: 'service-1',
					userId: 'user-1',
					name: 'Test',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				await db.put('credentials', {
					id: 'cred-1',
					serviceId: 'service-1',
					type: 'password',
					label: 'Password',
					encryptedValue: 'encrypted',
					iv: 'iv',
					displayOrder: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				await db.put('credentials', {
					id: 'cred-2',
					serviceId: 'service-1',
					type: 'username',
					label: 'Username',
					encryptedValue: 'encrypted',
					iv: 'iv',
					displayOrder: 1,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

				const stats = await getDatabaseStats();

				expect(stats.serviceCount).toBe(1);
				expect(stats.credentialCount).toBe(2);
				expect(stats.subscriptionCount).toBe(0);
			});
		});
	});

	// ==================== UTILITY FUNCTIONS ====================

	describe('Utility Functions', () => {
		describe('isIndexedDBAvailable', () => {
			it('should return true when IndexedDB is available', () => {
				expect(isIndexedDBAvailable()).toBe(true);
			});
		});

		describe('toService', () => {
			it('should strip local-only fields from IDBService', () => {
				const idbService: IDBService = {
					id: 'service-1',
					userId: 'user-1',
					name: 'Test Service',
					icon: 'icon.png',
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
					_pendingSync: 'create',
					_lastSyncedAt: 1234567890,
				};

				const service = toService(idbService);

				expect(service).toEqual({
					id: 'service-1',
					userId: 'user-1',
					name: 'Test Service',
					icon: 'icon.png',
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				});
				expect('_pendingSync' in service).toBe(false);
				expect('_lastSyncedAt' in service).toBe(false);
			});
		});

		describe('toCredential', () => {
			it('should strip local-only fields from IDBCredential', () => {
				const idbCredential: IDBCredential = {
					id: 'cred-1',
					serviceId: 'service-1',
					type: 'password',
					label: 'Password',
					encryptedValue: 'encrypted',
					iv: 'iv123',
					displayOrder: 0,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
					_pendingSync: 'update',
					_lastSyncedAt: 1234567890,
				};

				const credential = toCredential(idbCredential);

				expect(credential).toEqual({
					id: 'cred-1',
					serviceId: 'service-1',
					type: 'password',
					label: 'Password',
					encryptedValue: 'encrypted',
					iv: 'iv123',
					displayOrder: 0,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				});
				expect('_pendingSync' in credential).toBe(false);
				expect('_lastSyncedAt' in credential).toBe(false);
			});
		});

		describe('toSubscription', () => {
			it('should strip local-only fields from IDBSubscription', () => {
				const idbSubscription: IDBSubscription = {
					id: 'sub-1',
					userId: 'user-1',
					serviceName: 'Netflix',
					cost: 15.99,
					currency: 'USD',
					billingCycle: 'monthly',
					nextRenewal: 1704067200000,
					startDate: 1701388800000,
					isTrial: false,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
					_pendingSync: 'delete',
					_lastSyncedAt: 1234567890,
				};

				const subscription = toSubscription(idbSubscription);

				expect(subscription).toEqual({
					id: 'sub-1',
					userId: 'user-1',
					serviceName: 'Netflix',
					cost: 15.99,
					currency: 'USD',
					billingCycle: 'monthly',
					nextRenewal: 1704067200000,
					startDate: 1701388800000,
					isTrial: false,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T00:00:00Z',
				});
				expect('_pendingSync' in subscription).toBe(false);
				expect('_lastSyncedAt' in subscription).toBe(false);
			});
		});
	});

	// ==================== INDEX QUERIES ====================

	describe('Index Queries', () => {
		it('should query services by userId index', async () => {
			const db = await openDatabase();

			await db.put('services', {
				id: 'service-1',
				userId: 'user-1',
				name: 'Service 1',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await db.put('services', {
				id: 'service-2',
				userId: 'user-2',
				name: 'Service 2',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await db.put('services', {
				id: 'service-3',
				userId: 'user-1',
				name: 'Service 3',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const user1Services = await db.getAllFromIndex('services', 'by-userId', 'user-1');
			expect(user1Services).toHaveLength(2);
			expect(user1Services.map((s) => s.id)).toContain('service-1');
			expect(user1Services.map((s) => s.id)).toContain('service-3');
		});

		it('should query credentials by serviceId index', async () => {
			const db = await openDatabase();

			await db.put('credentials', {
				id: 'cred-1',
				serviceId: 'service-1',
				type: 'username',
				label: 'Username',
				encryptedValue: 'enc1',
				iv: 'iv1',
				displayOrder: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await db.put('credentials', {
				id: 'cred-2',
				serviceId: 'service-1',
				type: 'password',
				label: 'Password',
				encryptedValue: 'enc2',
				iv: 'iv2',
				displayOrder: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await db.put('credentials', {
				id: 'cred-3',
				serviceId: 'service-2',
				type: 'password',
				label: 'Password',
				encryptedValue: 'enc3',
				iv: 'iv3',
				displayOrder: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const service1Creds = await db.getAllFromIndex('credentials', 'by-serviceId', 'service-1');
			expect(service1Creds).toHaveLength(2);
		});

		it('should query subscriptions by nextRenewal index', async () => {
			const db = await openDatabase();
			const now = Date.now();

			await db.put('subscriptions', {
				id: 'sub-1',
				userId: 'user-1',
				serviceName: 'Netflix',
				cost: 15.99,
				currency: 'USD',
				billingCycle: 'monthly',
				nextRenewal: now + 1000000,
				startDate: now,
				isTrial: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await db.put('subscriptions', {
				id: 'sub-2',
				userId: 'user-1',
				serviceName: 'Spotify',
				cost: 9.99,
				currency: 'USD',
				billingCycle: 'monthly',
				nextRenewal: now + 500000,
				startDate: now,
				isTrial: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			// Query using IDBKeyRange for range queries
			const tx = db.transaction('subscriptions', 'readonly');
			const index = tx.store.index('by-nextRenewal');
			const range = IDBKeyRange.bound(now, now + 2000000);
			const results = await index.getAll(range);

			expect(results).toHaveLength(2);
			// Should be sorted by nextRenewal
			expect(results[0].serviceName).toBe('Spotify');
			expect(results[1].serviceName).toBe('Netflix');
		});

		it('should query items by pendingSync index', async () => {
			const db = await openDatabase();

			await db.put('services', {
				id: 'service-1',
				userId: 'user-1',
				name: 'Synced Service',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await db.put('services', {
				id: 'service-2',
				userId: 'user-1',
				name: 'Pending Create',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				_pendingSync: 'create',
			});

			await db.put('services', {
				id: 'service-3',
				userId: 'user-1',
				name: 'Pending Update',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				_pendingSync: 'update',
			});

			const pendingCreate = await db.getAllFromIndex('services', 'by-pendingSync', 'create');
			expect(pendingCreate).toHaveLength(1);
			expect(pendingCreate[0].name).toBe('Pending Create');

			const pendingUpdate = await db.getAllFromIndex('services', 'by-pendingSync', 'update');
			expect(pendingUpdate).toHaveLength(1);
			expect(pendingUpdate[0].name).toBe('Pending Update');
		});
	});

	// ==================== TRANSACTIONS ====================

	describe('Transactions', () => {
		it('should support multi-store transactions', async () => {
			const db = await openDatabase();

			const tx = db.transaction(['services', 'credentials'], 'readwrite');

			await tx.objectStore('services').put({
				id: 'service-1',
				userId: 'user-1',
				name: 'Test Service',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await tx.objectStore('credentials').put({
				id: 'cred-1',
				serviceId: 'service-1',
				type: 'password',
				label: 'Password',
				encryptedValue: 'encrypted',
				iv: 'iv',
				displayOrder: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await tx.done;

			// Verify both were saved
			const service = await db.get('services', 'service-1');
			const credential = await db.get('credentials', 'cred-1');

			expect(service).toBeDefined();
			expect(credential).toBeDefined();
		});
	});
});
