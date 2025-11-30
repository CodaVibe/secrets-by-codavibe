/**
 * Auth Store - Svelte 5 Runes-based Authentication State Management
 *
 * Manages authentication state including:
 * - User session (userId, sessionToken)
 * - Data Encryption Key (DEK) for vault operations
 * - Auto-lock functionality after inactivity
 * - Login/logout/lock operations
 *
 * Security Properties:
 * - DEK is stored in memory only (never persisted)
 * - Auto-lock clears DEK after 15 minutes of inactivity
 * - Session token stored for API authentication
 */

import { lockVault } from '$lib/crypto/worker';

/**
 * Auto-lock timeout in milliseconds (15 minutes)
 */
export const AUTH_AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Auth state interface
 */
export interface AuthState {
	/** Whether user is authenticated (has valid session) */
	isAuthenticated: boolean;
	/** User's unique identifier */
	userId: string | null;
	/** Session token for API requests */
	sessionToken: string | null;
	/** Data Encryption Key (in-memory only) */
	dek: Uint8Array | null;
	/** User's email address */
	email: string | null;
	/** Timestamp of last activity (for auto-lock) */
	lastActivityAt: number;
}

/**
 * Auth Store Class using Svelte 5 runes
 * Uses class with $state fields for reactive state management
 */
class AuthStore {
	// Core state using $state rune (class field syntax)
	isAuthenticated = $state(false);
	userId = $state<string | null>(null);
	sessionToken = $state<string | null>(null);
	dek = $state<Uint8Array | null>(null);
	email = $state<string | null>(null);
	lastActivityAt = $state(Date.now());

	// Auto-lock timer reference
	private autoLockTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Derived: isLocked (authenticated but no DEK available)
	 * Using getter for test compatibility
	 */
	get isLocked(): boolean {
		return this.isAuthenticated && this.dek === null;
	}

	/**
	 * Derived: hasSession (has valid session token)
	 * Using getter for test compatibility
	 */
	get hasSession(): boolean {
		return this.sessionToken !== null;
	}

	/**
	 * Derived: canDecrypt (has DEK available for vault operations)
	 * Using getter for test compatibility
	 */
	get canDecrypt(): boolean {
		return this.dek !== null;
	}

	/**
	 * Start or reset the auto-lock timer
	 */
	private resetAutoLockTimer() {
		// Clear existing timer
		if (this.autoLockTimer !== null) {
			clearTimeout(this.autoLockTimer);
			this.autoLockTimer = null;
		}

		// Only set timer if authenticated and unlocked
		if (this.isAuthenticated && this.dek !== null) {
			this.autoLockTimer = setTimeout(() => {
				this.lock();
			}, AUTH_AUTO_LOCK_TIMEOUT_MS);
		}
	}

	/**
	 * Record user activity (resets auto-lock timer)
	 */
	recordActivity() {
		this.lastActivityAt = Date.now();
		this.resetAutoLockTimer();
	}

	/**
	 * Login - Set authenticated state with session and DEK
	 */
	login(params: { userId: string; sessionToken: string; dek: Uint8Array; email: string }) {
		this.isAuthenticated = true;
		this.userId = params.userId;
		this.sessionToken = params.sessionToken;
		this.dek = params.dek;
		this.email = params.email;
		this.lastActivityAt = Date.now();

		// Start auto-lock timer
		this.resetAutoLockTimer();
	}

	/**
	 * Logout - Clear all authentication state
	 * Also sanitizes crypto worker memory
	 */
	async logout() {
		// Clear auto-lock timer
		if (this.autoLockTimer !== null) {
			clearTimeout(this.autoLockTimer);
			this.autoLockTimer = null;
		}

		// Sanitize crypto worker memory
		try {
			await lockVault();
		} catch {
			// Worker may not be initialized, ignore
		}

		// Clear state
		this.isAuthenticated = false;
		this.userId = null;
		this.sessionToken = null;
		this.dek = null;
		this.email = null;
		this.lastActivityAt = 0;
	}

	/**
	 * Lock - Clear DEK but keep session
	 * User can unlock by re-entering master password
	 */
	async lock() {
		// Clear auto-lock timer
		if (this.autoLockTimer !== null) {
			clearTimeout(this.autoLockTimer);
			this.autoLockTimer = null;
		}

		// Sanitize crypto worker memory
		try {
			await lockVault();
		} catch {
			// Worker may not be initialized, ignore
		}

		// Clear DEK but keep session
		this.dek = null;
	}

	/**
	 * Unlock - Restore DEK after lock
	 * Called after user re-enters master password
	 */
	unlock(dek: Uint8Array) {
		if (!this.isAuthenticated) {
			throw new Error('Cannot unlock: not authenticated');
		}

		this.dek = dek;
		this.lastActivityAt = Date.now();

		// Restart auto-lock timer
		this.resetAutoLockTimer();
	}

	/**
	 * Update session token (e.g., after refresh)
	 */
	updateSessionToken(sessionToken: string) {
		this.sessionToken = sessionToken;
	}

	/**
	 * Get current DEK for encryption/decryption
	 * Throws if not available (locked or not authenticated)
	 */
	getDEK(): Uint8Array {
		if (this.dek === null) {
			throw new Error('DEK not available: vault is locked or not authenticated');
		}
		this.recordActivity();
		return this.dek;
	}

	/**
	 * Get session token for API requests
	 * Throws if not available
	 */
	getSessionToken(): string {
		if (this.sessionToken === null) {
			throw new Error('Session token not available: not authenticated');
		}
		return this.sessionToken;
	}

	/**
	 * Check if session is valid (not expired)
	 */
	isSessionValid(): boolean {
		return this.sessionToken !== null;
	}

	/**
	 * Get time until auto-lock in milliseconds
	 */
	getTimeUntilLock(): number | null {
		if (!this.isAuthenticated || this.dek === null) {
			return null;
		}

		const elapsed = Date.now() - this.lastActivityAt;
		const remaining = AUTH_AUTO_LOCK_TIMEOUT_MS - elapsed;
		return Math.max(0, remaining);
	}
}

/**
 * Singleton auth store instance
 */
export const authStore = new AuthStore();
