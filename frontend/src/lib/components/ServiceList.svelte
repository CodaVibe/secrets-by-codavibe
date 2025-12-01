<script lang="ts">
	import { vaultStore } from '$lib/stores/vault.svelte';
	import type { Service } from '$lib/stores/vault.svelte';

	interface Props {
		onAddService?: () => void;
		onSelectService?: (serviceId: string) => void;
	}

	let { onAddService, onSelectService }: Props = $props();

	// Local state for search
	let searchQuery = $state('');

	// Derived: filtered services based on search
	let filteredServices = $derived(
		searchQuery.trim() ? vaultStore.searchServices(searchQuery) : vaultStore.services
	);

	// Handle service selection
	function handleSelectService(serviceId: string) {
		vaultStore.selectService(serviceId);
		onSelectService?.(serviceId);
	}

	// Handle service deletion with confirmation
	function handleDeleteService(service: Service, event: MouseEvent) {
		event.stopPropagation(); // Prevent service selection
		
		if (confirm(`Are you sure you want to delete "${service.name}" and all its credentials?`)) {
			vaultStore.removeService(service.id);
		}
	}

	// Clear search
	function clearSearch() {
		searchQuery = '';
	}
</script>

<div class="service-list">
	<!-- Header with search and add button -->
	<div class="header">
		<h2>Services</h2>
		<button class="btn-primary" onclick={onAddService}>
			<span class="icon">+</span>
			Add Service
		</button>
	</div>

	<!-- Search bar -->
	<div class="search-bar">
		<input
			type="text"
			placeholder="Search services..."
			bind:value={searchQuery}
			class="search-input"
		/>
		{#if searchQuery}
			<button class="btn-clear" onclick={clearSearch} aria-label="Clear search">
				×
			</button>
		{/if}
	</div>

	<!-- Service count -->
	<div class="service-count">
		{filteredServices.length} {filteredServices.length === 1 ? 'service' : 'services'}
		{#if searchQuery}
			<span class="search-info">(filtered from {vaultStore.serviceCount})</span>
		{/if}
	</div>

	<!-- Services list -->
	<div class="services">
		{#if vaultStore.isLoading}
			<div class="loading">Loading services...</div>
		{:else if filteredServices.length === 0}
			<div class="empty-state">
				{#if searchQuery}
					<p>No services found matching "{searchQuery}"</p>
					<button class="btn-secondary" onclick={clearSearch}>Clear search</button>
				{:else}
					<p>No services yet</p>
					<p class="hint">Add your first service to get started</p>
					<button class="btn-primary" onclick={onAddService}>Add Service</button>
				{/if}
			</div>
		{:else}
			{#each filteredServices as service (service.id)}
				<div
					class="service-item"
					class:selected={vaultStore.selectedServiceId === service.id}
					onclick={() => handleSelectService(service.id)}
					role="button"
					tabindex="0"
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleSelectService(service.id);
						}
					}}
				>
					<div class="service-info">
						{#if service.icon}
							<img src={service.icon} alt="" class="service-icon" />
						{:else}
							<div class="service-icon-placeholder">
								{service.name.charAt(0).toUpperCase()}
							</div>
						{/if}
						<div class="service-details">
							<h3 class="service-name">{service.name}</h3>
							<p class="service-meta">
								{vaultStore.getCredentialsForService(service.id).length} credentials
							</p>
						</div>
					</div>
					<button
						class="btn-delete"
						onclick={(e) => handleDeleteService(service, e)}
						aria-label="Delete {service.name}"
					>
						🗑️
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.service-list {
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
	}

	h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.search-bar {
		position: relative;
		margin-bottom: 1rem;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 2.5rem 0.75rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-size: 0.875rem;
		transition: border-color 0.2s;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-accent-primary);
	}

	.btn-clear {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		line-height: 1;
		transition: color 0.2s;
	}

	.btn-clear:hover {
		color: var(--color-text-primary);
	}

	.service-count {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: 1rem;
	}

	.search-info {
		color: var(--color-text-tertiary);
	}

	.services {
		flex: 1;
		overflow-y: auto;
		margin: 0 -0.5rem;
		padding: 0 0.5rem;
	}

	.loading,
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

	.service-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		margin-bottom: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-background);
		cursor: pointer;
		transition: all 0.2s;
	}

	.service-item:hover {
		border-color: var(--color-accent-primary);
		background: var(--color-surface);
	}

	.service-item.selected {
		border-color: var(--color-accent-primary);
		background: var(--color-accent-primary-alpha);
	}

	.service-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
		min-width: 0;
	}

	.service-icon,
	.service-icon-placeholder {
		width: 40px;
		height: 40px;
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
		font-size: 1.25rem;
	}

	.service-details {
		flex: 1;
		min-width: 0;
	}

	.service-name {
		font-size: 1rem;
		font-weight: 500;
		color: var(--color-text-primary);
		margin: 0 0 0.25rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.service-meta {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.btn-delete {
		background: none;
		border: none;
		font-size: 1.25rem;
		cursor: pointer;
		padding: 0.5rem;
		opacity: 0.6;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}

	.btn-delete:hover {
		opacity: 1;
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

	.icon {
		font-size: 1.25rem;
		line-height: 1;
	}
</style>
