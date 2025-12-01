/**
 * IndexedDB CRUD Operations
 *
 * Implements CRUD operations for services, credentials, and subscriptions
 * with batched cursor reads for performance.
 *
 * Features:
 * - Type-safe operations with proper error handling
 * - Batched cursor reads (configurable batch size)
 * - Pending sync tracking for offline support
 * - Transaction-based operations for data integrity
 *
 * Validates: AC5.2, AC5.5
 */

import {
	openDatabase,
	toService,
	toCredential,
	toSubscription,
	type IDBService,
	type IDBCredential,
	type IDBSubscription,
} from './indexeddb';
import type { Service, Credential } from '$lib/stores/vault.svelte';
import type { Subscription } from '$lib/stores/subscriptions.svelte';

// ==================== CONSTANTS ====================

/** Default batch size for cursor reads */
export const DEFAULT_BATCH_SIZE = 20;

// ==================== SERVICES CRUD ====================

/**
 * Save a service to IndexedDB
 * @param service - Service to save
 * @param pendingSync - Optional sync status for offline support
 */
export async function saveService(
	service: Service,
	pendingSync?: 'create' | 'update' | 'delete'
): Promise<void> {
	const db = await openDatabase();
	const idbService: IDBService = {
		...service,
		_pendingSync: pendingSync,
		_lastSyncedAt: pendingSync ? undefined : Date.now(),
	};
	await db.put('services', idbService);
}

/**
 * Save multiple services in a single transaction
 * @param services - Services to save
 * @param pendingSync - Optional sync status for all services
 */
export async function saveServices(
	services: Service[],
	pendingSync?: 'create' | 'update' | 'delete'
): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction('services', 'readwrite');

	const promises = services.map((service) => {
		const idbService: IDBService = {
			...service,
			_pendingSync: pendingSync,
			_lastSyncedAt: pendingSync ? undefined : Date.now(),
		};
		return tx.store.put(idbService);
	});

	await Promise.all([...promises, tx.done]);
}

/**
 * Get a service by ID
 * @param id - Service ID
 * @returns Service or undefined if not found
 */
export async function getService(id: string): Promise<Service | undefined> {
	const db = await openDatabase();
	const idbService = await db.get('services', id);
	return idbService ? toService(idbService) : undefined;
}

/**
 * Get all services for a user
 * @param userId - User ID
 * @returns Array of services
 */
export async function getServices(userId: string): Promise<Service[]> {
	const db = await openDatabase();
	const idbServices = await db.getAllFromIndex('services', 'by-userId', userId);
	return idbServices.map(toService);
}

/**
 * Get services with batched cursor reads
 * @param userId - User ID
 * @param batchSize - Number of items per batch (default: 20)
 * @returns AsyncGenerator yielding batches of services
 */
export async function* getServicesBatched(
	userId: string,
	batchSize: number = DEFAULT_BATCH_SIZE
): AsyncGenerator<Service[], void, unknown> {
	const db = await openDatabase();
	const tx = db.transaction('services', 'readonly');
	const index = tx.store.index('by-userId');

	let cursor = await index.openCursor(userId);
	let batch: Service[] = [];

	while (cursor) {
		batch.push(toService(cursor.value));

		if (batch.length >= batchSize) {
			yield batch;
			batch = [];
		}

		cursor = await cursor.continue();
	}

	// Yield remaining items
	if (batch.length > 0) {
		yield batch;
	}
}

/**
 * Get all services (regardless of user)
 * @returns Array of all services
 */
export async function getAllServices(): Promise<Service[]> {
	const db = await openDatabase();
	const idbServices = await db.getAll('services');
	return idbServices.map(toService);
}

/**
 * Delete a service by ID
 * @param id - Service ID
 */
export async function deleteService(id: string): Promise<void> {
	const db = await openDatabase();
	await db.delete('services', id);
}

/**
 * Soft delete a service (mark for sync deletion)
 * @param id - Service ID
 */
export async function softDeleteService(id: string): Promise<void> {
	const db = await openDatabase();
	const service = await db.get('services', id);
	if (service) {
		service._pendingSync = 'delete';
		await db.put('services', service);
	}
}

/**
 * Get services pending sync
 * @returns Array of services with pending sync operations
 */
export async function getServicesPendingSync(): Promise<IDBService[]> {
	const db = await openDatabase();
	const tx = db.transaction('services', 'readonly');
	const index = tx.store.index('by-pendingSync');

	const results: IDBService[] = [];

	// Get all pending operations
	for (const status of ['create', 'update', 'delete'] as const) {
		let cursor = await index.openCursor(status);
		while (cursor) {
			results.push(cursor.value);
			cursor = await cursor.continue();
		}
	}

	return results;
}

/**
 * Clear pending sync status for a service
 * @param id - Service ID
 */
export async function clearServicePendingSync(id: string): Promise<void> {
	const db = await openDatabase();
	const service = await db.get('services', id);
	if (service) {
		delete service._pendingSync;
		service._lastSyncedAt = Date.now();
		await db.put('services', service);
	}
}

// ==================== CREDENTIALS CRUD ====================

/**
 * Save a credential to IndexedDB
 * @param credential - Credential to save
 * @param pendingSync - Optional sync status for offline support
 */
export async function saveCredential(
	credential: Credential,
	pendingSync?: 'create' | 'update' | 'delete'
): Promise<void> {
	const db = await openDatabase();
	const idbCredential: IDBCredential = {
		...credential,
		_pendingSync: pendingSync,
		_lastSyncedAt: pendingSync ? undefined : Date.now(),
	};
	await db.put('credentials', idbCredential);
}

/**
 * Save multiple credentials in a single transaction
 * @param credentials - Credentials to save
 * @param pendingSync - Optional sync status for all credentials
 */
export async function saveCredentials(
	credentials: Credential[],
	pendingSync?: 'create' | 'update' | 'delete'
): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction('credentials', 'readwrite');

	const promises = credentials.map((credential) => {
		const idbCredential: IDBCredential = {
			...credential,
			_pendingSync: pendingSync,
			_lastSyncedAt: pendingSync ? undefined : Date.now(),
		};
		return tx.store.put(idbCredential);
	});

	await Promise.all([...promises, tx.done]);
}

/**
 * Get a credential by ID
 * @param id - Credential ID
 * @returns Credential or undefined if not found
 */
export async function getCredential(id: string): Promise<Credential | undefined> {
	const db = await openDatabase();
	const idbCredential = await db.get('credentials', id);
	return idbCredential ? toCredential(idbCredential) : undefined;
}

/**
 * Get all credentials for a service
 * @param serviceId - Service ID
 * @returns Array of credentials sorted by displayOrder
 */
export async function getCredentials(serviceId: string): Promise<Credential[]> {
	const db = await openDatabase();
	const idbCredentials = await db.getAllFromIndex('credentials', 'by-serviceId', serviceId);
	return idbCredentials.map(toCredential).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get credentials with batched cursor reads
 * @param serviceId - Service ID
 * @param batchSize - Number of items per batch (default: 20)
 * @returns AsyncGenerator yielding batches of credentials
 */
export async function* getCredentialsBatched(
	serviceId: string,
	batchSize: number = DEFAULT_BATCH_SIZE
): AsyncGenerator<Credential[], void, unknown> {
	const db = await openDatabase();
	const tx = db.transaction('credentials', 'readonly');
	const index = tx.store.index('by-serviceId');

	let cursor = await index.openCursor(serviceId);
	let batch: Credential[] = [];

	while (cursor) {
		batch.push(toCredential(cursor.value));

		if (batch.length >= batchSize) {
			// Sort batch by displayOrder before yielding
			batch.sort((a, b) => a.displayOrder - b.displayOrder);
			yield batch;
			batch = [];
		}

		cursor = await cursor.continue();
	}

	// Yield remaining items
	if (batch.length > 0) {
		batch.sort((a, b) => a.displayOrder - b.displayOrder);
		yield batch;
	}
}

/**
 * Get all credentials (regardless of service)
 * @returns Array of all credentials
 */
export async function getAllCredentials(): Promise<Credential[]> {
	const db = await openDatabase();
	const idbCredentials = await db.getAll('credentials');
	return idbCredentials.map(toCredential);
}

/**
 * Delete a credential by ID
 * @param id - Credential ID
 */
export async function deleteCredential(id: string): Promise<void> {
	const db = await openDatabase();
	await db.delete('credentials', id);
}

/**
 * Soft delete a credential (mark for sync deletion)
 * @param id - Credential ID
 */
export async function softDeleteCredential(id: string): Promise<void> {
	const db = await openDatabase();
	const credential = await db.get('credentials', id);
	if (credential) {
		credential._pendingSync = 'delete';
		await db.put('credentials', credential);
	}
}

/**
 * Delete all credentials for a service
 * @param serviceId - Service ID
 */
export async function deleteCredentialsByService(serviceId: string): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction('credentials', 'readwrite');
	const index = tx.store.index('by-serviceId');

	let cursor = await index.openCursor(serviceId);
	while (cursor) {
		await cursor.delete();
		cursor = await cursor.continue();
	}

	await tx.done;
}

/**
 * Get credentials pending sync
 * @returns Array of credentials with pending sync operations
 */
export async function getCredentialsPendingSync(): Promise<IDBCredential[]> {
	const db = await openDatabase();
	const tx = db.transaction('credentials', 'readonly');
	const index = tx.store.index('by-pendingSync');

	const results: IDBCredential[] = [];

	for (const status of ['create', 'update', 'delete'] as const) {
		let cursor = await index.openCursor(status);
		while (cursor) {
			results.push(cursor.value);
			cursor = await cursor.continue();
		}
	}

	return results;
}

/**
 * Clear pending sync status for a credential
 * @param id - Credential ID
 */
export async function clearCredentialPendingSync(id: string): Promise<void> {
	const db = await openDatabase();
	const credential = await db.get('credentials', id);
	if (credential) {
		delete credential._pendingSync;
		credential._lastSyncedAt = Date.now();
		await db.put('credentials', credential);
	}
}

// ==================== SUBSCRIPTIONS CRUD ====================

/**
 * Save a subscription to IndexedDB
 * @param subscription - Subscription to save
 * @param pendingSync - Optional sync status for offline support
 */
export async function saveSubscription(
	subscription: Subscription,
	pendingSync?: 'create' | 'update' | 'delete'
): Promise<void> {
	const db = await openDatabase();
	const idbSubscription: IDBSubscription = {
		...subscription,
		_pendingSync: pendingSync,
		_lastSyncedAt: pendingSync ? undefined : Date.now(),
	};
	await db.put('subscriptions', idbSubscription);
}

/**
 * Save multiple subscriptions in a single transaction
 * @param subscriptions - Subscriptions to save
 * @param pendingSync - Optional sync status for all subscriptions
 */
export async function saveSubscriptions(
	subscriptions: Subscription[],
	pendingSync?: 'create' | 'update' | 'delete'
): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction('subscriptions', 'readwrite');

	const promises = subscriptions.map((subscription) => {
		const idbSubscription: IDBSubscription = {
			...subscription,
			_pendingSync: pendingSync,
			_lastSyncedAt: pendingSync ? undefined : Date.now(),
		};
		return tx.store.put(idbSubscription);
	});

	await Promise.all([...promises, tx.done]);
}

/**
 * Get a subscription by ID
 * @param id - Subscription ID
 * @returns Subscription or undefined if not found
 */
export async function getSubscription(id: string): Promise<Subscription | undefined> {
	const db = await openDatabase();
	const idbSubscription = await db.get('subscriptions', id);
	return idbSubscription ? toSubscription(idbSubscription) : undefined;
}

/**
 * Get all subscriptions for a user
 * @param userId - User ID
 * @returns Array of subscriptions sorted by nextRenewal
 */
export async function getSubscriptions(userId: string): Promise<Subscription[]> {
	const db = await openDatabase();
	const idbSubscriptions = await db.getAllFromIndex('subscriptions', 'by-userId', userId);
	return idbSubscriptions.map(toSubscription).sort((a, b) => a.nextRenewal - b.nextRenewal);
}

/**
 * Get subscriptions with batched cursor reads
 * @param userId - User ID
 * @param batchSize - Number of items per batch (default: 20)
 * @returns AsyncGenerator yielding batches of subscriptions
 */
export async function* getSubscriptionsBatched(
	userId: string,
	batchSize: number = DEFAULT_BATCH_SIZE
): AsyncGenerator<Subscription[], void, unknown> {
	const db = await openDatabase();
	const tx = db.transaction('subscriptions', 'readonly');
	const index = tx.store.index('by-userId');

	let cursor = await index.openCursor(userId);
	let batch: Subscription[] = [];

	while (cursor) {
		batch.push(toSubscription(cursor.value));

		if (batch.length >= batchSize) {
			// Sort batch by nextRenewal before yielding
			batch.sort((a, b) => a.nextRenewal - b.nextRenewal);
			yield batch;
			batch = [];
		}

		cursor = await cursor.continue();
	}

	// Yield remaining items
	if (batch.length > 0) {
		batch.sort((a, b) => a.nextRenewal - b.nextRenewal);
		yield batch;
	}
}

/**
 * Get all subscriptions (regardless of user)
 * @returns Array of all subscriptions
 */
export async function getAllSubscriptions(): Promise<Subscription[]> {
	const db = await openDatabase();
	const idbSubscriptions = await db.getAll('subscriptions');
	return idbSubscriptions.map(toSubscription);
}

/**
 * Delete a subscription by ID
 * @param id - Subscription ID
 */
export async function deleteSubscription(id: string): Promise<void> {
	const db = await openDatabase();
	await db.delete('subscriptions', id);
}

/**
 * Soft delete a subscription (mark for sync deletion)
 * @param id - Subscription ID
 */
export async function softDeleteSubscription(id: string): Promise<void> {
	const db = await openDatabase();
	const subscription = await db.get('subscriptions', id);
	if (subscription) {
		subscription._pendingSync = 'delete';
		await db.put('subscriptions', subscription);
	}
}

/**
 * Get subscriptions pending sync
 * @returns Array of subscriptions with pending sync operations
 */
export async function getSubscriptionsPendingSync(): Promise<IDBSubscription[]> {
	const db = await openDatabase();
	const tx = db.transaction('subscriptions', 'readonly');
	const index = tx.store.index('by-pendingSync');

	const results: IDBSubscription[] = [];

	for (const status of ['create', 'update', 'delete'] as const) {
		let cursor = await index.openCursor(status);
		while (cursor) {
			results.push(cursor.value);
			cursor = await cursor.continue();
		}
	}

	return results;
}

/**
 * Clear pending sync status for a subscription
 * @param id - Subscription ID
 */
export async function clearSubscriptionPendingSync(id: string): Promise<void> {
	const db = await openDatabase();
	const subscription = await db.get('subscriptions', id);
	if (subscription) {
		delete subscription._pendingSync;
		subscription._lastSyncedAt = Date.now();
		await db.put('subscriptions', subscription);
	}
}

/**
 * Get upcoming renewals within a date range
 * @param userId - User ID
 * @param startDate - Start date (Unix timestamp)
 * @param endDate - End date (Unix timestamp)
 * @returns Array of subscriptions with renewals in the range
 */
export async function getUpcomingRenewals(
	userId: string,
	startDate: number,
	endDate: number
): Promise<Subscription[]> {
	const db = await openDatabase();
	const tx = db.transaction('subscriptions', 'readonly');
	const index = tx.store.index('by-nextRenewal');

	const results: Subscription[] = [];
	let cursor = await index.openCursor(IDBKeyRange.bound(startDate, endDate));

	while (cursor) {
		if (cursor.value.userId === userId) {
			results.push(toSubscription(cursor.value));
		}
		cursor = await cursor.continue();
	}

	return results;
}

// ==================== BULK OPERATIONS ====================

/**
 * Get all pending sync items across all stores
 * @returns Object containing pending items from each store
 */
export async function getAllPendingSync(): Promise<{
	services: IDBService[];
	credentials: IDBCredential[];
	subscriptions: IDBSubscription[];
}> {
	const [services, credentials, subscriptions] = await Promise.all([
		getServicesPendingSync(),
		getCredentialsPendingSync(),
		getSubscriptionsPendingSync(),
	]);

	return { services, credentials, subscriptions };
}

/**
 * Clear all pending sync statuses after successful sync
 * @param serviceIds - Service IDs to clear
 * @param credentialIds - Credential IDs to clear
 * @param subscriptionIds - Subscription IDs to clear
 */
export async function clearAllPendingSync(
	serviceIds: string[],
	credentialIds: string[],
	subscriptionIds: string[]
): Promise<void> {
	await Promise.all([
		...serviceIds.map(clearServicePendingSync),
		...credentialIds.map(clearCredentialPendingSync),
		...subscriptionIds.map(clearSubscriptionPendingSync),
	]);
}

/**
 * Delete service and all its credentials (cascade delete)
 * @param serviceId - Service ID to delete
 */
export async function deleteServiceWithCredentials(serviceId: string): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction(['services', 'credentials'], 'readwrite');

	// Delete service
	await tx.objectStore('services').delete(serviceId);

	// Delete all credentials for this service
	const credentialsStore = tx.objectStore('credentials');
	const index = credentialsStore.index('by-serviceId');
	let cursor = await index.openCursor(serviceId);

	while (cursor) {
		await cursor.delete();
		cursor = await cursor.continue();
	}

	await tx.done;
}

/**
 * Load all vault data for a user
 * @param userId - User ID
 * @returns Object containing services and credentials
 */
export async function loadVaultData(userId: string): Promise<{
	services: Service[];
	credentials: Credential[];
}> {
	const services = await getServices(userId);
	const serviceIds = services.map((s) => s.id);

	// Get all credentials for all services
	const db = await openDatabase();
	const allCredentials = await db.getAll('credentials');
	const credentials = allCredentials
		.filter((c) => serviceIds.includes(c.serviceId))
		.map(toCredential)
		.sort((a, b) => a.displayOrder - b.displayOrder);

	return { services, credentials };
}

/**
 * Save complete vault data (services and credentials)
 * @param services - Services to save
 * @param credentials - Credentials to save
 */
export async function saveVaultData(
	services: Service[],
	credentials: Credential[]
): Promise<void> {
	const db = await openDatabase();
	const tx = db.transaction(['services', 'credentials'], 'readwrite');

	const servicePromises = services.map((service) => {
		const idbService: IDBService = {
			...service,
			_lastSyncedAt: Date.now(),
		};
		return tx.objectStore('services').put(idbService);
	});

	const credentialPromises = credentials.map((credential) => {
		const idbCredential: IDBCredential = {
			...credential,
			_lastSyncedAt: Date.now(),
		};
		return tx.objectStore('credentials').put(idbCredential);
	});

	await Promise.all([...servicePromises, ...credentialPromises, tx.done]);
}
