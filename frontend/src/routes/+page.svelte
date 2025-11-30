<script lang="ts">
  // Landing/Login page
  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let error = $state('');

  async function handleLogin(e: Event) {
    e.preventDefault();
    isLoading = true;
    error = '';
    
    try {
      // TODO: Implement actual login logic in Phase 9
      console.log('Login attempt:', { email });
      // Redirect to vault on success
      // goto('/vault');
    } catch (err) {
      error = 'Invalid email or password';
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Secrets by Codavibe - Zero-Knowledge Password Manager</title>
</svelte:head>

<div class="max-w-md mx-auto px-4 py-16">
  <div class="text-center mb-8">
    <h1 class="text-4xl font-bold text-accent-primary mb-2">
      Secrets by Codavibe
    </h1>
    <p class="text-text-secondary">
      Zero-Knowledge Password Manager
    </p>
  </div>

  <div class="bg-surface border border-border rounded-xl p-6">
    <h2 class="text-xl font-semibold text-text-primary mb-6">Sign In</h2>
    
    {#if error}
      <div class="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
        {error}
      </div>
    {/if}

    <form onsubmit={handleLogin} class="space-y-4">
      <div>
        <label for="email" class="block text-sm font-medium text-text-secondary mb-1">
          Email
        </label>
        <input
          type="email"
          id="email"
          bind:value={email}
          required
          class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
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
          class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent"
          placeholder="••••••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>

    <div class="mt-6 text-center text-sm">
      <p class="text-text-muted">
        Don't have an account?
        <a href="/register" class="text-accent-primary hover:text-accent-secondary">
          Create one
        </a>
      </p>
      <p class="mt-2 text-text-muted">
        <a href="/recover" class="text-accent-primary hover:text-accent-secondary">
          Forgot your password?
        </a>
      </p>
    </div>
  </div>
</div>
