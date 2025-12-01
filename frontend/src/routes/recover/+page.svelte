<script lang="ts">
  import { validateSeedPhrase, deriveDEKFromSeedPhrase } from '$lib/crypto/seed-phrase';
  import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
  import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
  import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
  import { generateSalt, deriveKeys } from '$lib/crypto/argon2';
  import { wrapKey } from '$lib/crypto/aes';
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  // Utility to convert Uint8Array to base64
  function arrayToBase64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array));
  }

  // Initialize zxcvbn for password strength estimation
  zxcvbnOptions.setOptions({
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    translations: zxcvbnEnPackage.translations,
  });

  // Form state
  let email = $state('');
  let seedPhrase = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let isLoading = $state(false);
  let error = $state('');
  let step = $state<'seed-phrase' | 'new-password'>('seed-phrase');
  let progress = $state(0);
  let progressMessage = $state('');
  
  // Recovered DEK (stored temporarily)
  let recoveredDEK = $state<Uint8Array | null>(null);

  // Password strength using zxcvbn
  let passwordStrength = $derived(() => {
    if (newPassword.length === 0) return { score: 0, label: '', color: '', feedback: '' };
    
    const result = zxcvbn(newPassword, [email]);
    const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];
    
    // Get feedback
    let feedback = '';
    if (result.feedback.warning) {
      feedback = result.feedback.warning;
    } else if (result.feedback.suggestions.length > 0) {
      feedback = result.feedback.suggestions[0];
    }
    
    return {
      score: result.score,
      label: labels[result.score],
      color: colors[result.score],
      feedback,
      crackTime: result.crackTimesDisplay.offlineSlowHashing1e4PerSecond,
    };
  });

  async function handleVerifySeedPhrase(e: Event) {
    e.preventDefault();
    
    // Validate email
    if (!email || !email.includes('@')) {
      error = 'Please enter a valid email address';
      return;
    }

    // Validate seed phrase
    if (!validateSeedPhrase(seedPhrase)) {
      error = 'Invalid seed phrase. Please check your 24-word recovery phrase.';
      return;
    }

    isLoading = true;
    error = '';
    progress = 0;
    progressMessage = 'Verifying seed phrase...';
    
    try {
      // 1. Derive DEK from seed phrase
      progressMessage = 'Deriving recovery key...';
      progress = 20;
      
      recoveredDEK = deriveDEKFromSeedPhrase(seedPhrase);
      
      // 2. Verify account exists
      progressMessage = 'Verifying account...';
      progress = 40;
      
      const saltsResponse = await fetch(`/api/auth/salts/${encodeURIComponent(email.toLowerCase())}`);
      
      if (!saltsResponse.ok) {
        if (saltsResponse.status === 404) {
          throw new Error('Account not found. Please check your email address.');
        }
        throw new Error('Failed to verify account');
      }
      
      progress = 60;
      progressMessage = 'Account verified';
      
      // Move to new password step
      setTimeout(() => {
        step = 'new-password';
        isLoading = false;
        progress = 0;
        progressMessage = '';
      }, 500);
      
    } catch (err) {
      console.error('Seed phrase verification error:', err);
      error = err instanceof Error ? err.message : 'Failed to verify seed phrase. Please try again.';
      isLoading = false;
      progress = 0;
      progressMessage = '';
    }
  }

  async function handleResetPassword(e: Event) {
    e.preventDefault();
    
    // Validation
    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (newPassword.length < 12) {
      error = 'Password must be at least 12 characters';
      return;
    }

    const strength = passwordStrength();
    if (strength.score < 2) {
      error = 'Password is too weak. Please choose a stronger password.';
      return;
    }

    isLoading = true;
    error = '';
    progress = 0;
    progressMessage = 'Resetting password...';
    
    try {
      // 1. Generate new salts
      progressMessage = 'Generating new encryption keys...';
      progress = 10;
      
      const authSalt = generateSalt();
      const kekSalt = generateSalt();
      
      // 2. Derive new AuthHash and KEK from new master password
      progressMessage = 'Deriving encryption keys...';
      progress = 20;
      
      const { authHash, kek } = await deriveKeys(
        newPassword,
        authSalt,
        kekSalt,
        (p) => {
          progress = 20 + Math.floor(p * 40); // 20-60%
          progressMessage = `Deriving encryption keys... ${Math.floor(p * 100)}%`;
        }
      );
      
      // 3. Re-wrap DEK with new KEK
      progressMessage = 'Encrypting vault key...';
      progress = 65;
      
      const { ciphertext: wrappedKeyBytes, iv: wrapIV } = wrapKey(recoveredDEK!, kek);
      
      // Combine wrapped key and IV into single base64 string (format: wrappedKey:iv)
      const wrappedKeyBase64 = arrayToBase64(wrappedKeyBytes);
      const ivBase64 = arrayToBase64(wrapIV);
      const wrappedKeyWithIV = `${wrappedKeyBase64}:${ivBase64}`;
      
      // 4. Call recovery API to update credentials
      progressMessage = 'Updating account...';
      progress = 75;
      
      const recoveryRequest = {
        email: email.toLowerCase(),
        authHash: arrayToBase64(authHash),
        authSalt: arrayToBase64(authSalt),
        kekSalt: arrayToBase64(kekSalt),
        wrappedKey: wrappedKeyWithIV,
      };

      const response = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(recoveryRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Account recovery failed');
      }

      const data = await response.json();
      
      // 5. Store session in auth store
      progressMessage = 'Logging in...';
      progress = 90;
      
      authStore.login({
        userId: data.userId,
        sessionToken: data.sessionToken,
        dek: recoveredDEK!,
        email: email.toLowerCase(),
      });

      // 6. Clear sensitive data
      seedPhrase = '';
      newPassword = '';
      confirmPassword = '';
      recoveredDEK = null;

      progress = 100;
      progressMessage = 'Success!';

      // 7. Redirect to vault
      setTimeout(() => {
        goto('/vault');
      }, 500);
      
    } catch (err) {
      console.error('Password reset error:', err);
      error = err instanceof Error ? err.message : 'Failed to reset password. Please try again.';
      isLoading = false;
      progress = 0;
      progressMessage = '';
    }
  }

  function handleSeedPhraseInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    seedPhrase = target.value;
  }
</script>

<svelte:head>
  <title>Recover Account - Secrets by Codavibe</title>
</svelte:head>

<div class="max-w-md mx-auto px-4 py-16">
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-text-primary mb-2">
      Recover Account
    </h1>
    <p class="text-text-secondary">
      Use your 24-word seed phrase to recover your account
    </p>
  </div>

  <div class="bg-surface border border-border rounded-xl p-6">
    {#if step === 'seed-phrase'}
      {#if error}
        <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      {/if}

      <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
        <p class="text-sm text-blue-600 dark:text-blue-400">
          ℹ️ Enter your 24-word seed phrase to recover access to your vault. This will allow you to set a new master password.
        </p>
      </div>

      <form onsubmit={handleVerifySeedPhrase} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-text-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            bind:value={email}
            required
            disabled={isLoading}
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label for="seedPhrase" class="block text-sm font-medium text-text-secondary mb-1">
            Recovery Seed Phrase (24 words)
          </label>
          <textarea
            id="seedPhrase"
            value={seedPhrase}
            oninput={handleSeedPhraseInput}
            required
            disabled={isLoading}
            rows="6"
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            placeholder="word1 word2 word3 ... word24"
          ></textarea>
          <p class="mt-1 text-xs text-text-muted">
            Enter all 24 words separated by spaces
          </p>
        </div>

        {#if isLoading && progress > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-text-muted">
              <span>{progressMessage}</span>
              <span>{progress}%</span>
            </div>
            <div class="h-2 bg-border rounded-full overflow-hidden">
              <div 
                class="h-full bg-accent-primary transition-all duration-300"
                style="width: {progress}%"
              ></div>
            </div>
          </div>
        {/if}

        <button
          type="submit"
          disabled={isLoading}
          class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Verifying...' : 'Verify Seed Phrase'}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-text-muted">
        Remember your password?
        <a href="/" class="text-accent-primary hover:text-accent-secondary">Sign in</a>
      </p>

    {:else if step === 'new-password'}
      {#if error}
        <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      {/if}

      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-12 h-12 bg-green-500/10 rounded-full mb-3">
          <span class="text-2xl">✓</span>
        </div>
        <h2 class="text-xl font-semibold text-text-primary mb-2">Seed Phrase Verified</h2>
        <p class="text-sm text-text-secondary">
          Now set a new master password for your account
        </p>
      </div>

      <form onsubmit={handleResetPassword} class="space-y-4">
        <div>
          <label for="newPassword" class="block text-sm font-medium text-text-secondary mb-1">
            New Master Password
          </label>
          <input
            type="password"
            id="newPassword"
            bind:value={newPassword}
            required
            minlength="12"
            disabled={isLoading}
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="At least 12 characters"
          />
          {#if newPassword.length > 0}
            <div class="mt-2">
              <div class="flex items-center gap-2 mb-1">
                <div class="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div 
                    class="h-full transition-all {passwordStrength().color}"
                    style="width: {(passwordStrength().score + 1) * 20}%"
                  ></div>
                </div>
                <span class="text-xs text-text-muted font-medium">{passwordStrength().label}</span>
              </div>
              {#if passwordStrength().feedback}
                <p class="text-xs text-text-muted mt-1">{passwordStrength().feedback}</p>
              {/if}
              {#if passwordStrength().score >= 2}
                <p class="text-xs text-green-500 mt-1">
                  Time to crack: {passwordStrength().crackTime}
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-text-secondary mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            bind:value={confirmPassword}
            required
            disabled={isLoading}
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Confirm your new password"
          />
        </div>

        {#if isLoading && progress > 0}
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-text-muted">
              <span>{progressMessage}</span>
              <span>{progress}%</span>
            </div>
            <div class="h-2 bg-border rounded-full overflow-hidden">
              <div 
                class="h-full bg-accent-primary transition-all duration-300"
                style="width: {progress}%"
              ></div>
            </div>
          </div>
        {/if}

        <div class="pt-2 space-y-3">
          <button
            type="submit"
            disabled={isLoading}
            class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Resetting password...' : 'Reset Password & Sign In'}
          </button>
          
          <button
            type="button"
            onclick={() => {
              step = 'seed-phrase';
              recoveredDEK = null;
              error = '';
            }}
            disabled={isLoading}
            class="w-full py-2 text-text-secondary text-sm hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back to Seed Phrase
          </button>
        </div>
      </form>
    {/if}
  </div>

  <div class="mt-8 text-center text-xs text-text-muted">
    <p>🔒 Your seed phrase is never sent to our servers</p>
    <p class="mt-1">It's used locally to recover your encryption key</p>
  </div>
</div>
