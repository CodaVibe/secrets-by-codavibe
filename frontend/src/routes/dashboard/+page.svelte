<script lang="ts">
  // Dashboard page - Subscription tracking
  
  // Placeholder data - will be replaced with actual store data in Phase 11
  let subscriptions = $state([
    { id: '1', name: 'Netflix', cost: 15.99, currency: 'USD', billingCycle: 'monthly', nextRenewal: '2025-12-15', isTrial: false },
    { id: '2', name: 'Spotify', cost: 9.99, currency: 'USD', billingCycle: 'monthly', nextRenewal: '2025-12-10', isTrial: false },
    { id: '3', name: 'GitHub Pro', cost: 4.00, currency: 'USD', billingCycle: 'monthly', nextRenewal: '2025-12-20', isTrial: true },
    { id: '4', name: 'Adobe CC', cost: 54.99, currency: 'USD', billingCycle: 'monthly', nextRenewal: '2025-12-05', isTrial: false },
  ]);

  let monthlyTotal = $derived(
    subscriptions
      .filter(s => s.billingCycle === 'monthly')
      .reduce((sum, s) => sum + s.cost, 0)
  );

  let yearlyTotal = $derived(monthlyTotal * 12);

  let upcomingRenewals = $derived(
    subscriptions
      .filter(s => {
        const renewalDate = new Date(s.nextRenewal);
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        return renewalDate <= thirtyDaysFromNow;
      })
      .sort((a, b) => new Date(a.nextRenewal).getTime() - new Date(b.nextRenewal).getTime())
  );

  let trials = $derived(subscriptions.filter(s => s.isTrial));
</script>

<svelte:head>
  <title>Dashboard - Secrets by Codavibe</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold text-text-primary">Subscription Dashboard</h1>
    <button
      class="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-secondary transition-colors"
    >
      + Add Subscription
    </button>
  </div>

  <!-- Spending Overview -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
    <div class="bg-surface border border-border rounded-xl p-6">
      <p class="text-sm text-text-muted mb-1">Monthly Spending</p>
      <p class="text-3xl font-bold text-text-primary">${monthlyTotal.toFixed(2)}</p>
      <p class="text-sm text-text-secondary mt-1">USD / month</p>
    </div>
    
    <div class="bg-surface border border-border rounded-xl p-6">
      <p class="text-sm text-text-muted mb-1">Yearly Projection</p>
      <p class="text-3xl font-bold text-text-primary">${yearlyTotal.toFixed(2)}</p>
      <p class="text-sm text-text-secondary mt-1">USD / year</p>
    </div>
    
    <div class="bg-surface border border-border rounded-xl p-6">
      <p class="text-sm text-text-muted mb-1">Upcoming Renewals</p>
      <p class="text-3xl font-bold text-accent-primary">{upcomingRenewals.length}</p>
      <p class="text-sm text-text-secondary mt-1">in next 30 days</p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Subscriptions List -->
    <div class="bg-surface border border-border rounded-xl p-6">
      <h2 class="text-lg font-semibold text-text-primary mb-4">Active Subscriptions</h2>
      
      <div class="space-y-3">
        {#each subscriptions as sub}
          <div class="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-accent-primary/10 rounded-lg flex items-center justify-center text-accent-primary font-bold">
                {sub.name.charAt(0)}
              </div>
              <div>
                <p class="font-medium text-text-primary">
                  {sub.name}
                  {#if sub.isTrial}
                    <span class="ml-2 px-2 py-0.5 text-xs bg-warning/10 text-warning rounded">Trial</span>
                  {/if}
                </p>
                <p class="text-sm text-text-muted">
                  Next: {new Date(sub.nextRenewal).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p class="font-semibold text-text-primary">${sub.cost.toFixed(2)}</p>
              <p class="text-sm text-text-muted">/{sub.billingCycle === 'monthly' ? 'mo' : 'yr'}</p>
            </div>
          </div>
        {:else}
          <p class="text-center text-text-muted py-8">No subscriptions yet</p>
        {/each}
      </div>
    </div>

    <!-- Upcoming Renewals & Trials -->
    <div class="space-y-6">
      <!-- Upcoming Renewals -->
      <div class="bg-surface border border-border rounded-xl p-6">
        <h2 class="text-lg font-semibold text-text-primary mb-4">Upcoming Renewals</h2>
        
        {#if upcomingRenewals.length > 0}
          <div class="space-y-2">
            {#each upcomingRenewals as sub}
              <div class="flex items-center justify-between p-3 bg-background border border-border rounded-lg">
                <div>
                  <p class="font-medium text-text-primary">{sub.name}</p>
                  <p class="text-sm text-text-muted">
                    {new Date(sub.nextRenewal).toLocaleDateString()}
                  </p>
                </div>
                <p class="font-semibold text-accent-primary">${sub.cost.toFixed(2)}</p>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-center text-text-muted py-4">No upcoming renewals</p>
        {/if}
      </div>

      <!-- Trial Warnings -->
      {#if trials.length > 0}
        <div class="bg-warning/5 border border-warning/20 rounded-xl p-6">
          <h2 class="text-lg font-semibold text-warning mb-4">⚠️ Active Trials</h2>
          
          <div class="space-y-2">
            {#each trials as trial}
              <div class="flex items-center justify-between p-3 bg-background border border-warning/20 rounded-lg">
                <div>
                  <p class="font-medium text-text-primary">{trial.name}</p>
                  <p class="text-sm text-text-muted">
                    Ends: {new Date(trial.nextRenewal).toLocaleDateString()}
                  </p>
                </div>
                <p class="text-sm text-warning">Trial ending soon</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
