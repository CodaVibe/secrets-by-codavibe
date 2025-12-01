/**
 * IndexedDB Schema and Database Management
 *
 * Implements local storage for the Secrets vault using IndexedDB via the `idb` library.
 *
 * Stores:
 * - services: Service entries (password groups)
 * - credentials: Individual credential entries (encrypted)
 * - subscriptions: Subscription tracking entries
 * - metadata: App metadata (last sync time, user info, etc.)
 *
 * Features:
 * - Type-safe schema with DBSchema interface
 * - Quota monitoring for storage limits
 * - Indexes for efficient querying
 * - Batched cursor reads for performance
 *
 * Validates: P19.1-P19.4, AC5.1, AC5.4
 */

import { openDB, deleteDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { Service, Credential, CredentialType } from '$lib/stores/vault.svelte';
import type { Subscription, BillingCycle, Currency } from '$lib/stores/subscriptions.svelte';

// ==================== DATABASE SCHEMA ====================

/**
 * Database name and version
 */
export const DB_NAME = 'secrets-vault';
export const DB_VERSION = 1;

/**
 * Metadata store entry types
 */
export interface MetadataEntry {
	key: string;
	value: string | number | boolean | null;
	updatedAt: string;
}

/**
 * Sync metadata specifically
 */
export interface SyncMetadata {
	lastSyncedAt: number | null;
	userId: string | null;
	syncInProgress: boolean;
}

/**
 * IndexedDB Service entry (matches Service interface)
 */
export interface IDBService {
	id: string;
	userId: string;
	name: string;
	icon?: string;
	createdAt: string;
	updatedAt: string;
	/** Local-only: pending sync status */
	_pendingSync?: 'create' | 'update' | 'delete';
	/** Local-only: last synced timestamp */
	_lastSyncedAt?: number;
}

/**
 * IndexedDB Credential entry (matches Credential interface)
 */
export interface IDBCredential {
	id: string;
	serviceId: string;
	type: CredentialType;
	label: string;
	encryptedValue: string;
	iv: string;
	displayOrder: number;
	createdAt: string;
	updatedAt: string;
	/** Local-only: pending sync status */
	_pendingSync?: 'create' | 'update' | 'delete';
	/** Local-only: last synced timestamp */
	_lastSyncedAt?: number;
}

/**
 * IndexedDB Subscription entry (matches Subscription interface)
 */
export interface IDBSubscription {
	id: string;
	userId: string;
	serviceName: string;
	cost: number;
	currency: Currency;
	billingCycle: BillingCycle;
	billingCycleDays?: number;
	nextRenewal: number;
	paymentMethod?: string;
	startDate: number;
	tier?: string;
	isTrial: boolean;
	trialEndDate?: number;
	createdAt: string;
	updatedAt: string;
	/** Local-only: pending sync status */
	_pendingSync?: 'create' | 'update' | 'delete';
	/** Local-only: last synced timestamp */
	_lastSyncedAt?: number;
}

/**
 * Database schema definition for type safety
 */
export interface SecretsDBSchema extends DBSchema {
	services: {
		key: string;
		value: IDBService;
		indexes: {
			'by-userId': string;
			'by-updatedAt': string;
			'by-pendingSync': string;
		};
	};
	credentials: {
		key: string;
		value: IDBCredential;
		indexes: {
			'by-serviceId': string;
			'by-updatedAt': string;
			'by-pendingSync': string;
		};
	};
	subscriptions: {
		key: string;
		value: IDBSubscription;
		indexes: {
			'by-userId': string;
			'by-nextRenewal': number;
			'by-updatedAt': string;
			'by-pendingSync': string;
		};
	};
	metadata: {
		key: string;
		value: MetadataEntry;
	};
}

// ==================== DATABASE INSTANCE ====================

/**
 * Cached database instance
 */
let dbInstance: IDBPDatabase<SecretsDBSchema> | null = null;

/**
 * Open the database and create/upgrade schema as needed
 * P19.1: Define IndexedDB stores with proper indexes
 */
export async function openDatabase(): Promise<IDBPDatabase<SecretsDBSchema>> {
	if (dbInstance) {
		return dbInstance;
	}

	dbInstance = await openDB<SecretsDBSchema>(DB_NAME, DB_VERSION, {
		upgrade(db, oldVersion, newVersion, transaction) {
			// Version 1: Initial schema
			if (oldVersion < 1) {
				// Services store
				const servicesStore = db.createObjectStore('services', {
					keyPath: 'id',
				});
				servicesStore.createIndex('by-userId', 'userId');
				servicesStore.createIndex('by-updatedAt', 'updatedAt');
				servicesStore.createIndex('by-pendingSync', '_pendingSync');

				// Credentials store
				const credentialsStore = db.createObjectStore('credentials', {
					keyPath: 'id',
				});
				credentialsStore.createIndex('by-serviceId', 'serviceId');
				credentialsStore.createIndex('by-updatedAt', 'updatedAt');
				credentialsStore.createIndex('by-pendingSync', '_pendingSync');

				// Subscriptions store
				const subscriptionsStore = db.createObjectStore('subscriptions', {
					keyPath: 'id',
				});
				subscriptionsStore.createIndex('by-userId', 'userId');
				subscriptionsStore.createIndex('by-nextRenewal', 'nextRenewal');
				subscriptionsStore.createIndex('by-updatedAt', 'updatedAt');
				subscriptionsStore.createIndex('by-pendingSync', '_pendingSync');

				// Metadata store (key-value)
				db.createObjectStore('metadata', {
					keyPath: 'key',
				});
			}

			// Future migrations would go here:
			// if (oldVersion < 2) { ... }
		},
		blocked(currentVersion, blockedVersion, event) {
			console.warn(
				`Database blocked: current version ${currentVersion}, blocked version ${blockedVersion}`
			);
		},
		blocking(currentVersion, blockedVersion, event) {
			// Close the database to allow the upgrade to proceed
			dbInstance?.close();
			dbInstance = null;
		},
		terminated() {
			console.warn('Database connection terminated unexpectedly');
			dbInstance = null;
		},
	});

	return dbInstance;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}

/**
 * Delete the entire database (for logout/reset)
 */
export async function deleteDatabase(): Promise<void> {
	await closeDatabase();
	await deleteDB(DB_NAME, {
		blocked() {
			console.warn('Database deletion blocked by open connections');
		},
	});
}

// ==================== QUOTA MONITORING ====================

/**
 * Storage quota information
 */
export interface StorageQuota {
	/** Used storage in bytes */
	used: number;
	/** Total available storage in bytes */
	quota: number;
	/** Usage percentage (0-100) */
	usagePercent: number;
	/** Whether storage is running low (<10% remaining) */
	isLow: boolean;
}

/**
 * Get current storage quota usage
 * P19.4: Monitor storage quota
 */
export async function getStorageQuota(): Promise<StorageQuota | null> {
	if (!navigator.storage || !navigator.storage.estimate) {
		return null;
	}

	try {
		const estimate = await navigator.storage.estimate();
		const used = estimate.usage ?? 0;
		const quota = estimate.quota ?? 0;
		const usagePercent = quota > 0 ? (used / quota) * 100 : 0;

		return {
			used,
			quota,
			usagePercent,
			isLow: usagePercent > 90,
		};
	} catch (error) {
		console.error('Failed to get storage quota:', error);
		return null;
	}
}

/**
 * Request persistent storage (prevents browser from evicting data)
 * P19.3: Request persistent storage for important data
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (!navigator.storage || !navigator.storage.persist) {
		return false;
	}

	try {
		const isPersisted = await navigator.storage.persist();
		return isPersisted;
	} catch (error) {
		console.error('Failed to request persistent storage:', error);
		return false;
	}
}

/**
 * Check if storage is persistent
 */
export async function isStoragePersistent(): Promise<boolean> {
	if (!navigator.storage || !navigator.storage.persisted) {
		return false;
	}

	try {
		return await navigator.storage.persisted();
	} catch (error) {
		return false;
	}
}

// ==================== METADATA OPERATIONS ====================

/**
 * Get a metadata value
 */
export async function getMetadata(key: string): Promise<MetadataEntry | undefined> {
	const db = await openDatabase();
	return db.get('metadata', key);
}

/**
 * Set a metadata value
 */
export async function setMetadata(
	key: string,
	value: string | number | boolean | null
): Promise<void> {
	const db = await openDatabase();
	await db.put('metadata', {
		key,
		value,
		updatedAt: new Date().toISOString(),
	});
}

/**
 * Delete a metadata value
 */
export async function deleteMetadata(key: string): Promise<void> {
	const db = await openDatabase();
	await db.delete('metadata', key);
}

/**
 * Get sync metadata
 */
export async function getSyncMetadata(): Promise<SyncMetadata> {
	const db = await openDatabase();
	const [lastSyncedAt, userId, syncInProgress] = await Promise.all([
		db.get('metadata', 'lastSyncedAt'),
		db.get('metadata', 'userId'),
		db.get('metadata', 'syncInProgress'),
	]);

	return {
		lastSyncedAt: (lastSyncedAt?.value as number) ?? null,
		userId: (userId?.value as string) ?? null,
		syncInProgress: (syncInProgress?.value as boolean) ?? false,
	};
}

/**
 * Update sync metadata
 */
export async function updateSyncMetadata(updates: Partial<SyncMetadata>): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction('metadata', 'readwrite');

	const promises: Promise<string>[] = [];

	if (updates.lastSyncedAt !== undefined) {
		promises.push(
			tx.store.put({
				key: 'lastSyncedAt',
				value: updates.lastSyncedAt,
				updatedAt: new Date().toISOString(),
			})
		);
	}

	if (updates.userId !== undefined) {
		promises.push(
			tx.store.put({
				key: 'userId',
				value: updates.userId,
				updatedAt: new Date().toISOString(),
			})
		);
	}

	if (updates.syncInProgress !== undefined) {
		promises.push(
			tx.store.put({
				key: 'syncInProgress',
				value: updates.syncInProgress,
				updatedAt: new Date().toISOString(),
			})
		);
	}

	await Promise.all([...promises, tx.done]);
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convert IDBService to Service (strip local-only fields)
 */
export function toService(idbService: IDBService): Service {
	const { _pendingSync, _lastSyncedAt, ...service } = idbService;
	return service;
}

/**
 * Convert IDBCredential to Credential (strip local-only fields)
 */
export function toCredential(idbCredential: IDBCredential): Credential {
	const { _pendingSync, _lastSyncedAt, ...credential } = idbCredential;
	return credential;
}

/**
 * Convert IDBSubscription to Subscription (strip local-only fields)
 */
export function toSubscription(idbSubscription: IDBSubscription): Subscription {
	const { _pendingSync, _lastSyncedAt, ...subscription } = idbSubscription;
	return subscription;
}

/**
 * Get count of items in a store
 */
export async function getStoreCount(
	storeName: 'services' | 'credentials' | 'subscriptions'
): Promise<number> {
	const db = await openDatabase();
	return db.count(storeName);
}

/**
 * Clear all data from all stores (for logout)
 */
export async function clearAllStores(): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction(['services', 'credentials', 'subscriptions', 'metadata'], 'readwrite');

	await Promise.all([
		tx.objectStore('services').clear(),
		tx.objectStore('credentials').clear(),
		tx.objectStore('subscriptions').clear(),
		tx.objectStore('metadata').clear(),
		tx.done,
	]);
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
	try {
		return typeof indexedDB !== 'undefined' && indexedDB !== null;
	} catch {
		return false;
	}
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
	serviceCount: number;
	credentialCount: number;
	subscriptionCount: number;
	storageQuota: StorageQuota | null;
}> {
	const db = await openDatabase();
	const [serviceCount, credentialCount, subscriptionCount, storageQuota] = await Promise.all([
		db.count('services'),
		db.count('credentials'),
		db.count('subscriptions'),
		getStorageQuota(),
	]);

	return {
		serviceCount,
		credentialCount,
		subscriptionCount,
		storageQuota,
	};
}
