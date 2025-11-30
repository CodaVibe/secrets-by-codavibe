/**
 * HMAC Authentication Functions
 * 
 * Uses @noble/hashes for audited, minimal cryptographic implementations.
 * HMAC (Hash-based Message Authentication Code) provides message authentication
 * and integrity verification using a secret key.
 * 
 * Security Properties:
 * - HMAC-SHA256 provides 256-bit security
 * - Constant-time comparison prevents timing attacks
 * - Key should be at least 32 bytes for HMAC-SHA256
 * 
 * Use Cases:
 * - API request authentication
 * - Data integrity verification
 * - Session token validation
 * - Webhook signature verification
 */

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * HMAC configuration constants
 */
export const HMAC_CONFIG = {
  /** Output length in bytes for HMAC-SHA256 */
  OUTPUT_LENGTH: 32,
  /** Minimum recommended key length in bytes */
  MIN_KEY_LENGTH: 32,
  /** Hash algorithm used */
  ALGORITHM: 'HMAC-SHA256',
} as const;

/**
 * Generate an authentication tag (MAC) for a message
 * 
 * @param key - Secret key (Uint8Array, minimum 32 bytes recommended)
 * @param message - Message to authenticate (string or Uint8Array)
 * @returns 32-byte authentication tag as Uint8Array
 * @throws Error if key is too short
 */
export function generateAuthTag(
  key: Uint8Array,
  message: string | Uint8Array
): Uint8Array {
  // Validate key length
  if (key.length < HMAC_CONFIG.MIN_KEY_LENGTH) {
    console.warn(
      `HMAC key length (${key.length} bytes) is less than recommended minimum (${HMAC_CONFIG.MIN_KEY_LENGTH} bytes)`
    );
  }

  // Convert string message to bytes if needed
  const messageBytes = typeof message === 'string' 
    ? utf8ToBytes(message) 
    : message;

  // Generate HMAC-SHA256
  return hmac(sha256, key, messageBytes);
}

/**
 * Generate an authentication tag and return as hex string
 * Convenience function for storage/transmission
 * 
 * @param key - Secret key (Uint8Array)
 * @param message - Message to authenticate (string or Uint8Array)
 * @returns Authentication tag as hex string
 */
export function generateAuthTagHex(
  key: Uint8Array,
  message: string | Uint8Array
): string {
  const tag = generateAuthTag(key, message);
  return bytesToHex(tag);
}

/**
 * Verify an authentication tag using constant-time comparison
 * 
 * IMPORTANT: This function uses constant-time comparison to prevent
 * timing attacks. Never use simple equality (===) for MAC verification.
 * 
 * @param key - Secret key used to generate the original tag
 * @param message - Original message that was authenticated
 * @param tag - Authentication tag to verify (Uint8Array)
 * @returns true if tag is valid, false otherwise
 */
export function verifyAuthTag(
  key: Uint8Array,
  message: string | Uint8Array,
  tag: Uint8Array
): boolean {
  // Generate expected tag
  const expectedTag = generateAuthTag(key, message);

  // Constant-time comparison to prevent timing attacks
  return constantTimeEqual(expectedTag, tag);
}

/**
 * Verify an authentication tag from hex string
 * 
 * @param key - Secret key used to generate the original tag
 * @param message - Original message that was authenticated
 * @param tagHex - Authentication tag as hex string
 * @returns true if tag is valid, false otherwise
 */
export function verifyAuthTagHex(
  key: Uint8Array,
  message: string | Uint8Array,
  tagHex: string
): boolean {
  try {
    const tag = hexToBytes(tagHex);
    return verifyAuthTag(key, message, tag);
  } catch {
    // Invalid hex string
    return false;
  }
}

/**
 * Constant-time comparison of two byte arrays
 * 
 * This prevents timing attacks by ensuring the comparison takes
 * the same amount of time regardless of where the arrays differ.
 * 
 * @param a - First byte array
 * @param b - Second byte array
 * @returns true if arrays are equal, false otherwise
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Length check (this leaks length info, but that's acceptable for MACs)
  if (a.length !== b.length) {
    return false;
  }

  // XOR all bytes and accumulate differences
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }

  // If diff is 0, arrays are equal
  return diff === 0;
}

/**
 * Generate HMAC using streaming API (for large messages)
 * 
 * Useful when the message is too large to fit in memory at once,
 * or when data arrives in chunks.
 * 
 * @param key - Secret key (Uint8Array)
 * @returns HMAC instance with update() and digest() methods
 */
export function createHmac(key: Uint8Array) {
  return hmac.create(sha256, key);
}

/**
 * Sign data with additional context (domain separation)
 * 
 * Adds a context prefix to prevent cross-protocol attacks.
 * Different contexts produce different MACs for the same message.
 * 
 * @param key - Secret key (Uint8Array)
 * @param context - Context string for domain separation (e.g., 'api-auth', 'session-token')
 * @param message - Message to authenticate
 * @returns Authentication tag as Uint8Array
 */
export function signWithContext(
  key: Uint8Array,
  context: string,
  message: string | Uint8Array
): Uint8Array {
  // Create context-prefixed message
  const contextBytes = utf8ToBytes(context);
  const messageBytes = typeof message === 'string' 
    ? utf8ToBytes(message) 
    : message;

  // Use streaming API to combine context and message
  const mac = hmac.create(sha256, key);
  mac.update(contextBytes);
  mac.update(new Uint8Array([0x00])); // Null separator
  mac.update(messageBytes);
  
  return mac.digest();
}

/**
 * Verify data with additional context (domain separation)
 * 
 * @param key - Secret key (Uint8Array)
 * @param context - Context string used during signing
 * @param message - Original message
 * @param tag - Authentication tag to verify
 * @returns true if tag is valid, false otherwise
 */
export function verifyWithContext(
  key: Uint8Array,
  context: string,
  message: string | Uint8Array,
  tag: Uint8Array
): boolean {
  const expectedTag = signWithContext(key, context, message);
  return constantTimeEqual(expectedTag, tag);
}

/**
 * Generate a timestamped authentication tag
 * 
 * Includes a timestamp in the MAC to enable expiration checking.
 * The timestamp is prepended to the message before hashing.
 * 
 * @param key - Secret key (Uint8Array)
 * @param message - Message to authenticate
 * @param timestamp - Unix timestamp in seconds (defaults to current time)
 * @returns Object containing tag and timestamp
 */
export function generateTimestampedAuthTag(
  key: Uint8Array,
  message: string | Uint8Array,
  timestamp: number = Math.floor(Date.now() / 1000)
): { tag: Uint8Array; timestamp: number } {
  // Encode timestamp as 8-byte big-endian
  const timestampBytes = new Uint8Array(8);
  const view = new DataView(timestampBytes.buffer);
  view.setBigUint64(0, BigInt(timestamp), false); // big-endian

  const messageBytes = typeof message === 'string' 
    ? utf8ToBytes(message) 
    : message;

  // Combine timestamp and message
  const mac = hmac.create(sha256, key);
  mac.update(timestampBytes);
  mac.update(messageBytes);

  return {
    tag: mac.digest(),
    timestamp,
  };
}

/**
 * Verify a timestamped authentication tag with expiration check
 * 
 * @param key - Secret key (Uint8Array)
 * @param message - Original message
 * @param tag - Authentication tag to verify
 * @param timestamp - Timestamp from when the tag was generated
 * @param maxAgeSeconds - Maximum age in seconds (default: 300 = 5 minutes)
 * @returns Object with isValid flag and optional error message
 */
export function verifyTimestampedAuthTag(
  key: Uint8Array,
  message: string | Uint8Array,
  tag: Uint8Array,
  timestamp: number,
  maxAgeSeconds: number = 300
): { isValid: boolean; error?: string } {
  // Check timestamp expiration
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  if (age < 0) {
    return { isValid: false, error: 'Timestamp is in the future' };
  }

  if (age > maxAgeSeconds) {
    return { isValid: false, error: `Tag expired (age: ${age}s, max: ${maxAgeSeconds}s)` };
  }

  // Regenerate expected tag
  const { tag: expectedTag } = generateTimestampedAuthTag(key, message, timestamp);

  // Verify tag
  if (!constantTimeEqual(expectedTag, tag)) {
    return { isValid: false, error: 'Invalid authentication tag' };
  }

  return { isValid: true };
}

/**
 * Utility exports for convenience
 */
export { bytesToHex, hexToBytes, utf8ToBytes };
