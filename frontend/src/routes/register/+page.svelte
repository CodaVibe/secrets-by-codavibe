<script lang="ts">
  import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
  import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
  import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
  import { generateSeedPhrase, getConfirmationIndices, verifyConfirmation } from '$lib/crypto/seed-phrase';
  import { generateSalt, deriveKeys, ARGON2_PARAMS } from '$lib/crypto/argon2';
  import { generateKey, wrapKey } from '$lib/crypto/aes';
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
  let password = $state('');
  let confirmPassword = $state('');
  let isLoading = $state(false);
  let error = $state('');
  let step = $state<'form' | 'seed-phrase' | 'confirm-seed'>('form');
  
  // Seed phrase state
  let seedPhraseWords = $state<string[]>([]);
  let seedPhraseString = $state('');
  let confirmationIndices = $state<number[]>([]);
  let confirmationInputs = $state<Record<number, string>>({});
  
  // Crypto state (stored temporarily for registration)
  let dek = $state<Uint8Array | null>(null);

  // Password strength using zxcvbn
  let passwordStrength = $derived(() => {
    if (password.length === 0) return { score: 0, label: '', color: '', feedback: '' };
    
    const result = zxcvbn(password, [email]);
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

  async function handleRegister(e: Event) {
    e.preventDefault();
    
    // Validation
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 12) {
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
    
    try {
      // 1. Generate seed phrase and recovery key
      const seedPhraseResult = generateSeedPhrase();
      seedPhraseWords = seedPhraseResult.words;
      seedPhraseString = seedPhraseResult.phrase;
      
      // 2. Generate DEK (Data Encryption Key) - this will be used to encrypt vault data
      dek = generateKey();
      
      // Move to seed phrase display step
      step = 'seed-phrase';
    } catch (err) {
      console.error('Registration error:', err);
      error = 'Failed to generate seed phrase. Please try again.';
    } finally {
      isLoading = false;
    }
  }

  function confirmSeedPhrase() {
    // Generate random indices for confirmation
    confirmationIndices = getConfirmationIndices(24, 3);
    confirmationInputs = {};
    step = 'confirm-seed';
  }

  async function handleConfirmSeedPhrase(e: Event) {
    e.preventDefault();
    
    // Verify confirmation
    if (!verifyConfirmation(seedPhraseString, confirmationInputs)) {
      error = 'Incorrect words. Please check your seed phrase and try again.';
      return;
    }

    isLoading = true;
    error = '';

    try {
      // 1. Generate salts
      const authSalt = generateSalt();
      const kekSalt = generateSalt();
      
      // 2. Derive AuthHash and KEK from master password
      const { authHash, kek } = await deriveKeys(password, authSalt, kekSalt);
      
      // 3. Wrap DEK with KEK
      const { ciphertext: wrappedKeyBytes, iv: wrapIV } = wrapKey(dek!, kek);
      
      // Combine wrapped key and IV into single base64 string (format: wrappedKey:iv)
      const wrappedKeyBase64 = arrayToBase64(wrappedKeyBytes);
      const ivBase64 = arrayToBase64(wrapIV);
      const wrappedKeyWithIV = `${wrappedKeyBase64}:${ivBase64}`;
      
      // 4. Prepare registration request (backend expects base64-encoded values)
      const registerRequest = {
        email: email.toLowerCase(),
        authHash: arrayToBase64(authHash),
        authSalt: arrayToBase64(authSalt),
        kekSalt: arrayToBase64(kekSalt),
        wrappedKey: wrappedKeyWithIV,
        argon2Params: {
          memory: ARGON2_PARAMS.AUTH.m,
          iterations: ARGON2_PARAMS.AUTH.t,
          parallelism: ARGON2_PARAMS.AUTH.p,
        },
      };

      // 5. Call registration API
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerRequest),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Registration failed');
      }

      const data = await response.json();
      
      // 6. Store session in auth store
      authStore.login({
        userId: data.userId,
        sessionToken: data.sessionToken,
        dek: dek!,
        email: email.toLowerCase(),
      });

      // 7. Clear sensitive data
      password = '';
      confirmPassword = '';
      dek = null;

      // 8. Redirect to vault
      goto('/vault');
      
    } catch (err) {
      console.error('Registration error:', err);
      error = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      isLoading = false;
    }
  }

  function handleConfirmationInput(index: number, value: string) {
    confirmationInputs[index] = value.toLowerCase().trim();
  }

  function downloadSeedPhrase() {
    const text = `Secrets by Codavibe - Recovery Seed Phrase\n\nEmail: ${email}\nDate: ${new Date().toISOString()}\n\n${seedPhraseWords.map((word, i) => `${i + 1}. ${word}`).join('\n')}\n\n⚠️ KEEP THIS SAFE! Anyone with this seed phrase can access your vault.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `secrets-recovery-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
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
          class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
        <p class="text-sm text-yellow-600 dark:text-yellow-400">
          ⚠️ Never share your seed phrase. Anyone with these words can access your vault.
        </p>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-6">
        {#each seedPhraseWords as word, i}
          <div class="bg-background border border-border rounded px-2 py-1.5 text-sm">
            <span class="text-text-muted text-xs">{i + 1}.</span>
            <span class="text-text-primary font-mono ml-1">{word}</span>
          </div>
        {/each}
      </div>

      <div class="space-y-3">
        <button
          onclick={downloadSeedPhrase}
          class="w-full py-2.5 bg-background border border-border text-text-primary font-medium rounded-lg hover:bg-surface transition-colors"
        >
          📥 Download Seed Phrase
        </button>
        
        <button
          onclick={confirmSeedPhrase}
          class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors"
        >
          I've Saved It Securely
        </button>
      </div>

    {:else if step === 'confirm-seed'}
      {#if error}
        <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
          {error}
        </div>
      {/if}

      <div class="text-center mb-6">
        <h2 class="text-xl font-semibold text-text-primary mb-2">Confirm Your Seed Phrase</h2>
        <p class="text-sm text-text-secondary">
          Enter the following words from your seed phrase to confirm you've saved it correctly.
        </p>
      </div>

      <form onsubmit={handleConfirmSeedPhrase} class="space-y-4">
        {#each confirmationIndices as index}
          <div>
            <label for="word-{index}" class="block text-sm font-medium text-text-secondary mb-1">
              Word #{index}
            </label>
            <input
              type="text"
              id="word-{index}"
              value={confirmationInputs[index] || ''}
              oninput={(e) => handleConfirmationInput(index, e.currentTarget.value)}
              required
              autocomplete="off"
              class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono"
              placeholder="Enter word {index}"
            />
          </div>
        {/each}

        <div class="pt-2 space-y-3">
          <button
            type="submit"
            disabled={isLoading}
            class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating account...' : 'Confirm & Create Account'}
          </button>
          
          <button
            type="button"
            onclick={() => step = 'seed-phrase'}
            class="w-full py-2 text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            ← Back to Seed Phrase
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
