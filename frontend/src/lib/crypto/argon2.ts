/**
 * Argon2id Key Derivation Functions
 * 
 * Uses @noble/hashes for audited, minimal cryptographic implementations.
 * Argon2id is the recommended variant combining Argon2i (side-channel resistance)
 * and Argon2d (GPU resistance).
 * 
 * Security Parameters (OWASP recommendations for password hashing):
 * - t (iterations): 2-3 for interactive logins
 * - m (memory): 64MB minimum, 256MB recommended
 * - p (parallelism): 1-4 depending on available cores
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { randomBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Argon2id parameters for different use cases
 */
export const ARGON2_PARAMS = {
  // For deriving AuthHash (sent to server for verification)
  // Lower memory to allow faster login while maintaining security
  AUTH: {
    t: 2,        // 2 iterations
    m: 65536,    // 64 MB memory
    p: 1,        // 1 degree of parallelism
    dkLen: 32,   // 256-bit output
  },
  // For deriving KEK (Key Encryption Key) - higher security
  // Used to wrap/unwrap the DEK locally
  KEK: {
    t: 3,        // 3 iterations
    m: 131072,   // 128 MB memory
    p: 1,        // 1 degree of parallelism
    dkLen: 32,   // 256-bit output for AES-256
  },
} as const;

/**
 * Generate a cryptographically secure random salt
 * @param length - Salt length in bytes (default: 16 bytes / 128 bits)
 * @returns Random salt as Uint8Array
 */
export function generateSalt(length: number = 16): Uint8Array {
  return randomBytes(length);
}

/**
 * Convert salt to hex string for storage
 */
export function saltToHex(salt: Uint8Array): string {
  return bytesToHex(salt);
}

/**
 * Convert hex string back to salt
 */
export function hexToSalt(hex: string): Uint8Array {
  return hexToBytes(hex);
}

/**
 * Derive AuthHash from master password
 * 
 * AuthHash is sent to the server for authentication.
 * The server will hash it again with a pepper before storing.
 * 
 * @param password - User's master password
 * @param salt - Unique salt for this user (authSalt)
 * @returns 32-byte AuthHash as Uint8Array
 */
export function deriveAuthHash(password: string, salt: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  return argon2id(passwordBytes, salt, {
    t: ARGON2_PARAMS.AUTH.t,
    m: ARGON2_PARAMS.AUTH.m,
    p: ARGON2_PARAMS.AUTH.p,
    dkLen: ARGON2_PARAMS.AUTH.dkLen,
  });
}

/**
 * Derive AuthHash asynchronously (for UI responsiveness)
 * Uses setTimeout to yield to the event loop
 */
export async function deriveAuthHashAsync(
  password: string,
  salt: Uint8Array,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  return new Promise((resolve) => {
    // Yield to event loop before heavy computation
    setTimeout(() => {
      onProgress?.(0.1);
      const result = deriveAuthHash(password, salt);
      onProgress?.(1.0);
      resolve(result);
    }, 0);
  });
}

/**
 * Derive KEK (Key Encryption Key) from master password
 * 
 * KEK is used to wrap/unwrap the DEK (Data Encryption Key).
 * This never leaves the client.
 * 
 * @param password - User's master password
 * @param salt - Unique salt for this user (kekSalt)
 * @returns 32-byte KEK as Uint8Array
 */
export function deriveKEK(password: string, salt: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  return argon2id(passwordBytes, salt, {
    t: ARGON2_PARAMS.KEK.t,
    m: ARGON2_PARAMS.KEK.m,
    p: ARGON2_PARAMS.KEK.p,
    dkLen: ARGON2_PARAMS.KEK.dkLen,
  });
}

/**
 * Derive KEK asynchronously (for UI responsiveness)
 */
export async function deriveKEKAsync(
  password: string,
  salt: Uint8Array,
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  return new Promise((resolve) => {
    setTimeout(() => {
      onProgress?.(0.1);
      const result = deriveKEK(password, salt);
      onProgress?.(1.0);
      resolve(result);
    }, 0);
  });
}

/**
 * Derive both AuthHash and KEK from master password
 * 
 * This is the main function used during registration and login.
 * Uses separate salts for AuthHash and KEK for domain separation.
 * 
 * @param password - User's master password
 * @param authSalt - Salt for AuthHash derivation
 * @param kekSalt - Salt for KEK derivation
 * @returns Object containing authHash and kek
 */
export async function deriveKeys(
  password: string,
  authSalt: Uint8Array,
  kekSalt: Uint8Array,
  onProgress?: (progress: number) => void
): Promise<{ authHash: Uint8Array; kek: Uint8Array }> {
  onProgress?.(0);
  
  // Derive AuthHash first
  const authHash = await deriveAuthHashAsync(password, authSalt, (p) => {
    onProgress?.(p * 0.5);
  });
  
  // Then derive KEK
  const kek = await deriveKEKAsync(password, kekSalt, (p) => {
    onProgress?.(0.5 + p * 0.5);
  });
  
  return { authHash, kek };
}

/**
 * Get Argon2 parameters as a serializable object
 * Used for storing parameters alongside encrypted data
 */
export function getArgon2Params(type: 'AUTH' | 'KEK' = 'KEK') {
  const params = ARGON2_PARAMS[type];
  return {
    algorithm: 'argon2id',
    version: 0x13, // Argon2 version 1.3
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
  };
}
