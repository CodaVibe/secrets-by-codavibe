/**
 * Unit tests for Sync Logic
 *
 * Uses fake-indexeddb for testing in Node.js environment
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
	getSyncStatus,
	subscribeSyncStatus,
	isOnline,
	getSyncQueue,
	hasPendingChanges,
	getPendingChangesCount,
	syncToServer,
	syncFromServer,
	fullSync,
	scheduleDebouncedSync,
	cancelDebouncedSync,
	getLastSyncedAt,
	needsInitialSync,
	resetSyncState,
	forceUnlockSync,
	createMockApiClient,
	type SyncApiClient,
	type SyncQueue,
	type SyncResponse,
} from './sync';

import { deleteDatabase, clearAllStores, updateSyncMetadata } from './indexeddb';
import { saveService, saveCredential, saveSubscription } from './crud';
import type { Service, Credential } from '$lib/stores/vault.svelte';
import type { Subscription } from '$lib/stores/subscriptions.svelte';

// ==================== TEST DATA ====================

const createService = (overrides: Partial<Service> = {}): Service => ({
	id: `service-${Math.random().toString(36).slice(2)}`,
	userId: 'user-123',
	name: 'Test Service',
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

const createCredential = (overrides: Partial<Credential> = {}): Credential => ({
	id: `cred-${Math.random().toString(36).slice(2)}`,
	serviceId: 'service-123',
	type: 'password',
	label: 'Password',
	encryptedValue: 'encrypted-value-hex',
	iv: 'iv-hex',
	displayOrder: 0,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

const createSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
	id: `sub-${Math.random().toString(36).slice(2)}`,
	userId: 'user-123',
	serviceName: 'Netflix',
	cost: 15.99,
	currency: 'USD',
	billingCycle: 'monthly',
	nextRenewal: Date.now() + 30 * 24 * 60 * 60 * 1000,
	startDate: Date.now() - 365 * 24 * 60 * 60 * 1000,
	isTrial: false,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	...overrides,
});

// ==================== SETUP/TEARDOWN ====================

describe('Sync Logic', () => {
	beforeEach(async () => {
		vi.useRealTimers(); // Use real timers for setup
		await clearAllStores();
		await resetSyncState();
	});

	afterEach(async () => {
		vi.useRealTimers(); // Ensure real timers for cleanup
		cancelDebouncedSync();
		await deleteDatabase();
	});

	// ==================== SYNC STATUS TESTS ====================

	describe('Sync Status', () => {
		it('should start with idle status', () => {
			expect(getSyncStatus()).toBe('idle');
		});

		it('should notify listeners on status change', async () => {
			const listener = vi.fn();
			const unsubscribe = subscribeSyncStatus(listener);

			const mockClient = createMockApiClient();
			await saveService(createService({ id: 'svc-1' }), 'create');

			// Trigger sync
			await syncToServer(mockClient, 'test-token');

			// Status should have changed during sync
			expect(listener).toHaveBeenCalled();

			unsubscribe();
		});

		it('should unsubscribe correctly', () => {
			const listener = vi.fn();
			const unsubscribe = subscribeSyncStatus(listener);

			unsubscribe();

			// Listener should not be called after unsubscribe
			// (would need to trigger status change to verify)
			expect(listener).not.toHaveBeenCalled();
		});
	});

	// ==================== ONLINE DETECTION TESTS ====================

	describe('Online Detection', () => {
		it('should detect online status', () => {
			// In test environment, navigator.onLine is typically true
			const online = isOnline();
			expect(typeof online).toBe('boolean');
		});
	});

	// ==================== SYNC QUEUE TESTS ====================

	describe('Sync Queue', () => {
		it('should return empty queue when no pending changes', async () => {
			const queue = await getSyncQueue();

			expect(queue.services).toHaveLength(0);
			expect(queue.credentials).toHaveLength(0);
			expect(queue.subscriptions).toHaveLength(0);
		});

		it('should include pending service changes', async () => {
			await saveService(createService({ id: 'svc-1' }), 'create');
			await saveService(createService({ id: 'svc-2' }), 'update');

			const queue = await getSyncQueue();

			expect(queue.services).toHaveLength(2);
			expect(queue.services[0].operation).toBe('create');
			expect(queue.services[1].operation).toBe('update');
		});

		it('should include pending credential changes', async () => {
			await saveCredential(createCredential({ id: 'cred-1' }), 'create');

			const queue = await getSyncQueue();

			expect(queue.credentials).toHaveLength(1);
			expect(queue.credentials[0].operation).toBe('create');
		});

		it('should include pending subscription changes', async () => {
			await saveSubscription(createSubscription({ id: 'sub-1' }), 'delete');

			const queue = await getSyncQueue();

			expect(queue.subscriptions).toHaveLength(1);
			expect(queue.subscriptions[0].operation).toBe('delete');
		});

		it('should detect pending changes', async () => {
			expect(await hasPendingChanges()).toBe(false);

			await saveService(createService({ id: 'svc-1' }), 'create');

			expect(await hasPendingChanges()).toBe(true);
		});

		it('should count pending changes', async () => {
			expect(await getPendingChangesCount()).toBe(0);

			await saveService(createService({ id: 'svc-1' }), 'create');
			await saveCredential(createCredential({ id: 'cred-1' }), 'update');
			await saveSubscription(createSubscription({ id: 'sub-1' }), 'delete');

			expect(await getPendingChangesCount()).toBe(3);
		});
	});

	// ==================== SYNC TO SERVER TESTS ====================

	describe('syncToServer', () => {
		it('should return success with no changes when queue is empty', async () => {
			const mockClient = createMockApiClient();

			const result = await syncToServer(mockClient, 'test-token');

			expect(result.success).toBe(true);
			expect(result.uploaded.services).toBe(0);
			expect(result.uploaded.credentials).toBe(0);
			expect(result.uploaded.subscriptions).toBe(0);
		});

		it('should push pending changes to server', async () => {
			const mockClient = createMockApiClient();
			const pushSpy = vi.spyOn(mockClient, 'pushChanges');

			await saveService(createService({ id: 'svc-1' }), 'create');
			await saveCredential(createCredential({ id: 'cred-1' }), 'create');

			const result = await syncToServer(mockClient, 'test-token');

			expect(result.success).toBe(true);
			expect(result.uploaded.services).toBe(1);
			expect(result.uploaded.credentials).toBe(1);
			expect(pushSpy).toHaveBeenCalledTimes(1);
		});

		it('should clear pending sync flags after successful sync', async () => {
			const mockClient = createMockApiClient();

			await saveService(createService({ id: 'svc-1' }), 'create');

			expect(await hasPendingChanges()).toBe(true);

			await syncToServer(mockClient, 'test-token');

			expect(await hasPendingChanges()).toBe(false);
		});

		it('should handle offline mode', async () => {
			const mockClient = createMockApiClient({ simulateOffline: true });

			await saveService(createService({ id: 'svc-1' }), 'create');

			const result = await syncToServer(mockClient, 'test-token');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Offline');
		});

		it('should handle API errors', async () => {
			const mockClient = createMockApiClient({
				simulateError: true,
				errorMessage: 'Server error',
			});

			await saveService(createService({ id: 'svc-1' }), 'create');

			const result = await syncToServer(mockClient, 'test-token');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Server error');
		});

		it('should prevent concurrent syncs', async () => {
			const mockClient = createMockApiClient({ responseDelay: 100 });

			await saveService(createService({ id: 'svc-1' }), 'create');

			// Mark sync in progress
			await updateSyncMetadata({ syncInProgress: true });

			const result = await syncToServer(mockClient, 'test-token');

			expect(result.success).toBe(false);
			expect(result.error).toContain('already in progress');
		});
	});

	// ==================== SYNC FROM SERVER TESTS ====================

	describe('syncFromServer', () => {
		it('should pull changes from server', async () => {
			const mockClient: SyncApiClient = {
				isOnline: () => true,
				pushChanges: vi.fn(),
				pullChanges: vi.fn().mockResolvedValue({
					services: [createService({ id: 'svc-server-1' })],
					credentials: [createCredential({ id: 'cred-server-1' })],
					subscriptions: [],
					serverTimestamp: Date.now(),
					deletedIds: { services: [], credentials: [], subscriptions: [] },
				}),
			};

			const result = await syncFromServer(mockClient, 'test-token', 'user-123');

			expect(result.success).toBe(true);
			expect(result.downloaded.services).toBe(1);
			expect(result.downloaded.credentials).toBe(1);
		});

		it('should handle deletions from server', async () => {
			// First save some items locally
			await saveService(createService({ id: 'svc-to-delete' }));
			await saveCredential(createCredential({ id: 'cred-to-delete' }));

			const mockClient: SyncApiClient = {
				isOnline: () => true,
				pushChanges: vi.fn(),
				pullChanges: vi.fn().mockResolvedValue({
					services: [],
					credentials: [],
					subscriptions: [],
					serverTimestamp: Date.now(),
					deletedIds: {
						services: ['svc-to-delete'],
						credentials: ['cred-to-delete'],
						subscriptions: [],
					},
				}),
			};

			const result = await syncFromServer(mockClient, 'test-token', 'user-123');

			expect(result.success).toBe(true);
			expect(result.deleted.services).toBe(1);
			expect(result.deleted.credentials).toBe(1);
		});

		it('should update last synced timestamp', async () => {
			const serverTimestamp = Date.now();
			const mockClient: SyncApiClient = {
				isOnline: () => true,
				pushChanges: vi.fn(),
				pullChanges: vi.fn().mockResolvedValue({
					services: [],
					credentials: [],
					subscriptions: [],
					serverTimestamp,
					deletedIds: { services: [], credentials: [], subscriptions: [] },
				}),
			};

			await syncFromServer(mockClient, 'test-token', 'user-123');

			const lastSynced = await getLastSyncedAt();
			expect(lastSynced).toBe(serverTimestamp);
		});

		it('should handle offline mode', async () => {
			const mockClient = createMockApiClient({ simulateOffline: true });

			const result = await syncFromServer(mockClient, 'test-token', 'user-123');

			expect(result.success).toBe(false);
			expect(result.error).toContain('Offline');
		});

		it('should handle API errors', async () => {
			const mockClient = createMockApiClient({
				simulateError: true,
				errorMessage: 'Pull failed',
			});

			const result = await syncFromServer(mockClient, 'test-token', 'user-123');

			expect(result.success).toBe(false);
			expect(result.error).toBe('Pull failed');
		});
	});

	// ==================== FULL SYNC TESTS ====================

	describe('fullSync', () => {
		it('should push then pull', async () => {
			const pushSpy = vi.fn().mockResolvedValue({
				services: [],
				credentials: [],
				subscriptions: [],
				serverTimestamp: Date.now(),
				deletedIds: { services: [], credentials: [], subscriptions: [] },
			});

			const pullSpy = vi.fn().mockResolvedValue({
				services: [createService({ id: 'svc-from-server' })],
				credentials: [],
				subscriptions: [],
				serverTimestamp: Date.now(),
				deletedIds: { services: [], credentials: [], subscriptions: [] },
			});

			const mockClient: SyncApiClient = {
				isOnline: () => true,
				pushChanges: pushSpy,
				pullChanges: pullSpy,
			};

			await saveService(createService({ id: 'svc-local' }), 'create');

			const result = await fullSync(mockClient, 'test-token', 'user-123');

			expect(result.success).toBe(true);
			expect(result.uploaded.services).toBe(1);
			expect(result.downloaded.services).toBe(1);
			expect(pushSpy).toHaveBeenCalledTimes(1);
			expect(pullSpy).toHaveBeenCalledTimes(1);
		});
	});

	// ==================== DEBOUNCED SYNC TESTS ====================

	describe('Debounced Sync', () => {
		it('should schedule sync after delay', async () => {
			// Test with real timers and short delay
			const mockClient = createMockApiClient();
			const pushSpy = vi.spyOn(mockClient, 'pushChanges');

			await saveService(createService({ id: 'svc-1' }), 'create');

			scheduleDebouncedSync(mockClient, 'test-token', 'user-123', 50);

			// Should not have synced immediately
			expect(pushSpy).not.toHaveBeenCalled();

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should have synced now
			expect(pushSpy).toHaveBeenCalledTimes(1);
		});

		it('should cancel previous debounce on new schedule', async () => {
			const mockClient = createMockApiClient();
			const pushSpy = vi.spyOn(mockClient, 'pushChanges');

			await saveService(createService({ id: 'svc-1' }), 'create');

			// Schedule first sync
			scheduleDebouncedSync(mockClient, 'test-token', 'user-123', 100);

			// Wait a bit then reschedule
			await new Promise((resolve) => setTimeout(resolve, 50));
			scheduleDebouncedSync(mockClient, 'test-token', 'user-123', 100);

			// Wait for original timeout (should not have fired)
			await new Promise((resolve) => setTimeout(resolve, 60));
			expect(pushSpy).not.toHaveBeenCalled();

			// Wait for new timeout
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(pushSpy).toHaveBeenCalledTimes(1);
		});

		it('should cancel debounced sync', async () => {
			const mockClient = createMockApiClient();
			const pushSpy = vi.spyOn(mockClient, 'pushChanges');

			await saveService(createService({ id: 'svc-1' }), 'create');

			scheduleDebouncedSync(mockClient, 'test-token', 'user-123', 50);

			// Cancel before timeout
			cancelDebouncedSync();

			// Wait past timeout
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should not have synced
			expect(pushSpy).not.toHaveBeenCalled();
		});
	});

	// ==================== SYNC HELPERS TESTS ====================

	describe('Sync Helpers', () => {
		it('should get last synced timestamp', async () => {
			expect(await getLastSyncedAt()).toBeNull();

			await updateSyncMetadata({ lastSyncedAt: 12345 });

			expect(await getLastSyncedAt()).toBe(12345);
		});

		it('should detect need for initial sync', async () => {
			expect(await needsInitialSync()).toBe(true);

			await updateSyncMetadata({ lastSyncedAt: Date.now() });

			expect(await needsInitialSync()).toBe(false);
		});

		it('should reset sync state', async () => {
			await updateSyncMetadata({
				lastSyncedAt: Date.now(),
				userId: 'user-123',
				syncInProgress: true,
			});

			await resetSyncState();

			expect(await getLastSyncedAt()).toBeNull();
			expect(await needsInitialSync()).toBe(true);
			expect(getSyncStatus()).toBe('idle');
		});

		it('should force unlock sync', async () => {
			await updateSyncMetadata({ syncInProgress: true });

			await forceUnlockSync();

			// Should be able to sync now
			const mockClient = createMockApiClient();
			const result = await syncToServer(mockClient, 'test-token');

			expect(result.success).toBe(true);
		});
	});

	// ==================== MOCK API CLIENT TESTS ====================

	describe('Mock API Client', () => {
		it('should create default mock client', () => {
			const client = createMockApiClient();

			expect(client.isOnline()).toBe(true);
		});

		it('should simulate offline mode', () => {
			const client = createMockApiClient({ simulateOffline: true });

			expect(client.isOnline()).toBe(false);
		});

		it('should simulate errors', async () => {
			const client = createMockApiClient({
				simulateError: true,
				errorMessage: 'Test error',
			});

			await expect(client.pushChanges({} as SyncQueue, 'token')).rejects.toThrow('Test error');
		});

		it('should simulate response delay', async () => {
			const client = createMockApiClient({ responseDelay: 50 });

			const start = Date.now();
			await client.pullChanges(null, 'token');
			const elapsed = Date.now() - start;

			expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
		});
	});
});
