/**
 * Unit tests for IndexedDB CRUD Operations
 *
 * Uses fake-indexeddb for testing in Node.js environment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

import {
	saveService,
	saveServices,
	getService,
	getServices,
	getServicesBatched,
	getAllServices,
	deleteService,
	softDeleteService,
	getServicesPendingSync,
	clearServicePendingSync,
	saveCredential,
	saveCredentials,
	getCredential,
	getCredentials,
	getCredentialsBatched,
	getAllCredentials,
	deleteCredential,
	softDeleteCredential,
	deleteCredentialsByService,
	getCredentialsPendingSync,
	clearCredentialPendingSync,
	saveSubscription,
	saveSubscriptions,
	getSubscription,
	getSubscriptions,
	getSubscriptionsBatched,
	getAllSubscriptions,
	deleteSubscription,
	softDeleteSubscription,
	getSubscriptionsPendingSync,
	clearSubscriptionPendingSync,
	getUpcomingRenewals,
	getAllPendingSync,
	clearAllPendingSync,
	deleteServiceWithCredentials,
	loadVaultData,
	saveVaultData,
	DEFAULT_BATCH_SIZE,
} from './crud';

import { deleteDatabase, clearAllStores } from './indexeddb';
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

describe('IndexedDB CRUD Operations', () => {
	beforeEach(async () => {
		await clearAllStores();
	});

	afterEach(async () => {
		await deleteDatabase();
	});

	// ==================== SERVICES TESTS ====================

	describe('Services CRUD', () => {
		it('should save and retrieve a service', async () => {
			const service = createService({ id: 'svc-1', name: 'GitHub' });

			await saveService(service);
			const retrieved = await getService('svc-1');

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe('svc-1');
			expect(retrieved?.name).toBe('GitHub');
		});

		it('should save multiple services in a transaction', async () => {
			const services = [
				createService({ id: 'svc-1', name: 'GitHub' }),
				createService({ id: 'svc-2', name: 'GitLab' }),
				createService({ id: 'svc-3', name: 'Bitbucket' }),
			];

			await saveServices(services);
			const all = await getAllServices();

			expect(all).toHaveLength(3);
		});

		it('should get services by userId', async () => {
			await saveServices([
				createService({ id: 'svc-1', userId: 'user-1' }),
				createService({ id: 'svc-2', userId: 'user-1' }),
				createService({ id: 'svc-3', userId: 'user-2' }),
			]);

			const user1Services = await getServices('user-1');
			const user2Services = await getServices('user-2');

			expect(user1Services).toHaveLength(2);
			expect(user2Services).toHaveLength(1);
		});

		it('should delete a service', async () => {
			const service = createService({ id: 'svc-1' });
			await saveService(service);

			await deleteService('svc-1');
			const retrieved = await getService('svc-1');

			expect(retrieved).toBeUndefined();
		});

		it('should soft delete a service', async () => {
			const service = createService({ id: 'svc-1' });
			await saveService(service);

			await softDeleteService('svc-1');
			const pending = await getServicesPendingSync();

			expect(pending).toHaveLength(1);
			expect(pending[0]._pendingSync).toBe('delete');
		});

		it('should track pending sync status', async () => {
			await saveService(createService({ id: 'svc-1' }), 'create');
			await saveService(createService({ id: 'svc-2' }), 'update');

			const pending = await getServicesPendingSync();

			expect(pending).toHaveLength(2);
			expect(pending.map((s) => s._pendingSync)).toContain('create');
			expect(pending.map((s) => s._pendingSync)).toContain('update');
		});

		it('should clear pending sync status', async () => {
			await saveService(createService({ id: 'svc-1' }), 'create');

			await clearServicePendingSync('svc-1');
			const pending = await getServicesPendingSync();

			expect(pending).toHaveLength(0);
		});

		it('should batch read services', async () => {
			// Create 25 services
			const services = Array.from({ length: 25 }, (_, i) =>
				createService({ id: `svc-${i}`, userId: 'user-1' })
			);
			await saveServices(services);

			const batches: Service[][] = [];
			for await (const batch of getServicesBatched('user-1', 10)) {
				batches.push(batch);
			}

			expect(batches).toHaveLength(3); // 10 + 10 + 5
			expect(batches[0]).toHaveLength(10);
			expect(batches[1]).toHaveLength(10);
			expect(batches[2]).toHaveLength(5);
		});
	});

	// ==================== CREDENTIALS TESTS ====================

	describe('Credentials CRUD', () => {
		it('should save and retrieve a credential', async () => {
			const credential = createCredential({ id: 'cred-1', label: 'Username' });

			await saveCredential(credential);
			const retrieved = await getCredential('cred-1');

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe('cred-1');
			expect(retrieved?.label).toBe('Username');
		});

		it('should save multiple credentials in a transaction', async () => {
			const credentials = [
				createCredential({ id: 'cred-1' }),
				createCredential({ id: 'cred-2' }),
				createCredential({ id: 'cred-3' }),
			];

			await saveCredentials(credentials);
			const all = await getAllCredentials();

			expect(all).toHaveLength(3);
		});

		it('should get credentials by serviceId sorted by displayOrder', async () => {
			await saveCredentials([
				createCredential({ id: 'cred-1', serviceId: 'svc-1', displayOrder: 2 }),
				createCredential({ id: 'cred-2', serviceId: 'svc-1', displayOrder: 0 }),
				createCredential({ id: 'cred-3', serviceId: 'svc-1', displayOrder: 1 }),
				createCredential({ id: 'cred-4', serviceId: 'svc-2', displayOrder: 0 }),
			]);

			const svc1Creds = await getCredentials('svc-1');

			expect(svc1Creds).toHaveLength(3);
			expect(svc1Creds[0].id).toBe('cred-2'); // displayOrder 0
			expect(svc1Creds[1].id).toBe('cred-3'); // displayOrder 1
			expect(svc1Creds[2].id).toBe('cred-1'); // displayOrder 2
		});

		it('should delete a credential', async () => {
			await saveCredential(createCredential({ id: 'cred-1' }));

			await deleteCredential('cred-1');
			const retrieved = await getCredential('cred-1');

			expect(retrieved).toBeUndefined();
		});

		it('should soft delete a credential', async () => {
			await saveCredential(createCredential({ id: 'cred-1' }));

			await softDeleteCredential('cred-1');
			const pending = await getCredentialsPendingSync();

			expect(pending).toHaveLength(1);
			expect(pending[0]._pendingSync).toBe('delete');
		});

		it('should delete all credentials for a service', async () => {
			await saveCredentials([
				createCredential({ id: 'cred-1', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-2', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-3', serviceId: 'svc-2' }),
			]);

			await deleteCredentialsByService('svc-1');

			const svc1Creds = await getCredentials('svc-1');
			const svc2Creds = await getCredentials('svc-2');

			expect(svc1Creds).toHaveLength(0);
			expect(svc2Creds).toHaveLength(1);
		});

		it('should track pending sync status', async () => {
			await saveCredential(createCredential({ id: 'cred-1' }), 'create');

			const pending = await getCredentialsPendingSync();

			expect(pending).toHaveLength(1);
			expect(pending[0]._pendingSync).toBe('create');
		});

		it('should clear pending sync status', async () => {
			await saveCredential(createCredential({ id: 'cred-1' }), 'update');

			await clearCredentialPendingSync('cred-1');
			const pending = await getCredentialsPendingSync();

			expect(pending).toHaveLength(0);
		});

		it('should batch read credentials', async () => {
			const credentials = Array.from({ length: 25 }, (_, i) =>
				createCredential({ id: `cred-${i}`, serviceId: 'svc-1', displayOrder: i })
			);
			await saveCredentials(credentials);

			const batches: Credential[][] = [];
			for await (const batch of getCredentialsBatched('svc-1', 10)) {
				batches.push(batch);
			}

			expect(batches).toHaveLength(3);
		});
	});

	// ==================== SUBSCRIPTIONS TESTS ====================

	describe('Subscriptions CRUD', () => {
		it('should save and retrieve a subscription', async () => {
			const subscription = createSubscription({ id: 'sub-1', serviceName: 'Spotify' });

			await saveSubscription(subscription);
			const retrieved = await getSubscription('sub-1');

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe('sub-1');
			expect(retrieved?.serviceName).toBe('Spotify');
		});

		it('should save multiple subscriptions in a transaction', async () => {
			const subscriptions = [
				createSubscription({ id: 'sub-1' }),
				createSubscription({ id: 'sub-2' }),
				createSubscription({ id: 'sub-3' }),
			];

			await saveSubscriptions(subscriptions);
			const all = await getAllSubscriptions();

			expect(all).toHaveLength(3);
		});

		it('should get subscriptions by userId sorted by nextRenewal', async () => {
			const now = Date.now();
			await saveSubscriptions([
				createSubscription({ id: 'sub-1', userId: 'user-1', nextRenewal: now + 30000 }),
				createSubscription({ id: 'sub-2', userId: 'user-1', nextRenewal: now + 10000 }),
				createSubscription({ id: 'sub-3', userId: 'user-1', nextRenewal: now + 20000 }),
				createSubscription({ id: 'sub-4', userId: 'user-2', nextRenewal: now }),
			]);

			const user1Subs = await getSubscriptions('user-1');

			expect(user1Subs).toHaveLength(3);
			expect(user1Subs[0].id).toBe('sub-2'); // earliest renewal
			expect(user1Subs[1].id).toBe('sub-3');
			expect(user1Subs[2].id).toBe('sub-1'); // latest renewal
		});

		it('should delete a subscription', async () => {
			await saveSubscription(createSubscription({ id: 'sub-1' }));

			await deleteSubscription('sub-1');
			const retrieved = await getSubscription('sub-1');

			expect(retrieved).toBeUndefined();
		});

		it('should soft delete a subscription', async () => {
			await saveSubscription(createSubscription({ id: 'sub-1' }));

			await softDeleteSubscription('sub-1');
			const pending = await getSubscriptionsPendingSync();

			expect(pending).toHaveLength(1);
			expect(pending[0]._pendingSync).toBe('delete');
		});

		it('should track pending sync status', async () => {
			await saveSubscription(createSubscription({ id: 'sub-1' }), 'create');

			const pending = await getSubscriptionsPendingSync();

			expect(pending).toHaveLength(1);
			expect(pending[0]._pendingSync).toBe('create');
		});

		it('should clear pending sync status', async () => {
			await saveSubscription(createSubscription({ id: 'sub-1' }), 'update');

			await clearSubscriptionPendingSync('sub-1');
			const pending = await getSubscriptionsPendingSync();

			expect(pending).toHaveLength(0);
		});

		it('should get upcoming renewals within date range', async () => {
			const now = Date.now();
			const day = 24 * 60 * 60 * 1000;

			await saveSubscriptions([
				createSubscription({ id: 'sub-1', userId: 'user-1', nextRenewal: now + 5 * day }),
				createSubscription({ id: 'sub-2', userId: 'user-1', nextRenewal: now + 15 * day }),
				createSubscription({ id: 'sub-3', userId: 'user-1', nextRenewal: now + 45 * day }),
				createSubscription({ id: 'sub-4', userId: 'user-2', nextRenewal: now + 10 * day }),
			]);

			const upcoming = await getUpcomingRenewals('user-1', now, now + 30 * day);

			expect(upcoming).toHaveLength(2);
			expect(upcoming.map((s) => s.id)).toContain('sub-1');
			expect(upcoming.map((s) => s.id)).toContain('sub-2');
		});

		it('should batch read subscriptions', async () => {
			const subscriptions = Array.from({ length: 25 }, (_, i) =>
				createSubscription({ id: `sub-${i}`, userId: 'user-1', nextRenewal: Date.now() + i * 1000 })
			);
			await saveSubscriptions(subscriptions);

			const batches: Subscription[][] = [];
			for await (const batch of getSubscriptionsBatched('user-1', 10)) {
				batches.push(batch);
			}

			expect(batches).toHaveLength(3);
		});
	});

	// ==================== BULK OPERATIONS TESTS ====================

	describe('Bulk Operations', () => {
		it('should get all pending sync items', async () => {
			await saveService(createService({ id: 'svc-1' }), 'create');
			await saveCredential(createCredential({ id: 'cred-1' }), 'update');
			await saveSubscription(createSubscription({ id: 'sub-1' }), 'delete');

			const pending = await getAllPendingSync();

			expect(pending.services).toHaveLength(1);
			expect(pending.credentials).toHaveLength(1);
			expect(pending.subscriptions).toHaveLength(1);
		});

		it('should clear all pending sync statuses', async () => {
			await saveService(createService({ id: 'svc-1' }), 'create');
			await saveCredential(createCredential({ id: 'cred-1' }), 'update');
			await saveSubscription(createSubscription({ id: 'sub-1' }), 'delete');

			await clearAllPendingSync(['svc-1'], ['cred-1'], ['sub-1']);

			const pending = await getAllPendingSync();

			expect(pending.services).toHaveLength(0);
			expect(pending.credentials).toHaveLength(0);
			expect(pending.subscriptions).toHaveLength(0);
		});

		it('should delete service with all its credentials', async () => {
			await saveService(createService({ id: 'svc-1' }));
			await saveCredentials([
				createCredential({ id: 'cred-1', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-2', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-3', serviceId: 'svc-2' }),
			]);

			await deleteServiceWithCredentials('svc-1');

			const service = await getService('svc-1');
			const svc1Creds = await getCredentials('svc-1');
			const svc2Creds = await getCredentials('svc-2');

			expect(service).toBeUndefined();
			expect(svc1Creds).toHaveLength(0);
			expect(svc2Creds).toHaveLength(1);
		});

		it('should load vault data for a user', async () => {
			await saveServices([
				createService({ id: 'svc-1', userId: 'user-1' }),
				createService({ id: 'svc-2', userId: 'user-1' }),
				createService({ id: 'svc-3', userId: 'user-2' }),
			]);
			await saveCredentials([
				createCredential({ id: 'cred-1', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-2', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-3', serviceId: 'svc-2' }),
				createCredential({ id: 'cred-4', serviceId: 'svc-3' }),
			]);

			const { services, credentials } = await loadVaultData('user-1');

			expect(services).toHaveLength(2);
			expect(credentials).toHaveLength(3); // creds for svc-1 and svc-2
		});

		it('should save complete vault data', async () => {
			const services = [
				createService({ id: 'svc-1' }),
				createService({ id: 'svc-2' }),
			];
			const credentials = [
				createCredential({ id: 'cred-1', serviceId: 'svc-1' }),
				createCredential({ id: 'cred-2', serviceId: 'svc-2' }),
			];

			await saveVaultData(services, credentials);

			const allServices = await getAllServices();
			const allCredentials = await getAllCredentials();

			expect(allServices).toHaveLength(2);
			expect(allCredentials).toHaveLength(2);
		});
	});

	// ==================== EDGE CASES ====================

	describe('Edge Cases', () => {
		it('should handle getting non-existent service', async () => {
			const service = await getService('non-existent');
			expect(service).toBeUndefined();
		});

		it('should handle getting non-existent credential', async () => {
			const credential = await getCredential('non-existent');
			expect(credential).toBeUndefined();
		});

		it('should handle getting non-existent subscription', async () => {
			const subscription = await getSubscription('non-existent');
			expect(subscription).toBeUndefined();
		});

		it('should handle empty batched reads', async () => {
			const batches: Service[][] = [];
			for await (const batch of getServicesBatched('non-existent-user')) {
				batches.push(batch);
			}
			expect(batches).toHaveLength(0);
		});

		it('should handle soft delete of non-existent item', async () => {
			// Should not throw
			await softDeleteService('non-existent');
			await softDeleteCredential('non-existent');
			await softDeleteSubscription('non-existent');
		});

		it('should handle clear pending sync of non-existent item', async () => {
			// Should not throw
			await clearServicePendingSync('non-existent');
			await clearCredentialPendingSync('non-existent');
			await clearSubscriptionPendingSync('non-existent');
		});

		it('should update existing item on save', async () => {
			const service = createService({ id: 'svc-1', name: 'Original' });
			await saveService(service);

			const updated = { ...service, name: 'Updated' };
			await saveService(updated);

			const retrieved = await getService('svc-1');
			expect(retrieved?.name).toBe('Updated');

			const all = await getAllServices();
			expect(all).toHaveLength(1);
		});

		it('should use default batch size', () => {
			expect(DEFAULT_BATCH_SIZE).toBe(20);
		});
	});
});
