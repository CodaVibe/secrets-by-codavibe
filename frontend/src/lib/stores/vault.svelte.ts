/**
 * Vault Store - Svelte 5 Runes-based Vault State Management
 *
 * Manages vault state including:
 * - Services (password entries grouped by service)
 * - Credentials (individual username/password/etc entries)
 * - Loading states
 * - CRUD operations with optimistic updates
 *
 * Features:
 * - Optimistic updates with rollback on failure
 * - Derived counts for UI display
 * - Search/filter capabilities
 */

/**
 * Service interface - represents a service/website entry
 */
export interface Service {
	id: string;
	userId: string;
	name: string;
	icon?: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Credential type enum
 */
export type CredentialType = 'username' | 'password' | 'email' | 'totp' | 'note' | 'custom';

/**
 * Credential interface - represents an individual credential entry
 */
export interface Credential {
	id: string;
	serviceId: string;
	type: CredentialType;
	label: string;
	/** Encrypted value (hex encoded) */
	encryptedValue: string;
	/** IV for decryption (hex encoded) */
	iv: string;
	/** Display order within service */
	displayOrder: number;
	createdAt: string;
	updatedAt: string;
}

/**
 * Vault Store Class using Svelte 5 runes
 */
class VaultStore {
	// Core state using $state rune
	services = $state<Service[]>([]);
	credentials = $state<Credential[]>([]);
	isLoading = $state(false);
	error = $state<string | null>(null);
	selectedServiceId = $state<string | null>(null);

	// For optimistic updates rollback
	private previousServices: Service[] = [];
	private previousCredentials: Credential[] = [];

	/**
	 * Derived: Total service count
	 */
	get serviceCount(): number {
		return this.services.length;
	}

	/**
	 * Derived: Total credential count
	 */
	get credentialCount(): number {
		return this.credentials.length;
	}

	/**
	 * Derived: Currently selected service
	 */
	get selectedService(): Service | null {
		if (!this.selectedServiceId) return null;
		return this.services.find((s) => s.id === this.selectedServiceId) ?? null;
	}

	/**
	 * Derived: Credentials for selected service
	 */
	get selectedServiceCredentials(): Credential[] {
		if (!this.selectedServiceId) return [];
		return this.credentials
			.filter((c) => c.serviceId === this.selectedServiceId)
			.sort((a, b) => a.displayOrder - b.displayOrder);
	}

	/**
	 * Get credentials for a specific service
	 */
	getCredentialsForService(serviceId: string): Credential[] {
		return this.credentials
			.filter((c) => c.serviceId === serviceId)
			.sort((a, b) => a.displayOrder - b.displayOrder);
	}

	/**
	 * Search services by name
	 */
	searchServices(query: string): Service[] {
		if (!query.trim()) return this.services;
		const lowerQuery = query.toLowerCase();
		return this.services.filter((s) => s.name.toLowerCase().includes(lowerQuery));
	}

	/**
	 * Select a service
	 */
	selectService(serviceId: string | null) {
		this.selectedServiceId = serviceId;
	}

	// ==================== SERVICES CRUD ====================

	/**
	 * Set all services (used after fetching from API)
	 */
	setServices(services: Service[]) {
		this.services = services;
	}

	/**
	 * Add a new service (optimistic update)
	 */
	addService(service: Service) {
		this.saveSnapshot();
		this.services.push(service);
	}

	/**
	 * Update an existing service (optimistic update)
	 */
	updateService(serviceId: string, updates: Partial<Omit<Service, 'id' | 'userId'>>) {
		this.saveSnapshot();
		const index = this.services.findIndex((s) => s.id === serviceId);
		if (index !== -1) {
			this.services[index] = {
				...this.services[index],
				...updates,
				updatedAt: new Date().toISOString(),
			};
		}
	}

	/**
	 * Remove a service (optimistic update)
	 * Also removes associated credentials
	 */
	removeService(serviceId: string) {
		this.saveSnapshot();
		this.services = this.services.filter((s) => s.id !== serviceId);
		this.credentials = this.credentials.filter((c) => c.serviceId !== serviceId);

		// Clear selection if removed service was selected
		if (this.selectedServiceId === serviceId) {
			this.selectedServiceId = null;
		}
	}

	/**
	 * Get a service by ID
	 */
	getService(serviceId: string): Service | undefined {
		return this.services.find((s) => s.id === serviceId);
	}

	// ==================== CREDENTIALS CRUD ====================

	/**
	 * Set all credentials (used after fetching from API)
	 */
	setCredentials(credentials: Credential[]) {
		this.credentials = credentials;
	}

	/**
	 * Add credentials for a service
	 */
	addCredentialsForService(serviceId: string, newCredentials: Credential[]) {
		this.saveSnapshot();
		// Filter out any existing credentials for this service first
		const existingOther = this.credentials.filter((c) => c.serviceId !== serviceId);
		this.credentials = [...existingOther, ...newCredentials];
	}

	/**
	 * Add a new credential (optimistic update)
	 */
	addCredential(credential: Credential) {
		this.saveSnapshot();
		this.credentials.push(credential);
	}

	/**
	 * Update an existing credential (optimistic update)
	 */
	updateCredential(
		credentialId: string,
		updates: Partial<Omit<Credential, 'id' | 'serviceId'>>
	) {
		this.saveSnapshot();
		const index = this.credentials.findIndex((c) => c.id === credentialId);
		if (index !== -1) {
			this.credentials[index] = {
				...this.credentials[index],
				...updates,
				updatedAt: new Date().toISOString(),
			};
		}
	}

	/**
	 * Remove a credential (optimistic update)
	 */
	removeCredential(credentialId: string) {
		this.saveSnapshot();
		this.credentials = this.credentials.filter((c) => c.id !== credentialId);
	}

	/**
	 * Get a credential by ID
	 */
	getCredential(credentialId: string): Credential | undefined {
		return this.credentials.find((c) => c.id === credentialId);
	}

	/**
	 * Reorder credentials within a service
	 */
	reorderCredentials(serviceId: string, orderedIds: string[]) {
		this.saveSnapshot();
		const serviceCredentials = this.credentials.filter((c) => c.serviceId === serviceId);
		const otherCredentials = this.credentials.filter((c) => c.serviceId !== serviceId);

		// Update display order based on new order
		const reordered = orderedIds
			.map((id, index) => {
				const cred = serviceCredentials.find((c) => c.id === id);
				if (cred) {
					return { ...cred, displayOrder: index, updatedAt: new Date().toISOString() };
				}
				return null;
			})
			.filter((c): c is Credential => c !== null);

		this.credentials = [...otherCredentials, ...reordered];
	}

	// ==================== OPTIMISTIC UPDATE HELPERS ====================

	/**
	 * Save current state for potential rollback
	 */
	private saveSnapshot() {
		this.previousServices = [...this.services];
		this.previousCredentials = [...this.credentials];
	}

	/**
	 * Rollback to previous state (on API failure)
	 */
	rollback() {
		this.services = this.previousServices;
		this.credentials = this.previousCredentials;
	}

	/**
	 * Commit changes (clear snapshot after successful API call)
	 */
	commit() {
		this.previousServices = [];
		this.previousCredentials = [];
	}

	// ==================== LOADING & ERROR STATE ====================

	/**
	 * Set loading state
	 */
	setLoading(loading: boolean) {
		this.isLoading = loading;
	}

	/**
	 * Set error state
	 */
	setError(error: string | null) {
		this.error = error;
	}

	/**
	 * Clear error
	 */
	clearError() {
		this.error = null;
	}

	// ==================== BULK OPERATIONS ====================

	/**
	 * Clear all vault data (on logout)
	 */
	clear() {
		this.services = [];
		this.credentials = [];
		this.selectedServiceId = null;
		this.isLoading = false;
		this.error = null;
		this.previousServices = [];
		this.previousCredentials = [];
	}

	/**
	 * Load vault data (services and credentials)
	 */
	loadVault(services: Service[], credentials: Credential[]) {
		this.services = services;
		this.credentials = credentials;
		this.isLoading = false;
		this.error = null;
	}
}

/**
 * Singleton vault store instance
 */
export const vaultStore = new VaultStore();
