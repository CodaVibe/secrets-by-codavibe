/**
 * Auth Store Tests
 *
 * Tests for Svelte 5 runes-based authentication state management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the crypto worker module before importing auth store
vi.mock('$lib/crypto/worker', () => ({
	getCryptoWorker: vi.fn(),
	lockVault: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { authStore, AUTH_AUTO_LOCK_TIMEOUT_MS } from './auth.svelte';
import { lockVault } from '$lib/crypto/worker';

describe('Auth Store', () => {
	// Test data
	const testUserId = 'user-123';
	const testSessionToken = 'session-token-abc';
	const testEmail = 'test@example.com';
	const testDEK = new Uint8Array(32).fill(0x42);

	beforeEach(() => {
		// Reset store state before each test
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(async () => {
		// Logout to reset state
		await authStore.logout();
		vi.useRealTimers();
	});

	describe('Initial State', () => {
		it('should start with unauthenticated state', async () => {
			await authStore.logout(); // Ensure clean state
			expect(authStore.isAuthenticated).toBe(false);
			expect(authStore.userId).toBeNull();
			expect(authStore.email).toBeNull();
			expect(authStore.isLocked).toBe(false);
			expect(authStore.hasSession).toBe(false);
			expect(authStore.canDecrypt).toBe(false);
		});
	});

	describe('login', () => {
		it('should set authenticated state on login', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			expect(authStore.isAuthenticated).toBe(true);
			expect(authStore.userId).toBe(testUserId);
			expect(authStore.email).toBe(testEmail);
			expect(authStore.hasSession).toBe(true);
			expect(authStore.canDecrypt).toBe(true);
			expect(authStore.isLocked).toBe(false);
		});

		it('should update lastActivityAt on login', () => {
			const before = Date.now();
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});
			const after = Date.now();

			expect(authStore.lastActivityAt).toBeGreaterThanOrEqual(before);
			expect(authStore.lastActivityAt).toBeLessThanOrEqual(after);
		});
	});

	describe('logout', () => {
		it('should clear all state on logout', async () => {
			// First login
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			// Then logout
			await authStore.logout();

			expect(authStore.isAuthenticated).toBe(false);
			expect(authStore.userId).toBeNull();
			expect(authStore.email).toBeNull();
			expect(authStore.hasSession).toBe(false);
			expect(authStore.canDecrypt).toBe(false);
		});

		it('should call lockVault to sanitize memory', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			await authStore.logout();

			expect(lockVault).toHaveBeenCalled();
		});
	});

	describe('lock', () => {
		it('should clear DEK but keep session on lock', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			await authStore.lock();

			expect(authStore.isAuthenticated).toBe(true);
			expect(authStore.userId).toBe(testUserId);
			expect(authStore.hasSession).toBe(true);
			expect(authStore.canDecrypt).toBe(false);
			expect(authStore.isLocked).toBe(true);
		});

		it('should call lockVault to sanitize memory', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			await authStore.lock();

			expect(lockVault).toHaveBeenCalled();
		});
	});

	describe('unlock', () => {
		it('should restore DEK on unlock', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			await authStore.lock();
			expect(authStore.isLocked).toBe(true);

			const newDEK = new Uint8Array(32).fill(0x99);
			authStore.unlock(newDEK);

			expect(authStore.isLocked).toBe(false);
			expect(authStore.canDecrypt).toBe(true);
		});

		it('should throw if not authenticated', async () => {
			await authStore.logout();

			expect(() => {
				authStore.unlock(testDEK);
			}).toThrow('Cannot unlock: not authenticated');
		});
	});

	describe('getDEK', () => {
		it('should return DEK when available', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			const dek = authStore.getDEK();
			expect(dek).toEqual(testDEK);
		});

		it('should throw when locked', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			await authStore.lock();

			expect(() => {
				authStore.getDEK();
			}).toThrow('DEK not available');
		});

		it('should throw when not authenticated', async () => {
			await authStore.logout();

			expect(() => {
				authStore.getDEK();
			}).toThrow('DEK not available');
		});

		it('should record activity when getting DEK', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			const before = authStore.lastActivityAt;
			vi.advanceTimersByTime(1000);
			authStore.getDEK();

			expect(authStore.lastActivityAt).toBeGreaterThan(before);
		});
	});

	describe('getSessionToken', () => {
		it('should return session token when available', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			const token = authStore.getSessionToken();
			expect(token).toBe(testSessionToken);
		});

		it('should throw when not authenticated', async () => {
			await authStore.logout();

			expect(() => {
				authStore.getSessionToken();
			}).toThrow('Session token not available');
		});
	});

	describe('updateSessionToken', () => {
		it('should update session token', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			const newToken = 'new-session-token';
			authStore.updateSessionToken(newToken);

			expect(authStore.getSessionToken()).toBe(newToken);
		});
	});

	describe('isSessionValid', () => {
		it('should return true when session exists', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			expect(authStore.isSessionValid()).toBe(true);
		});

		it('should return false when not authenticated', async () => {
			await authStore.logout();

			expect(authStore.isSessionValid()).toBe(false);
		});
	});

	describe('recordActivity', () => {
		it('should update lastActivityAt', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			const before = authStore.lastActivityAt;
			vi.advanceTimersByTime(1000);
			authStore.recordActivity();

			expect(authStore.lastActivityAt).toBeGreaterThan(before);
		});
	});

	describe('Auto-lock', () => {
		it('should auto-lock after timeout', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			expect(authStore.isLocked).toBe(false);

			// Advance time past auto-lock timeout
			vi.advanceTimersByTime(AUTH_AUTO_LOCK_TIMEOUT_MS + 1000);

			// Allow any pending promises to resolve
			await vi.runAllTimersAsync();

			expect(authStore.isLocked).toBe(true);
			expect(authStore.isAuthenticated).toBe(true); // Still authenticated
		});

		it('should reset auto-lock timer on activity', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			// Advance time to just before timeout
			vi.advanceTimersByTime(AUTH_AUTO_LOCK_TIMEOUT_MS - 60000);

			// Record activity (resets timer)
			authStore.recordActivity();

			// Advance time past original timeout but not new timeout
			vi.advanceTimersByTime(120000);

			expect(authStore.isLocked).toBe(false);
		});

		it('should return correct time until lock', () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			const timeUntilLock = authStore.getTimeUntilLock();
			expect(timeUntilLock).toBe(AUTH_AUTO_LOCK_TIMEOUT_MS);

			// Advance time
			vi.advanceTimersByTime(60000);

			const newTimeUntilLock = authStore.getTimeUntilLock();
			expect(newTimeUntilLock).toBe(AUTH_AUTO_LOCK_TIMEOUT_MS - 60000);
		});

		it('should return null for time until lock when not authenticated', async () => {
			await authStore.logout();

			expect(authStore.getTimeUntilLock()).toBeNull();
		});

		it('should return null for time until lock when locked', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			await authStore.lock();

			expect(authStore.getTimeUntilLock()).toBeNull();
		});
	});

	describe('Derived State', () => {
		it('isLocked should be true when authenticated but no DEK', async () => {
			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			expect(authStore.isLocked).toBe(false);

			await authStore.lock();

			expect(authStore.isLocked).toBe(true);
		});

		it('isLocked should be false when not authenticated', async () => {
			await authStore.logout();

			expect(authStore.isLocked).toBe(false);
		});

		it('hasSession should reflect session token presence', async () => {
			await authStore.logout();
			expect(authStore.hasSession).toBe(false);

			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			expect(authStore.hasSession).toBe(true);
		});

		it('canDecrypt should reflect DEK availability', async () => {
			await authStore.logout();
			expect(authStore.canDecrypt).toBe(false);

			authStore.login({
				userId: testUserId,
				sessionToken: testSessionToken,
				dek: testDEK,
				email: testEmail,
			});

			expect(authStore.canDecrypt).toBe(true);

			await authStore.lock();

			expect(authStore.canDecrypt).toBe(false);
		});
	});
});
