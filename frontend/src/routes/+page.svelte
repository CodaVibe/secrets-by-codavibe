<script lang="ts">
  import { deriveKeys, hexToSalt } from '$lib/crypto/argon2';
  import { unwrapKeyFromHex } from '$lib/crypto/aes';
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  // Utility to convert base64 to Uint8Array
  function base64ToArray(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Utility to convert Uint8Array to base64
  function arrayToBase64(array: Uint8Array): string {
    return btoa(String.fromCharCode(...array));
  }

  // Form state
  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let error = $state('');
  let progress = $state(0);
  let progressMessage = $state('');

  async function handleLogin(e: Event) {
    e.preventDefault();
    
    isLoading = true;
    error = '';
    progress = 0;
    progressMessage = 'Connecting to server...';
    
    try {
      // 1. Call login API to get user data
      progressMessage = 'Verifying credentials...';
      progress = 10;
      
      const loginRequest = {
        email: email.toLowerCase(),
        authHash: '', // Will be filled after deriving
      };

      // First, we need to get the user's salts from the server
      // We'll send a preliminary request with just the email to get salts
      // But the backend expects authHash, so we need to derive it first
      // Let's fetch the user's salts by attempting login with a dummy hash first
      // Actually, looking at the backend, we need to derive the authHash first
      
      // For now, let's derive with temporary salts and then get the real ones
      // Actually, we need to get salts from somewhere. Let me check the flow...
      
      // The correct flow is:
      // 1. User enters email + password
      // 2. We need authSalt and kekSalt from the server (these are stored during registration)
      // 3. We derive AuthHash using authSalt
      // 4. We send email + AuthHash to /api/auth/login
      // 5. Server returns wrappedKey, kekSalt, authSalt, argon2Params
      // 6. We derive KEK using kekSalt
      // 7. We unwrap DEK using KEK
      
      // But we need salts before we can derive AuthHash...
      // Looking at the backend, it returns salts in the response, not before
      // So we need to derive AuthHash with the salt we stored during registration
      
      // Actually, the backend stores authSalt and kekSalt in the database
      // and returns them in the login response. But we need authHash to login.
      // This is a chicken-and-egg problem.
      
      // Let me re-read the backend code...
      // The backend expects: email + authHash
      // The backend returns: wrappedKey, kekSalt, authSalt, argon2Params
      
      // So the flow must be:
      // 1. Client stores authSalt locally (or gets it from server first)
      // 2. Client derives AuthHash using stored authSalt
      // 3. Client sends email + AuthHash
      // 4. Server verifies and returns wrappedKey + kekSalt
      
      // But we don't store authSalt locally for security reasons...
      // Let me check the design doc...
      
      // Actually, looking at the registration flow, authSalt is sent to the server
      // So the server has it. We need to get it from the server first.
      
      // The solution: We need a GET /api/auth/salts endpoint or similar
      // But that's not in the backend yet...
      
      // Wait, let me re-read the backend login endpoint more carefully...
      // The backend fetches the user by email, then gets auth_salt from the database
      // But it doesn't return it before verification...
      
      // I think the design is:
      // 1. Client needs to remember authSalt (stored in localStorage or similar)
      // 2. Or we need a pre-login endpoint to get salts
      
      // For MVP, let's add a simple endpoint to get salts by email
      // But that's not implemented yet. Let me check if there's another way...
      
      // Actually, looking at the backend response, it DOES return authSalt and kekSalt
      // in the LoginResponse! So the flow is:
      // 1. We need to get authSalt first (before we can derive AuthHash)
      // 2. This requires a separate endpoint
      
      // For now, let me implement assuming we'll add a GET /api/auth/salts/:email endpoint
      // Or we can store salts in localStorage after registration
      
      // Let me check what the registration page does...
      // The registration page generates salts and sends them to the server
      // But doesn't store them locally
      
      // The correct approach: Store salts in localStorage after registration
      // Then retrieve them during login
      
      // But for a zero-knowledge system, we shouldn't store salts locally
      // because they could be used to derive keys offline
      
      // Actually, salts are not secret! They can be public.
      // The security comes from the password + salt combination.
      // So it's fine to store salts locally or fetch them from the server.
      
      // Let's implement a simple approach:
      // 1. Fetch salts from server (we'll need to add this endpoint)
      // 2. Derive AuthHash using authSalt
      // 3. Send login request
      // 4. Derive KEK using kekSalt
      // 5. Unwrap DEK
      
      // For now, let me implement assuming the backend will return salts
      // in a pre-login endpoint. We'll add that next.
      
      // Actually, I just realized: we can make the login endpoint return salts
      // even on failed auth, or we can add a separate endpoint.
      
      // The cleanest approach: Add GET /api/auth/salts/:email endpoint
      // that returns authSalt and kekSalt (these are not secret)
      
      // For now, let me implement the frontend assuming that endpoint exists
      // and we'll add it to the backend next
      
      progressMessage = 'Fetching account information...';
      progress = 20;
      
      const saltsResponse = await fetch(`/api/auth/salts/${encodeURIComponent(email.toLowerCase())}`);
      
      if (!saltsResponse.ok) {
        if (saltsResponse.status === 404) {
          throw new Error('Account not found. Please check your email or register.');
        }
        throw new Error('Failed to fetch account information');
      }
      
      const saltsData = await saltsResponse.json() as {
        authSalt: string;
        kekSalt: string;
      };
      
      // 2. Derive AuthHash and KEK from master password
      progressMessage = 'Deriving encryption keys...';
      progress = 30;
      
      const authSalt = base64ToArray(saltsData.authSalt);
      const kekSalt = base64ToArray(saltsData.kekSalt);
      
      const { authHash, kek } = await deriveKeys(
        password,
        authSalt,
        kekSalt,
        (p) => {
          progress = 30 + Math.floor(p * 40); // 30-70%
          progressMessage = `Deriving encryption keys... ${Math.floor(p * 100)}%`;
        }
      );
      
      // 3. Call login API
      progressMessage = 'Authenticating...';
      progress = 75;
      
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          authHash: arrayToBase64(authHash),
        }),
      });

      if (!loginResponse.ok) {
        const errorData = await loginResponse.json();
        
        if (loginResponse.status === 423) {
          throw new Error(errorData.error || 'Account is locked. Please try again later.');
        }
        
        throw new Error(errorData.error || 'Invalid email or password');
      }

      const loginData = await loginResponse.json() as {
        userId: string;
        sessionToken: string;
        wrappedKey: string;
        kekSalt: string;
        authSalt: string;
        argon2Params: {
          memory: number;
          iterations: number;
          parallelism: number;
        };
      };
      
      // 4. Unwrap DEK using KEK
      progressMessage = 'Decrypting vault key...';
      progress = 85;
      
      // wrappedKey format: "wrappedKeyBase64:ivBase64"
      const [wrappedKeyBase64, ivBase64] = loginData.wrappedKey.split(':');
      
      if (!wrappedKeyBase64 || !ivBase64) {
        throw new Error('Invalid wrapped key format');
      }
      
      // Convert base64 to hex for unwrapKeyFromHex
      const wrappedKeyBytes = base64ToArray(wrappedKeyBase64);
      const ivBytes = base64ToArray(ivBase64);
      
      const wrappedKeyHex = Array.from(wrappedKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      const ivHex = Array.from(ivBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      const dek = unwrapKeyFromHex(wrappedKeyHex, kek, ivHex);
      
      // 5. Store session in auth store
      progressMessage = 'Loading vault...';
      progress = 95;
      
      authStore.login({
        userId: loginData.userId,
        sessionToken: loginData.sessionToken,
        dek: dek,
        email: email.toLowerCase(),
      });

      // 6. Clear sensitive data
      password = '';
      
      progress = 100;
      progressMessage = 'Success!';

      // 7. Redirect to vault
      setTimeout(() => {
        goto('/vault');
      }, 500);
      
    } catch (err) {
      console.error('Login error:', err);
      error = err instanceof Error ? err.message : 'Login failed. Please try again.';
      isLoading = false;
      progress = 0;
      progressMessage = '';
    }
  }
</script>

<svelte:head>
  <title>Login - Secrets by Codavibe</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center px-4 py-16">
  <div class="max-w-md w-full">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-text-primary mb-2">
        🔐 Secrets
      </h1>
      <p class="text-text-secondary">
        Zero-knowledge password manager
      </p>
    </div>

    <div class="bg-surface border border-border rounded-xl p-6">
      {#if error}
        <div class="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
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
            disabled={isLoading}
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
            disabled={isLoading}
            class="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your master password"
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

        <button
          type="submit"
          disabled={isLoading}
          class="w-full py-3 bg-accent-primary text-white font-medium rounded-lg hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div class="mt-6 space-y-3">
        <p class="text-center text-sm text-text-muted">
          Don't have an account?
          <a href="/register" class="text-accent-primary hover:text-accent-secondary">Create one</a>
        </p>
        
        <p class="text-center text-sm text-text-muted">
          Forgot your password?
          <a href="/recover" class="text-accent-primary hover:text-accent-secondary">Recover account</a>
        </p>
      </div>
    </div>

    <div class="mt-8 text-center text-xs text-text-muted">
      <p>🔒 Your data is encrypted end-to-end</p>
      <p class="mt-1">We never see your passwords or master password</p>
    </div>
  </div>
</div>
