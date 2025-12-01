<script lang="ts">
	import { vaultStore, type Credential, type CredentialType } from '$lib/stores/vault.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { decryptFromHexToString } from '$lib/crypto/aes';

	interface Props {
		serviceId: string;
		onAddCredential?: () => void;
		onEditCredential?: (credentialId: string) => void;
	}

	let { serviceId, onAddCredential, onEditCredential }: Props = $props();

	// Get service and credentials from store
	let service = $derived(vaultStore.getService(serviceId));
	let credentials = $derived(vaultStore.getCredentialsForService(serviceId));

	// Track revealed credential values
	let revealedValues = $state<Map<string, string>>(new Map());
	let revealedCredentialIds = $state<Set<string>>(new Set());

	// Track copied credential IDs with timeout
	let copiedCredentialIds = $state<Set<string>>(new Set());
	let copyTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	// Get credential type icon
	function getCredentialIcon(type: CredentialType): string {
		const icons: Record<CredentialType, string> = {
			username: '👤',
			password: '🔑',
			email: '📧',
			totp: '🔐',
			note: '📝',
			custom: '🏷️'
		};
		return icons[type] || '🏷️';
	}

	// Reveal credential value (decrypt)
	async function revealCredential(credential: Credential) {
		try {
			const dek = authStore.getDEK();
			const decryptedValue = decryptFromHexToString(
				credential.encryptedValue,
				dek,
				credential.iv
			);
			revealedValues.set(credential.id, decryptedValue);
			revealedCredentialIds.add(credential.id);
		} catch (error) {
			console.error('Failed to decrypt credential:', error);
			alert('Failed to decrypt credential. Please try again.');
		}
	}

	// Hide credential value
	function hideCredential(credentialId: string) {
		revealedValues.delete(credentialId);
		revealedCredentialIds.delete(credentialId);
	}

	// Toggle credential visibility
	function toggleReveal(credential: Credential) {
		if (revealedCredentialIds.has(credential.id)) {
			hideCredential(credential.id);
		} else {
			revealCredential(credential);
		}
	}

	// Copy credential to clipboard with 30s auto-clear
	async function copyToClipboard(credential: Credential) {
		try {
			// Decrypt if not already revealed
			let value = revealedValues.get(credential.id);
			if (!value) {
				const dek = authStore.getDEK();
				value = decryptFromHexToString(credential.encryptedValue, dek, credential.iv);
			}

			// Copy to clipboard
			await navigator.clipboard.writeText(value);

			// Mark as copied
			copiedCredentialIds.add(credential.id);

			// Clear existing timeout if any
			const existingTimeout = copyTimeouts.get(credential.id);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
			}

			// Set 30s timeout to clear clipboard
			const timeout = setTimeout(async () => {
				try {
					// Clear clipboard by writing empty string
					await navigator.clipboard.writeText('');
					copiedCredentialIds.delete(credential.id);
					copyTimeouts.delete(credential.id);
				} catch {
					// Ignore clipboard clear errors
				}
			}, 30000);

			copyTimeouts.set(credential.id, timeout);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
			alert('Failed to copy to clipboard. Please try again.');
		}
	}

	// Delete credential with confirmation
	function handleDeleteCredential(credential: Credential, event: MouseEvent) {
		event.stopPropagation();

		if (confirm(`Are you sure you want to delete "${credential.label}"?`)) {
			vaultStore.removeCredential(credential.id);
		}
	}

	// Move credential up in order
	function moveCredentialUp(credential: Credential, event: MouseEvent) {
		event.stopPropagation();

		const currentIndex = credentials.findIndex((c) => c.id === credential.id);
		if (currentIndex <= 0) return; // Already at top

		// Swap with previous credential
		const newOrder = credentials.map((c) => c.id);
		[newOrder[currentIndex - 1], newOrder[currentIndex]] = [
			newOrder[currentIndex],
			newOrder[currentIndex - 1]
		];

		vaultStore.reorderCredentials(serviceId, newOrder);
	}

	// Move credential down in order
	function moveCredentialDown(credential: Credential, event: MouseEvent) {
		event.stopPropagation();

		const currentIndex = credentials.findIndex((c) => c.id === credential.id);
		if (currentIndex >= credentials.length - 1) return; // Already at bottom

		// Swap with next credential
		const newOrder = credentials.map((c) => c.id);
		[newOrder[currentIndex], newOrder[currentIndex + 1]] = [
			newOrder[currentIndex + 1],
			newOrder[currentIndex]
		];

		vaultStore.reorderCredentials(serviceId, newOrder);
	}

	// Cleanup timeouts on unmount
	$effect(() => {
		return () => {
			copyTimeouts.forEach((timeout) => clearTimeout(timeout));
			copyTimeouts.clear();
		};
	});
</script>

<div class="service-detail">
	{#if !service}
		<div class="empty-state">
			<p>Service not found</p>
		</div>
	{:else}
		<!-- Service header -->
		<div class="header">
			<div class="service-info">
				{#if service.icon}
					<img src={service.icon} alt="" class="service-icon" />
				{:else}
					<div class="service-icon-placeholder">
						{service.name.charAt(0).toUpperCase()}
					</div>
				{/if}
				<h2>{service.name}</h2>
			</div>
			<button class="btn-primary" onclick={onAddCredential}>
				<span class="icon">+</span>
				Add Credential
			</button>
		</div>

		<!-- Credentials list -->
		<div class="credentials">
			{#if credentials.length === 0}
				<div class="empty-state">
					<p>No credentials yet</p>
					<p class="hint">Add your first credential to get started</p>
					<button class="btn-primary" onclick={onAddCredential}>Add Credential</button>
				</div>
			{:else}
				{#each credentials as credential (credential.id)}
					<div class="credential-item">
						<div class="credential-header">
							<div class="credential-info">
								<span class="credential-icon">{getCredentialIcon(credential.type)}</span>
								<div class="credential-details">
									<h3 class="credential-label">{credential.label}</h3>
									<p class="credential-type">{credential.type}</p>
								</div>
							</div>
							<div class="credential-actions">
								<!-- Reorder buttons -->
								<button
									class="btn-icon"
									onclick={(e) => moveCredentialUp(credential, e)}
									aria-label="Move up"
									title="Move up"
									disabled={credentials.indexOf(credential) === 0}
								>
									↑
								</button>
								<button
									class="btn-icon"
									onclick={(e) => moveCredentialDown(credential, e)}
									aria-label="Move down"
									title="Move down"
									disabled={credentials.indexOf(credential) === credentials.length - 1}
								>
									↓
								</button>
								<!-- Edit button -->
								<button
									class="btn-icon"
									onclick={() => onEditCredential?.(credential.id)}
									aria-label="Edit {credential.label}"
									title="Edit"
								>
									✏️
								</button>
								<!-- Delete button -->
								<button
									class="btn-icon btn-delete"
									onclick={(e) => handleDeleteCredential(credential, e)}
									aria-label="Delete {credential.label}"
									title="Delete"
								>
									🗑️
								</button>
							</div>
						</div>

						<div class="credential-value">
							<!-- Value display (hidden or revealed) -->
							<div class="value-display">
								{#if revealedCredentialIds.has(credential.id)}
									<span class="value-text">{revealedValues.get(credential.id)}</span>
								{:else}
									<span class="value-hidden">••••••••</span>
								{/if}
							</div>

							<!-- Action buttons -->
							<div class="value-actions">
								<button
									class="btn-secondary btn-sm"
									onclick={() => toggleReveal(credential)}
									aria-label={revealedCredentialIds.has(credential.id) ? 'Hide' : 'Reveal'}
								>
									{revealedCredentialIds.has(credential.id) ? '🙈 Hide' : '👁️ Reveal'}
								</button>
								<button
									class="btn-secondary btn-sm"
									onclick={() => copyToClipboard(credential)}
									aria-label="Copy to clipboard"
								>
									{copiedCredentialIds.has(credential.id) ? '✓ Copied' : '📋 Copy'}
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.service-detail {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-surface);
		border-radius: 8px;
		padding: 1.5rem;
		overflow: hidden;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.service-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.service-icon,
	.service-icon-placeholder {
		width: 48px;
		height: 48px;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.service-icon {
		object-fit: cover;
	}

	.service-icon-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-accent-primary);
		color: white;
		font-weight: 600;
		font-size: 1.5rem;
	}

	h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.credentials {
		flex: 1;
		overflow-y: auto;
		margin: 0 -0.5rem;
		padding: 0 0.5rem;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.hint {
		font-size: 0.875rem;
		color: var(--color-text-tertiary);
	}

	.credential-item {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 0.75rem;
		transition: border-color 0.2s;
	}

	.credential-item:hover {
		border-color: var(--color-accent-primary);
	}

	.credential-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}

	.credential-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.credential-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.credential-details {
		flex: 1;
		min-width: 0;
	}

	.credential-label {
		font-size: 1rem;
		font-weight: 500;
		color: var(--color-text-primary);
		margin: 0 0 0.25rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.credential-type {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.credential-actions {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.credential-value {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.value-display {
		flex: 1;
		min-width: 0;
		padding: 0.5rem 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		font-family: 'Monaco', 'Courier New', monospace;
		font-size: 0.875rem;
	}

	.value-text {
		color: var(--color-text-primary);
		word-break: break-all;
	}

	.value-hidden {
		color: var(--color-text-secondary);
		letter-spacing: 2px;
	}

	.value-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.625rem 1.25rem;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-primary {
		background: var(--color-accent-primary);
		color: white;
	}

	.btn-primary:hover {
		background: var(--color-accent-primary-hover);
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.btn-secondary:hover {
		background: var(--color-background);
	}

	.btn-sm {
		padding: 0.5rem 0.75rem;
		font-size: 0.8125rem;
	}

	.btn-icon {
		background: none;
		border: none;
		font-size: 1.125rem;
		cursor: pointer;
		padding: 0.375rem;
		opacity: 0.6;
		transition: opacity 0.2s;
		flex-shrink: 0;
		border-radius: 4px;
	}

	.btn-icon:hover:not(:disabled) {
		opacity: 1;
		background: var(--color-surface);
	}

	.btn-icon:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.btn-icon.btn-delete:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.1);
	}

	.icon {
		font-size: 1.25rem;
		line-height: 1;
	}
</style>
