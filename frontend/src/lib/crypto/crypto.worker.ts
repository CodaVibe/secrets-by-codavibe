/**
 * Crypto Worker Script - Runs in Web Worker Context
 * 
 * Handles heavy cryptographic operations off the main thread:
 * - Argon2id key derivation (AuthHash, KEK)
 * - AES-256-GCM key wrapping/unwrapping
 * - Secure memory management
 * 
 * Security Properties:
 * - KEK cached in worker memory only
 * - Memory sanitization overwrites sensitive data
 * - No sensitive data returned to main thread after caching
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { gcm } from '@noble/ciphers/aes.js';

// Worker state
let cachedKEK: Uint8Array | null = null;
let supportsSharedArrayBuffer = false;

/**
 * Argon2id parameters
 */
const ARGON2_PARAMS = {
  AUTH: {
    t: 2,        // 2 iterations
    m: 65536,    // 64 MB memory
    p: 1,        // 1 parallelism
    dkLen: 32,   // 256-bit output
  },
  KEK: {
    t: 3,        // 3 iterations
    m: 131072,   // 128 MB memory
    p: 1,        // 1 parallelism
    dkLen: 32,   // 256-bit output
  },
} as const;

/**
 * AES-GCM configuration
 */
const AES_CONFIG = {
  NONCE_LENGTH: 12,  // 96 bits
} as const;

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    let result: unknown;

    switch (type) {
      case 'init':
        supportsSharedArrayBuffer = payload?.supportsSharedArrayBuffer ?? false;
        result = { initialized: true, supportsSharedArrayBuffer };
        break;

      case 'deriveAuthHash':
        result = deriveAuthHash(payload.password, payload.salt, id);
        break;

      case 'deriveKEK':
        result = deriveKEK(payload.password, payload.salt, id);
        break;

      case 'deriveKeys':
        result = deriveKeys(
          payload.password,
          payload.authSalt,
          payload.kekSalt,
          id
        );
        break;

      case 'cacheKEK':
        cacheKEK(payload.kek);
        result = { cached: true };
        break;

      case 'getCachedKEK':
        if (payload?.checkOnly) {
          result = cachedKEK !== null;
        } else {
          // Never return the actual KEK to main thread
          result = cachedKEK !== null;
        }
        break;

      case 'wrapKey':
        result = wrapKey(payload.keyToWrap, payload.wrappingKey);
        break;

      case 'unwrapKey':
        result = unwrapKey(payload.wrappedKey, payload.iv, payload.wrappingKey);
        break;

      case 'sanitize':
        sanitizeMemory();
        result = { sanitized: true };
        break;

      case 'ping':
        result = { pong: true, timestamp: Date.now() };
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, type: 'success', payload: result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Send progress update to main thread
 */
function sendProgress(id: string, progress: number): void {
  self.postMessage({ id, type: 'progress', payload: progress });
}

/**
 * Derive AuthHash from password
 */
function deriveAuthHash(
  password: string,
  salt: Uint8Array,
  requestId: string
): Uint8Array {
  sendProgress(requestId, 0.1);

  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const hash = argon2id(passwordBytes, new Uint8Array(salt), {
    t: ARGON2_PARAMS.AUTH.t,
    m: ARGON2_PARAMS.AUTH.m,
    p: ARGON2_PARAMS.AUTH.p,
    dkLen: ARGON2_PARAMS.AUTH.dkLen,
  });

  sendProgress(requestId, 1.0);

  // Clear password from memory
  passwordBytes.fill(0);

  return hash;
}

/**
 * Derive KEK from password
 */
function deriveKEK(
  password: string,
  salt: Uint8Array,
  requestId: string
): Uint8Array {
  sendProgress(requestId, 0.1);

  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const kek = argon2id(passwordBytes, new Uint8Array(salt), {
    t: ARGON2_PARAMS.KEK.t,
    m: ARGON2_PARAMS.KEK.m,
    p: ARGON2_PARAMS.KEK.p,
    dkLen: ARGON2_PARAMS.KEK.dkLen,
  });

  sendProgress(requestId, 1.0);

  // Clear password from memory
  passwordBytes.fill(0);

  return kek;
}

/**
 * Derive both AuthHash and KEK from password
 */
function deriveKeys(
  password: string,
  authSalt: Uint8Array,
  kekSalt: Uint8Array,
  requestId: string
): { authHash: Uint8Array; kek: Uint8Array } {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  sendProgress(requestId, 0.1);

  // Derive AuthHash
  const authHash = argon2id(passwordBytes, new Uint8Array(authSalt), {
    t: ARGON2_PARAMS.AUTH.t,
    m: ARGON2_PARAMS.AUTH.m,
    p: ARGON2_PARAMS.AUTH.p,
    dkLen: ARGON2_PARAMS.AUTH.dkLen,
  });

  sendProgress(requestId, 0.5);

  // Derive KEK
  const kek = argon2id(passwordBytes, new Uint8Array(kekSalt), {
    t: ARGON2_PARAMS.KEK.t,
    m: ARGON2_PARAMS.KEK.m,
    p: ARGON2_PARAMS.KEK.p,
    dkLen: ARGON2_PARAMS.KEK.dkLen,
  });

  sendProgress(requestId, 1.0);

  // Clear password from memory
  passwordBytes.fill(0);

  return { authHash, kek };
}

/**
 * Cache KEK in worker memory (P18.3)
 */
function cacheKEK(kek: Uint8Array): void {
  // Clear any existing cached KEK first
  if (cachedKEK) {
    cachedKEK.fill(0);
  }

  // Store a copy of the KEK
  cachedKEK = new Uint8Array(kek);
}

/**
 * Wrap a key using AES-256-GCM
 */
function wrapKey(
  keyToWrap: Uint8Array,
  wrappingKey?: Uint8Array
): { wrappedKey: Uint8Array; iv: Uint8Array } {
  const key = wrappingKey ? new Uint8Array(wrappingKey) : cachedKEK;

  if (!key) {
    throw new Error('No wrapping key available');
  }

  const iv = randomBytes(AES_CONFIG.NONCE_LENGTH);
  const aes = gcm(key, iv);
  const wrappedKey = aes.encrypt(new Uint8Array(keyToWrap));

  return { wrappedKey, iv };
}

/**
 * Unwrap a key using AES-256-GCM
 */
function unwrapKey(
  wrappedKey: Uint8Array,
  iv: Uint8Array,
  wrappingKey?: Uint8Array
): Uint8Array {
  const key = wrappingKey ? new Uint8Array(wrappingKey) : cachedKEK;

  if (!key) {
    throw new Error('No wrapping key available');
  }

  const aes = gcm(key, new Uint8Array(iv));
  return aes.decrypt(new Uint8Array(wrappedKey));
}

/**
 * Sanitize worker memory (P18.4)
 * Overwrites sensitive data with random bytes
 */
function sanitizeMemory(): void {
  if (cachedKEK) {
    // Overwrite with random data multiple times
    for (let i = 0; i < 3; i++) {
      const random = randomBytes(cachedKEK.length);
      cachedKEK.set(random);
    }
    // Final zero fill
    cachedKEK.fill(0);
    cachedKEK = null;
  }
}

// Export empty object for TypeScript module compatibility
export {};
