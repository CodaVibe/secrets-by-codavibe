/**
 * Sync Logic for IndexedDB
 *
 * Implements synchronization between local IndexedDB and remote server.
 *
 * Features:
 * - Track last_synced_at in metadata store
 * - Queue local changes for sync (offline support)
 * - Fetch updates from server (delta sync)
 * - Conflict resolution (server wins for now)
 * - Debounced sync to prevent excessive API calls
 *
 * Validates: AC5.3
 */

import {
	getSyncMetadata,
	updateSyncMetadata,
	type IDBService,
	type IDBCredential,
	type IDBSubscription,
} from './indexeddb';
import {
	getAllPendingSync,
	clearAllPendingSync,
	saveServices,
	saveCredentials,
	saveSubscriptions,
	deleteService,
	deleteCredential,
	deleteSubscription,
} from './crud';
import type { Service, Credential } from '$lib/stores/vault.svelte';
import type { Subscription } from '$lib/stores/subscriptions.svelte';

// Re-export types
export type { IDBService, IDBCredential, IDBSubscription } from './indexeddb';

// ==================== TYPES ====================

/**
 * Sync operation type
 */
export type SyncOperation = 'create' | 'update' | 'delete';

/**
 * Pending change item
 */
export interface PendingChange<T> {
	operation: SyncOperation;
	data: T;
	timestamp: number;
}

/**
 * Sync queue containing all pending changes
 */
export interface SyncQueue {
	services: PendingChange<IDBService>[];
	credentials: PendingChange<IDBCredential>[];
	subscriptions: PendingChange<IDBSubscription>[];
}

/**
 * Server response for sync
 */
export interface SyncResponse {
	services: Service[];
	credentials: Credential[];
	subscriptions: Subscription[];
	serverTimestamp: number;
	deletedIds: {
		services: string[];
		credentials: string[];
		subscriptions: string[];
	};
}

/**
 * Sync result
 */
export interface SyncResult {
	success: boolean;
	error?: string;
	uploaded: {
		services: number;
		credentials: number;
		subscriptions: number;
	};
	downloaded: {
		services: number;
		credentials: number;
		subscriptions: number;
	};
	deleted: {
		services: number;
		credentials: number;
		subscriptions: number;
	};
	timestamp: number;
}

/**
 * Sync status
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/**
 * API client interface for sync operations
 */
export interface SyncApiClient {
	/** Push local changes to server */
	pushChanges(queue: SyncQueue, sessionToken: string): Promise<SyncResponse>;
	/** Pull changes from server since last sync */
	pullChanges(lastSyncedAt: number | null, sessionToken: string): Promise<SyncResponse>;
	/** Check if online */
	isOnline(): boolean;
}

// ==================== SYNC STATE ====================

/** Current sync status */
let syncStatus: SyncStatus = 'idle';

/** Debounce timer for sync */
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Default debounce delay in ms */
const SYNC_DEBOUNCE_DELAY = 2000;

/** Sync listeners */
const syncListeners: Set<(status: SyncStatus) => void> = new Set();

// ==================== SYNC STATUS MANAGEMENT ====================

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
	return syncStatus;
}

/**
 * Subscribe to sync status changes
 * @param listener - Callback function
 * @returns Unsubscribe function
 */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
	syncListeners.add(listener);
	return () => syncListeners.delete(listener);
}

/**
 * Update sync status and notify listeners
 */
function setSyncStatus(status: SyncStatus): void {
	syncStatus = status;
	syncListeners.forEach((listener) => listener(status));
}

// ==================== OFFLINE DETECTION ====================

/**
 * Check if browser is online
 */
export function isOnline(): boolean {
	return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Setup online/offline event listeners
 */
export function setupOnlineListeners(onOnline?: () => void, onOffline?: () => void): () => void {
	const handleOnline = () => {
		setSyncStatus('idle');
		onOnline?.();
	};

	const handleOffline = () => {
		setSyncStatus('offline');
		onOffline?.();
	};

	if (typeof window !== 'undefined') {
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Set initial status
		if (!navigator.onLine) {
			setSyncStatus('offline');
		}

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	}

	return () => {};
}

// ==================== SYNC QUEUE MANAGEMENT ====================

/**
 * Get all pending changes as a sync queue
 */
export async function getSyncQueue(): Promise<SyncQueue> {
	const pending = await getAllPendingSync();

	return {
		services: pending.services.map((s) => ({
			operation: s._pendingSync as SyncOperation,
			data: s,
			timestamp: s._lastSyncedAt ?? Date.now(),
		})),
		credentials: pending.credentials.map((c) => ({
			operation: c._pendingSync as SyncOperation,
			data: c,
			timestamp: c._lastSyncedAt ?? Date.now(),
		})),
		subscriptions: pending.subscriptions.map((s) => ({
			operation: s._pendingSync as SyncOperation,
			data: s,
			timestamp: s._lastSyncedAt ?? Date.now(),
		})),
	};
}

/**
 * Check if there are pending changes
 */
export async function hasPendingChanges(): Promise<boolean> {
	const queue = await getSyncQueue();
	return (
		queue.services.length > 0 ||
		queue.credentials.length > 0 ||
		queue.subscriptions.length > 0
	);
}

/**
 * Get count of pending changes
 */
export async function getPendingChangesCount(): Promise<number> {
	const queue = await getSyncQueue();
	return queue.services.length + queue.credentials.length + queue.subscriptions.length;
}

// ==================== SYNC TO SERVER ====================

/**
 * Push local changes to server
 * @param apiClient - API client for server communication
 * @param sessionToken - User session token
 */
export async function syncToServer(
	apiClient: SyncApiClient,
	sessionToken: string
): Promise<SyncResult> {
	const startTime = Date.now();

	// Check if online
	if (!apiClient.isOnline()) {
		return {
			success: false,
			error: 'Offline - changes queued for later sync',
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}

	// Check if already syncing
	const metadata = await getSyncMetadata();
	if (metadata.syncInProgress) {
		return {
			success: false,
			error: 'Sync already in progress',
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}

	// Get pending changes
	const queue = await getSyncQueue();
	const hasChanges =
		queue.services.length > 0 ||
		queue.credentials.length > 0 ||
		queue.subscriptions.length > 0;

	if (!hasChanges) {
		return {
			success: true,
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}

	try {
		// Mark sync in progress
		await updateSyncMetadata({ syncInProgress: true });
		setSyncStatus('syncing');

		// Push changes to server
		const response = await apiClient.pushChanges(queue, sessionToken);

		// Clear pending sync flags for successfully synced items
		const serviceIds = queue.services.map((s) => s.data.id);
		const credentialIds = queue.credentials.map((c) => c.data.id);
		const subscriptionIds = queue.subscriptions.map((s) => s.data.id);

		await clearAllPendingSync(serviceIds, credentialIds, subscriptionIds);

		// Update last synced timestamp
		await updateSyncMetadata({
			lastSyncedAt: response.serverTimestamp,
			syncInProgress: false,
		});

		setSyncStatus('idle');

		return {
			success: true,
			uploaded: {
				services: queue.services.length,
				credentials: queue.credentials.length,
				subscriptions: queue.subscriptions.length,
			},
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: response.serverTimestamp,
		};
	} catch (error) {
		await updateSyncMetadata({ syncInProgress: false });
		setSyncStatus('error');

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown sync error',
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}
}

// ==================== SYNC FROM SERVER ====================

/**
 * Pull changes from server
 * @param apiClient - API client for server communication
 * @param sessionToken - User session token
 * @param userId - Current user ID
 */
export async function syncFromServer(
	apiClient: SyncApiClient,
	sessionToken: string,
	userId: string
): Promise<SyncResult> {
	const startTime = Date.now();

	// Check if online
	if (!apiClient.isOnline()) {
		return {
			success: false,
			error: 'Offline - will sync when online',
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}

	// Check if already syncing
	const metadata = await getSyncMetadata();
	if (metadata.syncInProgress) {
		return {
			success: false,
			error: 'Sync already in progress',
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}

	try {
		// Mark sync in progress
		await updateSyncMetadata({ syncInProgress: true });
		setSyncStatus('syncing');

		// Pull changes from server
		const response = await apiClient.pullChanges(metadata.lastSyncedAt, sessionToken);

		// Apply downloaded changes
		if (response.services.length > 0) {
			await saveServices(response.services);
		}

		if (response.credentials.length > 0) {
			await saveCredentials(response.credentials);
		}

		if (response.subscriptions.length > 0) {
			await saveSubscriptions(response.subscriptions);
		}

		// Handle deletions
		for (const id of response.deletedIds.services) {
			await deleteService(id);
		}

		for (const id of response.deletedIds.credentials) {
			await deleteCredential(id);
		}

		for (const id of response.deletedIds.subscriptions) {
			await deleteSubscription(id);
		}

		// Update last synced timestamp
		await updateSyncMetadata({
			lastSyncedAt: response.serverTimestamp,
			userId,
			syncInProgress: false,
		});

		setSyncStatus('idle');

		return {
			success: true,
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: {
				services: response.services.length,
				credentials: response.credentials.length,
				subscriptions: response.subscriptions.length,
			},
			deleted: {
				services: response.deletedIds.services.length,
				credentials: response.deletedIds.credentials.length,
				subscriptions: response.deletedIds.subscriptions.length,
			},
			timestamp: response.serverTimestamp,
		};
	} catch (error) {
		await updateSyncMetadata({ syncInProgress: false });
		setSyncStatus('error');

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown sync error',
			uploaded: { services: 0, credentials: 0, subscriptions: 0 },
			downloaded: { services: 0, credentials: 0, subscriptions: 0 },
			deleted: { services: 0, credentials: 0, subscriptions: 0 },
			timestamp: startTime,
		};
	}
}

// ==================== FULL SYNC ====================

/**
 * Perform full bidirectional sync
 * @param apiClient - API client for server communication
 * @param sessionToken - User session token
 * @param userId - Current user ID
 */
export async function fullSync(
	apiClient: SyncApiClient,
	sessionToken: string,
	userId: string
): Promise<SyncResult> {
	const startTime = Date.now();

	// First push local changes
	const pushResult = await syncToServer(apiClient, sessionToken);
	if (!pushResult.success && pushResult.error !== 'Offline - changes queued for later sync') {
		return pushResult;
	}

	// Then pull server changes
	const pullResult = await syncFromServer(apiClient, sessionToken, userId);
	if (!pullResult.success) {
		return pullResult;
	}

	return {
		success: true,
		uploaded: pushResult.uploaded,
		downloaded: pullResult.downloaded,
		deleted: pullResult.deleted,
		timestamp: pullResult.timestamp || startTime,
	};
}

// ==================== DEBOUNCED SYNC ====================

/**
 * Schedule a debounced sync
 * @param apiClient - API client for server communication
 * @param sessionToken - User session token
 * @param userId - Current user ID
 * @param delay - Debounce delay in ms (default: 2000)
 */
export function scheduleDebouncedSync(
	apiClient: SyncApiClient,
	sessionToken: string,
	userId: string,
	delay: number = SYNC_DEBOUNCE_DELAY
): void {
	// Clear existing timer
	if (syncDebounceTimer) {
		clearTimeout(syncDebounceTimer);
	}

	// Schedule new sync
	syncDebounceTimer = setTimeout(async () => {
		syncDebounceTimer = null;
		await fullSync(apiClient, sessionToken, userId);
	}, delay);
}

/**
 * Cancel any pending debounced sync
 */
export function cancelDebouncedSync(): void {
	if (syncDebounceTimer) {
		clearTimeout(syncDebounceTimer);
		syncDebounceTimer = null;
	}
}

// ==================== SYNC HELPERS ====================

/**
 * Get last sync timestamp
 */
export async function getLastSyncedAt(): Promise<number | null> {
	const metadata = await getSyncMetadata();
	return metadata.lastSyncedAt;
}

/**
 * Check if initial sync is needed
 */
export async function needsInitialSync(): Promise<boolean> {
	const metadata = await getSyncMetadata();
	return metadata.lastSyncedAt === null;
}

/**
 * Reset sync state (for logout)
 */
export async function resetSyncState(): Promise<void> {
	cancelDebouncedSync();
	await updateSyncMetadata({
		lastSyncedAt: null,
		userId: null,
		syncInProgress: false,
	});
	setSyncStatus('idle');
}

/**
 * Force unlock sync (in case of stuck sync)
 */
export async function forceUnlockSync(): Promise<void> {
	await updateSyncMetadata({ syncInProgress: false });
	setSyncStatus('idle');
}

// ==================== MOCK API CLIENT ====================

/**
 * Create a mock API client for testing
 */
export function createMockApiClient(options?: {
	simulateOffline?: boolean;
	simulateError?: boolean;
	errorMessage?: string;
	responseDelay?: number;
}): SyncApiClient {
	const { simulateOffline = false, simulateError = false, errorMessage = 'Mock error', responseDelay = 0 } = options ?? {};

	return {
		isOnline: () => !simulateOffline && isOnline(),

		async pushChanges(queue: SyncQueue, sessionToken: string): Promise<SyncResponse> {
			if (responseDelay > 0) {
				await new Promise((resolve) => setTimeout(resolve, responseDelay));
			}

			if (simulateError) {
				throw new Error(errorMessage);
			}

			return {
				services: [],
				credentials: [],
				subscriptions: [],
				serverTimestamp: Date.now(),
				deletedIds: {
					services: [],
					credentials: [],
					subscriptions: [],
				},
			};
		},

		async pullChanges(lastSyncedAt: number | null, sessionToken: string): Promise<SyncResponse> {
			if (responseDelay > 0) {
				await new Promise((resolve) => setTimeout(resolve, responseDelay));
			}

			if (simulateError) {
				throw new Error(errorMessage);
			}

			return {
				services: [],
				credentials: [],
				subscriptions: [],
				serverTimestamp: Date.now(),
				deletedIds: {
					services: [],
					credentials: [],
					subscriptions: [],
				},
			};
		},
	};
}
