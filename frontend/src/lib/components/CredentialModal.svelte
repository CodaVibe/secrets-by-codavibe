<script lang="ts">
	import { vaultStore, type Credential, type CredentialType } from '$lib/stores/vault.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { encryptToHex, decryptFromHexToString } from '$lib/crypto/aes';
	import { bytesToHex } from '@noble/ciphers/utils.js';
	import { randomBytes } from '@noble/hashes/utils.js';

	interface Props {
		/** Service ID to add credential to */
		serviceId: string;
		/** Credential ID for edit mode (null for add mode) */
		credentialId?: string | null;
		/** Whether the modal is open */
		isOpen: boolean;
		/** Callback when modal is closed */
		onClose: () => void;
		/** Callback when credential is saved successfully */
		onSave?: (credential: Credential) => void;
	}

	let { serviceId, credentialId = null, isOpen, onClose, onSave }: Props = $props();

	// Form state
	let type = $state<CredentialType>('password');
	let label = $state('');
	let value = $state('');
	let isLoading = $state(false);
	let error = $state('');

	// Credential types for dropdown
	const credentialTypes: { value: CredentialType; label: string; icon: string }[] = [
		{ value: 'username', label: 'Username', icon: '👤' },
		{ value: 'password', label: 'Password', icon: '🔑' },
		{ value: 'email', label: 'Email', icon: '📧' },
		{ value: 'totp', label: 'TOTP Secret', icon: '🔐' },
		{ value: 'note', label: 'Note', icon: '📝' },
		{ value: 'custom', label: 'Custom', icon: '🏷️' }
	];

	// Derived: Check if we're in edit mode
	let isEditMode = $derived(credentialId !== null && credentialId !== undefined);

	// Derived: Get existing credential for edit mode
	let existingCredential = $derived(
		isEditMode ? vaultStore.getCredential(credentialId!) : null
	);

	// Load existing credential data when editing
	$effect(() => {
		if (isOpen && isEditMode && existingCredential) {
			type = existingCredential.type;
			label = existingCredential.label;
			// Decrypt the value for editing
			try {
				const dek = authStore.getDEK();
				value = decryptFromHexToString(
					existingCredential.encryptedValue,
					dek,
					existingCredential.iv
				);
			} catch (err) {
				console.error('Failed to decrypt credential for editing:', err);
				error = 'Failed to load credential value';
				value = '';
			}
		} else if (isOpen && !isEditMode) {
			// Reset form for add mode
			type = 'password';
			label = '';
			value = '';
			error = '';
		}
	});

	// Reset form when modal closes
	$effect(() => {
		if (!isOpen) {
			type = 'password';
			label = '';
			value = '';
			error = '';
			isLoading = false;
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();

		// Validation
		if (!label.trim()) {
			error = 'Label is required';
			return;
		}

		if (!value.trim()) {
			error = 'Value is required';
			return;
		}

		isLoading = true;
		error = '';

		try {
			// Get DEK for encryption
			const dek = authStore.getDEK();

			// Encrypt the value
			const { ciphertext: encryptedValue, iv } = encryptToHex(value, dek);

			// Generate auth tag (for backend compatibility - GCM includes it in ciphertext)
			// The @noble/ciphers GCM implementation appends the auth tag to ciphertext
			// We'll use a placeholder since the tag is already in the ciphertext
			const authTag = bytesToHex(randomBytes(16));

			if (isEditMode && existingCredential) {
				// Update existing credential
				await updateCredential(encryptedValue, iv, authTag);
			} else {
				// Create new credential
				await createCredential(encryptedValue, iv, authTag);
			}
		} catch (err) {
			console.error('Failed to save credential:', err);
			error = err instanceof Error ? err.message : 'Failed to save credential';
			isLoading = false;
		}
	}

	async function createCredential(encryptedValue: string, iv: string, authTag: string) {
		// Get next display order
		const existingCredentials = vaultStore.getCredentialsForService(serviceId);
		const displayOrder = existingCredentials.length;

		// Generate temporary ID for optimistic update
		const tempId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Optimistic update
		const newCredential: Credential = {
			id: tempId,
			serviceId,
			type,
			label: label.trim(),
			encryptedValue,
			iv,
			displayOrder,
			createdAt: now,
			updatedAt: now
		};

		vaultStore.addCredential(newCredential);

		try {
			// Call API
			const sessionToken = authStore.getSessionToken();
			const response = await fetch('/api/vault/credentials', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${sessionToken}`
				},
				body: JSON.stringify({
					serviceId,
					type,
					label: label.trim(),
					encryptedValue,
					iv,
					authTag,
					displayOrder
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to create credential');
			}

			const data = await response.json();

			// Update with real ID from server
			vaultStore.removeCredential(tempId);
			const serverCredential: Credential = {
				id: data.credential.id,
				serviceId: data.credential.serviceId,
				type: data.credential.type,
				label: data.credential.label,
				encryptedValue: data.credential.encryptedValue,
				iv: data.credential.iv,
				displayOrder: data.credential.displayOrder,
				createdAt: new Date(data.credential.createdAt * 1000).toISOString(),
				updatedAt: new Date(data.credential.updatedAt * 1000).toISOString()
			};
			vaultStore.addCredential(serverCredential);
			vaultStore.commit();

			// Notify parent and close
			onSave?.(serverCredential);
			onClose();
		} catch (err) {
			// Rollback on failure
			vaultStore.rollback();
			throw err;
		}
	}

	async function updateCredential(encryptedValue: string, iv: string, authTag: string) {
		if (!existingCredential) return;

		// Optimistic update
		vaultStore.updateCredential(credentialId!, {
			type,
			label: label.trim(),
			encryptedValue,
			iv
		});

		try {
			// Call API
			const sessionToken = authStore.getSessionToken();
			const response = await fetch(`/api/vault/credentials/${credentialId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${sessionToken}`
				},
				body: JSON.stringify({
					label: label.trim(),
					encryptedValue,
					iv,
					authTag
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to update credential');
			}

			const data = await response.json();
			vaultStore.commit();

			// Notify parent and close
			const updatedCredential: Credential = {
				id: data.credential.id,
				serviceId: data.credential.serviceId,
				type: data.credential.type,
				label: data.credential.label,
				encryptedValue: data.credential.encryptedValue,
				iv: data.credential.iv,
				displayOrder: data.credential.displayOrder,
				createdAt: new Date(data.credential.createdAt * 1000).toISOString(),
				updatedAt: new Date(data.credential.updatedAt * 1000).toISOString()
			};
			onSave?.(updatedCredential);
			onClose();
		} catch (err) {
			// Rollback on failure
			vaultStore.rollback();
			throw err;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Modal backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={handleBackdropClick}>
		<!-- Modal content -->
		<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<div class="modal-header">
				<h2 id="modal-title">{isEditMode ? 'Edit Credential' : 'Add Credential'}</h2>
				<button class="btn-close" onclick={onClose} aria-label="Close modal">×</button>
			</div>

			{#if error}
				<div class="error-message">{error}</div>
			{/if}

			<form onsubmit={handleSubmit}>
				<!-- Type dropdown -->
				<div class="form-group">
					<label for="credential-type">Type</label>
					<select id="credential-type" bind:value={type} disabled={isLoading}>
						{#each credentialTypes as credType}
							<option value={credType.value}>{credType.icon} {credType.label}</option>
						{/each}
					</select>
				</div>

				<!-- Label input -->
				<div class="form-group">
					<label for="credential-label">Label</label>
					<input
						type="text"
						id="credential-label"
						bind:value={label}
						placeholder="e.g., Main account, API key"
						disabled={isLoading}
						required
					/>
				</div>

				<!-- Value input -->
				<div class="form-group">
					<label for="credential-value">Value</label>
					{#if type === 'note'}
						<textarea
							id="credential-value"
							bind:value
							placeholder="Enter your note..."
							disabled={isLoading}
							required
							rows="4"
						></textarea>
					{:else}
						<input
							type={type === 'password' ? 'password' : 'text'}
							id="credential-value"
							bind:value
							placeholder={type === 'password'
								? 'Enter password'
								: type === 'email'
									? 'Enter email'
									: type === 'username'
										? 'Enter username'
										: type === 'totp'
											? 'Enter TOTP secret'
											: 'Enter value'}
							disabled={isLoading}
							required
							autocomplete="off"
						/>
					{/if}
				</div>

				<!-- Actions -->
				<div class="modal-actions">
					<button type="button" class="btn-secondary" onclick={onClose} disabled={isLoading}>
						Cancel
					</button>
					<button type="submit" class="btn-primary" disabled={isLoading}>
						{#if isLoading}
							Saving...
						{:else}
							{isEditMode ? 'Update' : 'Add'} Credential
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.btn-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.btn-close:hover {
		color: var(--color-text-primary);
		background: var(--color-background);
	}

	.error-message {
		margin: 1rem 1.5rem 0;
		padding: 0.75rem 1rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
		color: #ef4444;
		font-size: 0.875rem;
	}

	form {
		padding: 1.5rem;
	}

	.form-group {
		margin-bottom: 1.25rem;
	}

	.form-group label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}

	.form-group input,
	.form-group select,
	.form-group textarea {
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		font-size: 0.9375rem;
		color: var(--color-text-primary);
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-accent-primary);
		box-shadow: 0 0 0 3px var(--color-accent-primary-alpha);
	}

	.form-group input:disabled,
	.form-group select:disabled,
	.form-group textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-group input::placeholder,
	.form-group textarea::placeholder {
		color: var(--color-text-tertiary);
	}

	.form-group textarea {
		resize: vertical;
		min-height: 100px;
		font-family: inherit;
	}

	.form-group select {
		cursor: pointer;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 1rem center;
		padding-right: 2.5rem;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding-top: 0.5rem;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary {
		background: var(--color-accent-primary);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-accent-primary-hover);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--color-background);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-surface);
	}

	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
