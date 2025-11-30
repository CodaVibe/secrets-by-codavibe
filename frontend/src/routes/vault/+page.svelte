<script lang="ts">
  // Vault page - Password manager main view
  let searchQuery = $state('');
  let selectedServiceId = $state<string | null>(null);
  
  // Placeholder data - will be replaced with actual store data in Phase 10
  let services = $state([
    { id: '1', name: 'GitHub', icon: '🐙', credentialCount: 2 },
    { id: '2', name: 'Google', icon: '🔍', credentialCount: 3 },
    { id: '3', name: 'AWS', icon: '☁️', credentialCount: 1 },
  ]);

  let filteredServices = $derived(
    services.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function selectService(id: string) {
    selectedServiceId = id;
  }
</script>

<svelte:head>
  <title>Vault - Secrets by Codavibe</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-text-primary">Your Vault</h1>
    <button
      class="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-secondary transition-colors"
    >
      + Add Service
    </button>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Services List -->
    <div class="lg:col-span-1">
      <div class="bg-surface border border-border rounded-xl p-4">
        <!-- Search -->
        <div class="mb-4">
          <input
            type="search"
            bind:value={searchQuery}
            placeholder="Search services..."
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
          />
        </div>

        <!-- Service List -->
        <div class="space-y-2">
          {#each filteredServices as service}
            <button
              onclick={() => selectService(service.id)}
              class="w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left
                {selectedServiceId === service.id 
                  ? 'bg-accent-primary/10 border border-accent-primary/20' 
                  : 'hover:bg-surface-elevated border border-transparent'}"
            >
              <span class="text-2xl">{service.icon}</span>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-text-primary truncate">{service.name}</p>
                <p class="text-sm text-text-muted">{service.credentialCount} credentials</p>
              </div>
            </button>
          {:else}
            <p class="text-center text-text-muted py-8">
              {searchQuery ? 'No services found' : 'No services yet'}
            </p>
          {/each}
        </div>
      </div>
    </div>

    <!-- Service Details -->
    <div class="lg:col-span-2">
      <div class="bg-surface border border-border rounded-xl p-6">
        {#if selectedServiceId}
          {@const service = services.find(s => s.id === selectedServiceId)}
          {#if service}
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">{service.icon}</span>
                <h2 class="text-xl font-semibold text-text-primary">{service.name}</h2>
              </div>
              <div class="flex gap-2">
                <button class="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-lg transition-colors">
                  ✏️
                </button>
                <button class="p-2 text-text-secondary hover:text-error hover:bg-error/10 rounded-lg transition-colors">
                  🗑️
                </button>
              </div>
            </div>

            <!-- Credentials List -->
            <div class="space-y-3">
              <div class="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
                <div class="flex-1">
                  <p class="text-sm text-text-muted">Username</p>
                  <p class="font-mono text-text-primary">user@example.com</p>
                </div>
                <button class="px-3 py-1 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors">
                  Copy
                </button>
              </div>

              <div class="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
                <div class="flex-1">
                  <p class="text-sm text-text-muted">Password</p>
                  <p class="font-mono text-text-primary">••••••••••••</p>
                </div>
                <div class="flex gap-2">
                  <button class="px-3 py-1 text-sm bg-surface-elevated text-text-secondary rounded hover:bg-border transition-colors">
                    Show
                  </button>
                  <button class="px-3 py-1 text-sm bg-accent-primary/10 text-accent-primary rounded hover:bg-accent-primary/20 transition-colors">
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <button class="mt-4 w-full py-2 border border-dashed border-border text-text-muted rounded-lg hover:border-accent-primary hover:text-accent-primary transition-colors">
              + Add Credential
            </button>
          {/if}
        {:else}
          <div class="text-center py-16">
            <p class="text-4xl mb-4">🔐</p>
            <p class="text-text-secondary">Select a service to view credentials</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
