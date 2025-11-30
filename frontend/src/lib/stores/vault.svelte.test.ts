/**
 * Vault Store Tests
 *
 * Tests for Svelte 5 runes-based vault state management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { vaultStore, type Service, type Credential } from './vault.svelte';

describe('Vault Store', () => {
	// Test data
	const testService1: Service = {
		id: 'service-1',
		userId: 'user-123',
		name: 'GitHub',
		icon: 'github',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	};

	const testService2: Service = {
		id: 'service-2',
		userId: 'user-123',
		name: 'Google',
		icon: 'google',
		createdAt: '2024-01-02T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
	};

	const testCredential1: Credential = {
		id: 'cred-1',
		serviceId: 'service-1',
		type: 'username',
		label: 'Username',
		encryptedValue: 'encrypted-value-1',
		iv: 'iv-1',
		displayOrder: 0,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	};

	const testCredential2: Credential = {
		id: 'cred-2',
		serviceId: 'service-1',
		type: 'password',
		label: 'Password',
		encryptedValue: 'encrypted-value-2',
		iv: 'iv-2',
		displayOrder: 1,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
	};

	const testCredential3: Credential = {
		id: 'cred-3',
		serviceId: 'service-2',
		type: 'email',
		label: 'Email',
		encryptedValue: 'encrypted-value-3',
		iv: 'iv-3',
		displayOrder: 0,
		createdAt: '2024-01-02T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
	};

	beforeEach(() => {
		// Clear store before each test
		vaultStore.clear();
	});

	describe('Initial State', () => {
		it('should start with empty state', () => {
			expect(vaultStore.services).toEqual([]);
			expect(vaultStore.credentials).toEqual([]);
			expect(vaultStore.isLoading).toBe(false);
			expect(vaultStore.error).toBeNull();
			expect(vaultStore.selectedServiceId).toBeNull();
		});

		it('should have zero counts initially', () => {
			expect(vaultStore.serviceCount).toBe(0);
			expect(vaultStore.credentialCount).toBe(0);
		});
	});

	describe('Services CRUD', () => {
		describe('setServices', () => {
			it('should set all services', () => {
				vaultStore.setServices([testService1, testService2]);

				expect(vaultStore.services).toHaveLength(2);
				expect(vaultStore.serviceCount).toBe(2);
			});
		});

		describe('addService', () => {
			it('should add a new service', () => {
				vaultStore.addService(testService1);

				expect(vaultStore.services).toHaveLength(1);
				expect(vaultStore.services[0]).toEqual(testService1);
			});

			it('should increment service count', () => {
				vaultStore.addService(testService1);
				vaultStore.addService(testService2);

				expect(vaultStore.serviceCount).toBe(2);
			});
		});

		describe('updateService', () => {
			it('should update an existing service', () => {
				vaultStore.addService(testService1);
				vaultStore.updateService('service-1', { name: 'GitHub Enterprise' });

				expect(vaultStore.services[0].name).toBe('GitHub Enterprise');
			});

			it('should update the updatedAt timestamp', () => {
				vaultStore.addService(testService1);
				const originalUpdatedAt = vaultStore.services[0].updatedAt;

				vaultStore.updateService('service-1', { name: 'Updated' });

				expect(vaultStore.services[0].updatedAt).not.toBe(originalUpdatedAt);
			});

			it('should not modify non-existent service', () => {
				vaultStore.addService(testService1);
				vaultStore.updateService('non-existent', { name: 'Test' });

				expect(vaultStore.services).toHaveLength(1);
				expect(vaultStore.services[0].name).toBe('GitHub');
			});
		});

		describe('removeService', () => {
			it('should remove a service', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.removeService('service-1');

				expect(vaultStore.services).toHaveLength(1);
				expect(vaultStore.services[0].id).toBe('service-2');
			});

			it('should also remove associated credentials', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.setCredentials([testCredential1, testCredential2, testCredential3]);

				vaultStore.removeService('service-1');

				expect(vaultStore.credentials).toHaveLength(1);
				expect(vaultStore.credentials[0].id).toBe('cred-3');
			});

			it('should clear selection if removed service was selected', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.selectService('service-1');

				vaultStore.removeService('service-1');

				expect(vaultStore.selectedServiceId).toBeNull();
			});
		});

		describe('getService', () => {
			it('should return service by ID', () => {
				vaultStore.setServices([testService1, testService2]);

				const service = vaultStore.getService('service-1');

				expect(service).toEqual(testService1);
			});

			it('should return undefined for non-existent ID', () => {
				vaultStore.setServices([testService1]);

				const service = vaultStore.getService('non-existent');

				expect(service).toBeUndefined();
			});
		});
	});

	describe('Credentials CRUD', () => {
		describe('setCredentials', () => {
			it('should set all credentials', () => {
				vaultStore.setCredentials([testCredential1, testCredential2, testCredential3]);

				expect(vaultStore.credentials).toHaveLength(3);
				expect(vaultStore.credentialCount).toBe(3);
			});
		});

		describe('addCredential', () => {
			it('should add a new credential', () => {
				vaultStore.addCredential(testCredential1);

				expect(vaultStore.credentials).toHaveLength(1);
				expect(vaultStore.credentials[0]).toEqual(testCredential1);
			});
		});

		describe('addCredentialsForService', () => {
			it('should add credentials for a service', () => {
				vaultStore.setCredentials([testCredential3]);
				vaultStore.addCredentialsForService('service-1', [testCredential1, testCredential2]);

				expect(vaultStore.credentials).toHaveLength(3);
			});

			it('should replace existing credentials for the same service', () => {
				vaultStore.setCredentials([testCredential1, testCredential3]);

				const newCred: Credential = { ...testCredential1, label: 'New Username' };
				vaultStore.addCredentialsForService('service-1', [newCred]);

				const service1Creds = vaultStore.getCredentialsForService('service-1');
				expect(service1Creds).toHaveLength(1);
				expect(service1Creds[0].label).toBe('New Username');
			});
		});

		describe('updateCredential', () => {
			it('should update an existing credential', () => {
				vaultStore.addCredential(testCredential1);
				vaultStore.updateCredential('cred-1', { label: 'Updated Label' });

				expect(vaultStore.credentials[0].label).toBe('Updated Label');
			});

			it('should update the updatedAt timestamp', () => {
				vaultStore.addCredential(testCredential1);
				const originalUpdatedAt = vaultStore.credentials[0].updatedAt;

				vaultStore.updateCredential('cred-1', { label: 'Updated' });

				expect(vaultStore.credentials[0].updatedAt).not.toBe(originalUpdatedAt);
			});
		});

		describe('removeCredential', () => {
			it('should remove a credential', () => {
				vaultStore.setCredentials([testCredential1, testCredential2]);
				vaultStore.removeCredential('cred-1');

				expect(vaultStore.credentials).toHaveLength(1);
				expect(vaultStore.credentials[0].id).toBe('cred-2');
			});
		});

		describe('getCredential', () => {
			it('should return credential by ID', () => {
				vaultStore.setCredentials([testCredential1, testCredential2]);

				const credential = vaultStore.getCredential('cred-1');

				expect(credential).toEqual(testCredential1);
			});

			it('should return undefined for non-existent ID', () => {
				vaultStore.setCredentials([testCredential1]);

				const credential = vaultStore.getCredential('non-existent');

				expect(credential).toBeUndefined();
			});
		});

		describe('getCredentialsForService', () => {
			it('should return credentials for a specific service', () => {
				vaultStore.setCredentials([testCredential1, testCredential2, testCredential3]);

				const creds = vaultStore.getCredentialsForService('service-1');

				expect(creds).toHaveLength(2);
				expect(creds.every((c) => c.serviceId === 'service-1')).toBe(true);
			});

			it('should return credentials sorted by displayOrder', () => {
				const cred1 = { ...testCredential1, displayOrder: 2 };
				const cred2 = { ...testCredential2, displayOrder: 0 };
				vaultStore.setCredentials([cred1, cred2]);

				const creds = vaultStore.getCredentialsForService('service-1');

				expect(creds[0].displayOrder).toBe(0);
				expect(creds[1].displayOrder).toBe(2);
			});

			it('should return empty array for service with no credentials', () => {
				vaultStore.setCredentials([testCredential1]);

				const creds = vaultStore.getCredentialsForService('service-2');

				expect(creds).toEqual([]);
			});
		});

		describe('reorderCredentials', () => {
			it('should reorder credentials within a service', () => {
				vaultStore.setCredentials([testCredential1, testCredential2]);

				// Reverse order
				vaultStore.reorderCredentials('service-1', ['cred-2', 'cred-1']);

				const creds = vaultStore.getCredentialsForService('service-1');
				expect(creds[0].id).toBe('cred-2');
				expect(creds[0].displayOrder).toBe(0);
				expect(creds[1].id).toBe('cred-1');
				expect(creds[1].displayOrder).toBe(1);
			});

			it('should not affect credentials from other services', () => {
				vaultStore.setCredentials([testCredential1, testCredential2, testCredential3]);

				vaultStore.reorderCredentials('service-1', ['cred-2', 'cred-1']);

				const service2Creds = vaultStore.getCredentialsForService('service-2');
				expect(service2Creds).toHaveLength(1);
				expect(service2Creds[0].id).toBe('cred-3');
			});
		});
	});

	describe('Selection', () => {
		describe('selectService', () => {
			it('should select a service', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.selectService('service-1');

				expect(vaultStore.selectedServiceId).toBe('service-1');
			});

			it('should clear selection with null', () => {
				vaultStore.setServices([testService1]);
				vaultStore.selectService('service-1');
				vaultStore.selectService(null);

				expect(vaultStore.selectedServiceId).toBeNull();
			});
		});

		describe('selectedService', () => {
			it('should return selected service', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.selectService('service-1');

				expect(vaultStore.selectedService).toEqual(testService1);
			});

			it('should return null when nothing selected', () => {
				vaultStore.setServices([testService1]);

				expect(vaultStore.selectedService).toBeNull();
			});
		});

		describe('selectedServiceCredentials', () => {
			it('should return credentials for selected service', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.setCredentials([testCredential1, testCredential2, testCredential3]);
				vaultStore.selectService('service-1');

				const creds = vaultStore.selectedServiceCredentials;

				expect(creds).toHaveLength(2);
				expect(creds.every((c) => c.serviceId === 'service-1')).toBe(true);
			});

			it('should return empty array when nothing selected', () => {
				vaultStore.setCredentials([testCredential1]);

				expect(vaultStore.selectedServiceCredentials).toEqual([]);
			});
		});
	});

	describe('Search', () => {
		describe('searchServices', () => {
			it('should filter services by name', () => {
				vaultStore.setServices([testService1, testService2]);

				const results = vaultStore.searchServices('git');

				expect(results).toHaveLength(1);
				expect(results[0].name).toBe('GitHub');
			});

			it('should be case-insensitive', () => {
				vaultStore.setServices([testService1, testService2]);

				const results = vaultStore.searchServices('GITHUB');

				expect(results).toHaveLength(1);
			});

			it('should return all services for empty query', () => {
				vaultStore.setServices([testService1, testService2]);

				const results = vaultStore.searchServices('');

				expect(results).toHaveLength(2);
			});

			it('should return all services for whitespace query', () => {
				vaultStore.setServices([testService1, testService2]);

				const results = vaultStore.searchServices('   ');

				expect(results).toHaveLength(2);
			});
		});
	});

	describe('Optimistic Updates', () => {
		describe('rollback', () => {
			it('should restore previous services state', () => {
				vaultStore.setServices([testService1]);
				vaultStore.addService(testService2);
				vaultStore.rollback();

				expect(vaultStore.services).toHaveLength(1);
				expect(vaultStore.services[0].id).toBe('service-1');
			});

			it('should restore previous credentials state', () => {
				vaultStore.setCredentials([testCredential1]);
				vaultStore.addCredential(testCredential2);
				vaultStore.rollback();

				expect(vaultStore.credentials).toHaveLength(1);
				expect(vaultStore.credentials[0].id).toBe('cred-1');
			});
		});

		describe('commit', () => {
			it('should clear snapshot after commit', () => {
				vaultStore.setServices([testService1]);
				vaultStore.addService(testService2);
				vaultStore.commit();

				// After commit, rollback should restore to empty (commit cleared snapshot)
				vaultStore.rollback();

				// Services should now be empty since snapshot was cleared
				expect(vaultStore.services).toHaveLength(0);
			});

			it('should preserve current state after commit and new operation', () => {
				vaultStore.setServices([testService1]);
				vaultStore.commit();

				// New operation after commit
				vaultStore.addService(testService2);

				// Rollback should restore to state at time of addService (which was [testService1])
				vaultStore.rollback();

				expect(vaultStore.services).toHaveLength(1);
				expect(vaultStore.services[0].id).toBe('service-1');
			});
		});
	});

	describe('Loading & Error State', () => {
		describe('setLoading', () => {
			it('should set loading state', () => {
				vaultStore.setLoading(true);
				expect(vaultStore.isLoading).toBe(true);

				vaultStore.setLoading(false);
				expect(vaultStore.isLoading).toBe(false);
			});
		});

		describe('setError', () => {
			it('should set error state', () => {
				vaultStore.setError('Something went wrong');
				expect(vaultStore.error).toBe('Something went wrong');
			});
		});

		describe('clearError', () => {
			it('should clear error state', () => {
				vaultStore.setError('Error');
				vaultStore.clearError();
				expect(vaultStore.error).toBeNull();
			});
		});
	});

	describe('Bulk Operations', () => {
		describe('clear', () => {
			it('should clear all state', () => {
				vaultStore.setServices([testService1, testService2]);
				vaultStore.setCredentials([testCredential1, testCredential2]);
				vaultStore.selectService('service-1');
				vaultStore.setLoading(true);
				vaultStore.setError('Error');

				vaultStore.clear();

				expect(vaultStore.services).toEqual([]);
				expect(vaultStore.credentials).toEqual([]);
				expect(vaultStore.selectedServiceId).toBeNull();
				expect(vaultStore.isLoading).toBe(false);
				expect(vaultStore.error).toBeNull();
			});
		});

		describe('loadVault', () => {
			it('should load services and credentials', () => {
				vaultStore.setLoading(true);
				vaultStore.setError('Previous error');

				vaultStore.loadVault([testService1, testService2], [testCredential1, testCredential2]);

				expect(vaultStore.services).toHaveLength(2);
				expect(vaultStore.credentials).toHaveLength(2);
				expect(vaultStore.isLoading).toBe(false);
				expect(vaultStore.error).toBeNull();
			});
		});
	});
});
