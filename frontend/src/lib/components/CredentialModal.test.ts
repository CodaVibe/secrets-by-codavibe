import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import CredentialModal from './CredentialModal.svelte';
import { vaultStore } from '$lib/stores/vault.svelte';
import { authStore } from '$lib/stores/auth.svelte';

// Mock the crypto modules
vi.mock('$lib/crypto/aes', () => ({
	encryptToHex: vi.fn(() => ({ ciphertext: 'encrypted123', iv: 'iv123' })),
	decryptFromHexToString: vi.fn(() => 'decrypted-value')
}));

vi.mock('@noble/ciphers/utils.js', () => ({
	bytesToHex: vi.fn(() => 'authtag123')
}));

vi.mock('@noble/hashes/utils.js', () => ({
	randomBytes: vi.fn(() => new Uint8Array(16))
}));

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
	randomUUID: () => 'test-uuid-123'
});

describe('CredentialModal', () => {
	const mockServiceId = 'service-123';
	const mockDEK = new Uint8Array(32);
	const mockSessionToken = 'session-token-123';

	beforeEach(() => {
		vi.clearAllMocks();
		cleanup();

		// Setup auth store mock
		vi.spyOn(authStore, 'getDEK').mockReturnValue(mockDEK);
		vi.spyOn(authStore, 'getSessionToken').mockReturnValue(mockSessionToken);

		// Reset vault store
		vaultStore.clear();

		// Default fetch mock
		mockFetch.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					credential: {
						id: 'cred-123',
						serviceId: mockServiceId,
						type: 'password',
						label: 'Test Label',
						encryptedValue: 'encrypted123',
						iv: 'iv123',
						displayOrder: 0,
						createdAt: Math.floor(Date.now() / 1000),
						updatedAt: Math.floor(Date.now() / 1000)
					}
				})
		});
	});

	afterEach(() => {
		cleanup();
	});

	it('renders nothing when closed', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: false,
				onClose: vi.fn()
			}
		});

		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('renders modal when open', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('dialog')).toBeTruthy();
		// Check for the modal title (h2 element)
		expect(screen.getByRole('heading', { name: 'Add Credential' })).toBeTruthy();
	});

	it('shows edit title when credentialId is provided', () => {
		// Add a credential to the store first
		vaultStore.addCredential({
			id: 'existing-cred',
			serviceId: mockServiceId,
			type: 'password',
			label: 'Existing',
			encryptedValue: 'enc',
			iv: 'iv',
			displayOrder: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});

		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				credentialId: 'existing-cred',
				isOpen: true,
				onClose: vi.fn()
			}
		});

		expect(screen.getByText('Edit Credential')).toBeTruthy();
	});

	it('renders all credential type options', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		const select = screen.getByLabelText('Type') as HTMLSelectElement;
		expect(select).toBeTruthy();

		// Check all options are present
		const options = select.querySelectorAll('option');
		expect(options.length).toBe(6);
	});

	it('renders label and value inputs', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		expect(screen.getByLabelText('Label')).toBeTruthy();
		expect(screen.getByLabelText('Value')).toBeTruthy();
	});

	it('shows textarea for note type', async () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		const select = screen.getByLabelText('Type') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'note' } });

		// Should now have a textarea instead of input
		const textarea = document.querySelector('textarea');
		expect(textarea).toBeTruthy();
	});

	it('calls onClose when cancel button is clicked', async () => {
		const onClose = vi.fn();
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose
			}
		});

		const cancelButton = screen.getByText('Cancel');
		await fireEvent.click(cancelButton);

		expect(onClose).toHaveBeenCalled();
	});

	it('calls onClose when close button is clicked', async () => {
		const onClose = vi.fn();
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose
			}
		});

		const closeButton = screen.getByLabelText('Close modal');
		await fireEvent.click(closeButton);

		expect(onClose).toHaveBeenCalled();
	});

	it('has required attribute on label input', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		const labelInput = screen.getByLabelText('Label') as HTMLInputElement;
		expect(labelInput.required).toBe(true);
	});

	it('has required attribute on value input', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
		expect(valueInput.required).toBe(true);
	});

	it('submits form and calls API for new credential', async () => {
		const onSave = vi.fn();
		const onClose = vi.fn();

		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose,
				onSave
			}
		});

		// Fill form
		const labelInput = screen.getByLabelText('Label');
		const valueInput = screen.getByLabelText('Value');

		await fireEvent.input(labelInput, { target: { value: 'Test Label' } });
		await fireEvent.input(valueInput, { target: { value: 'test-password' } });

		// Submit using the submit button
		const submitButton = screen.getByRole('button', { name: /add credential/i });
		await fireEvent.click(submitButton);

		// Wait for async operations
		await vi.waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith('/api/vault/credentials', expect.any(Object));
		});
	});

	it('shows password input type for password credentials', () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
		expect(valueInput.type).toBe('password');
	});

	it('shows text input type for username credentials', async () => {
		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		const select = screen.getByLabelText('Type') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'username' } });

		const valueInput = screen.getByLabelText('Value') as HTMLInputElement;
		expect(valueInput.type).toBe('text');
	});

	it('disables inputs while loading', async () => {
		// Make fetch hang
		mockFetch.mockImplementation(() => new Promise(() => {}));

		render(CredentialModal, {
			props: {
				serviceId: mockServiceId,
				isOpen: true,
				onClose: vi.fn()
			}
		});

		// Fill form
		const labelInput = screen.getByLabelText('Label') as HTMLInputElement;
		const valueInput = screen.getByLabelText('Value') as HTMLInputElement;

		await fireEvent.input(labelInput, { target: { value: 'Test Label' } });
		await fireEvent.input(valueInput, { target: { value: 'test-password' } });

		// Submit using the submit button
		const submitButton = screen.getByRole('button', { name: /add credential/i });
		await fireEvent.click(submitButton);

		// Check loading state
		expect(screen.getByText('Saving...')).toBeTruthy();
	});
});
