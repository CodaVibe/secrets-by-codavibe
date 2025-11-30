<script lang="ts">
  // Registration page
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let isLoading = $state(false);
  let error = $state('');
  let step = $state<'form' | 'seed-phrase' | 'confirm-seed'>('form');
  let seedPhrase = $state<string[]>([]);

  // Password strength indicator
  let passwordStrength = $derived(() => {
    if (password.length === 0) return { score: 0, label: '', color: '' };
    if (password.length < 8) return { score: 1, label: 'Too short', color: 'bg-error' };
    if (password.length < 12) return { score: 2, label: 'Weak', color: 'bg-warning' };
    if (password.length < 16) return { score: 3, label: 'Good', color: 'bg-info' };
    return { score: 4, label: 'Strong', color: 'bg-success' };
  });

  async function handleRegister(e: Event) {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 12) {
      error = 'Password must be at least 12 characters';
      return;
    }

    isLoading = true;
    error = '';
    
    try {
      // TODO: Implement actual registration logic in Phase 9
      // Generate seed phrase (placeholder - will use BIP39 in Phase 6)
      seedPhrase = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);
      step = 'seed-phrase';
    } catch (err) {
      error = 'Registration failed. Please try again.';
    } finally {
      isLoading = false;
    }
  }

  function confirmSeedPhrase() {
    // TODO: Implement seed phrase confirmation in Phase 9
    step = 'confirm-seed';
  }
</script>

<svelte:head>
  <title>Register - Secrets by Codavibe</title>
</svelte:head>

<div class="max-w-md mx-auto px-4 py-16">
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-text-primary mb-2">
      Create Account
    </h1>
    <p class="text-text-secondary">
      Your passwords, encrypted with zero knowledge
    </p>
  </div>

  <div class="bg-surface border border-border rounded-xl p-6">
    {#if step === 'form'}
      {#if error}
        <div class="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
          {error}
        </div>
      {/if}

      <form onsubmit={handleRegister} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-text-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            bind:value={email}
            required
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-text-secondary mb-1">
            Master Password
          </label>
          <input
            type="password"
            id="password"
            bind:value={password}
            required
            minlength="12"
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
            placeholder="At least 12 characters"
          />
          {#if password.length > 0}
            <div class="mt-2 flex items-center gap-2">
              <div class="flex-1 h-1 bg-border rounded-full overflow-hidden">
                <div 
                  class="h-full transition-all {passwordStrength().color}"
                  style="width: {passwordStrength().score * 25}%"
                ></div>
              </div>
              <span class="text-xs text-text-muted">{passwordStrength().label}</span>
            </div>
          {/if}
        </div>

        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-text-secondary mb-1">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            bind:value={confirmPassword}
            required
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary"
            placeholder="Confirm your password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-text-muted">
        Already have an account?
        <a href="/" class="text-accent-primary hover:text-accent-secondary">Sign in</a>
      </p>

    {:else if step === 'seed-phrase'}
      <div class="text-center mb-6">
        <h2 class="text-xl font-semibold text-text-primary mb-2">Recovery Seed Phrase</h2>
        <p class="text-sm text-text-secondary">
          Write down these 24 words in order. You'll need them to recover your account.
        </p>
      </div>

      <div class="bg-warning/10 border border-warning/20 rounded-lg p-4 mb-6">
        <p class="text-sm text-warning">
          ⚠️ Never share your seed phrase. Anyone with these words can access your vault.
        </p>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-6">
        {#each seedPhrase as word, i}
          <div class="bg-background border border-border rounded px-2 py-1 text-sm">
            <span class="text-text-muted">{i + 1}.</span>
            <span class="text-text-primary font-mono">{word}</span>
          </div>
        {/each}
      </div>

      <button
        onclick={confirmSeedPhrase}
        class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors"
      >
        I've written it down
      </button>

    {:else if step === 'confirm-seed'}
      <div class="text-center">
        <div class="text-4xl mb-4">✅</div>
        <h2 class="text-xl font-semibold text-text-primary mb-2">Account Created!</h2>
        <p class="text-sm text-text-secondary mb-6">
          Your account has been created successfully. You can now sign in.
        </p>
        <a
          href="/"
          class="inline-block w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors text-center"
        >
          Go to Sign In
        </a>
      </div>
    {/if}
  </div>
</div>
