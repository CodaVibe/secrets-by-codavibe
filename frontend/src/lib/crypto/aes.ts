/**
 * AES-256-GCM Encryption/Decryption Functions
 * 
 * Uses @noble/ciphers for audited, minimal cryptographic implementations.
 * AES-256-GCM provides authenticated encryption with associated data (AEAD),
 * ensuring both confidentiality and integrity of encrypted data.
 * 
 * Security Properties:
 * - 256-bit key (AES-256)
 * - 96-bit (12 bytes) nonce/IV (recommended for GCM)
 * - 128-bit authentication tag (included in ciphertext)
 * - Authenticated encryption prevents tampering
 * 
 * IMPORTANT: Never reuse a nonce with the same key!
 */

import { gcm } from '@noble/ciphers/aes.js';
import { utf8ToBytes, bytesToUtf8, bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import { randomBytes } from '@noble/hashes/utils.js';

/**
 * AES-GCM configuration constants
 */
export const AES_CONFIG = {
  KEY_LENGTH: 32,      // 256 bits
  NONCE_LENGTH: 12,    // 96 bits (recommended for GCM)
  TAG_LENGTH: 16,      // 128 bits (included in ciphertext by @noble/ciphers)
} as const;

/**
 * Result of encryption operation
 */
export interface EncryptResult {
  /** Encrypted data with authentication tag appended */
  ciphertext: Uint8Array;
  /** Initialization vector (nonce) - must be stored with ciphertext */
  iv: Uint8Array;
}

/**
 * Result of encryption operation with hex encoding
 */
export interface EncryptResultHex {
  /** Encrypted data with authentication tag (hex encoded) */
  ciphertext: string;
  /** Initialization vector (hex encoded) */
  iv: string;
}

/**
 * Generate a cryptographically secure random IV/nonce
 * @returns 12-byte random IV as Uint8Array
 */
export function generateIV(): Uint8Array {
  return randomBytes(AES_CONFIG.NONCE_LENGTH);
}

/**
 * Generate a cryptographically secure random 256-bit key
 * @returns 32-byte random key as Uint8Array
 */
export function generateKey(): Uint8Array {
  return randomBytes(AES_CONFIG.KEY_LENGTH);
}

/**
 * Encrypt plaintext using AES-256-GCM
 * 
 * @param plaintext - Data to encrypt (string or Uint8Array)
 * @param key - 32-byte encryption key
 * @param additionalData - Optional additional authenticated data (AAD)
 * @returns Object containing ciphertext and IV
 * @throws Error if key length is invalid
 */
export function encrypt(
  plaintext: string | Uint8Array,
  key: Uint8Array,
  additionalData?: Uint8Array
): EncryptResult {
  // Validate key length
  if (key.length !== AES_CONFIG.KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${AES_CONFIG.KEY_LENGTH} bytes, got ${key.length}`);
  }

  // Convert string to bytes if needed
  const data = typeof plaintext === 'string' ? utf8ToBytes(plaintext) : plaintext;
  
  // Generate random IV (never reuse with same key!)
  const iv = generateIV();
  
  // Create cipher and encrypt
  const aes = gcm(key, iv, additionalData);
  const ciphertext = aes.encrypt(data);
  
  return { ciphertext, iv };
}

/**
 * Encrypt plaintext and return hex-encoded result
 * Convenience function for storage/transmission
 * 
 * @param plaintext - Data to encrypt (string or Uint8Array)
 * @param key - 32-byte encryption key
 * @param additionalData - Optional additional authenticated data (AAD)
 * @returns Object containing hex-encoded ciphertext and IV
 */
export function encryptToHex(
  plaintext: string | Uint8Array,
  key: Uint8Array,
  additionalData?: Uint8Array
): EncryptResultHex {
  const { ciphertext, iv } = encrypt(plaintext, key, additionalData);
  return {
    ciphertext: bytesToHex(ciphertext),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * 
 * @param ciphertext - Encrypted data with authentication tag
 * @param key - 32-byte encryption key (same as used for encryption)
 * @param iv - Initialization vector used during encryption
 * @param additionalData - Optional additional authenticated data (must match encryption)
 * @returns Decrypted data as Uint8Array
 * @throws Error if key length is invalid or authentication fails
 */
export function decrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array
): Uint8Array {
  // Validate key length
  if (key.length !== AES_CONFIG.KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${AES_CONFIG.KEY_LENGTH} bytes, got ${key.length}`);
  }

  // Validate IV length
  if (iv.length !== AES_CONFIG.NONCE_LENGTH) {
    throw new Error(`Invalid IV length: expected ${AES_CONFIG.NONCE_LENGTH} bytes, got ${iv.length}`);
  }

  // Create cipher and decrypt (will throw if authentication fails)
  const aes = gcm(key, iv, additionalData);
  return aes.decrypt(ciphertext);
}

/**
 * Decrypt ciphertext and return as UTF-8 string
 * 
 * @param ciphertext - Encrypted data with authentication tag
 * @param key - 32-byte encryption key
 * @param iv - Initialization vector used during encryption
 * @param additionalData - Optional additional authenticated data
 * @returns Decrypted data as string
 */
export function decryptToString(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array
): string {
  const decrypted = decrypt(ciphertext, key, iv, additionalData);
  return bytesToUtf8(decrypted);
}

/**
 * Decrypt hex-encoded ciphertext
 * Convenience function for stored/transmitted data
 * 
 * @param ciphertextHex - Hex-encoded encrypted data
 * @param key - 32-byte encryption key
 * @param ivHex - Hex-encoded initialization vector
 * @param additionalData - Optional additional authenticated data
 * @returns Decrypted data as Uint8Array
 */
export function decryptFromHex(
  ciphertextHex: string,
  key: Uint8Array,
  ivHex: string,
  additionalData?: Uint8Array
): Uint8Array {
  const ciphertext = hexToBytes(ciphertextHex);
  const iv = hexToBytes(ivHex);
  return decrypt(ciphertext, key, iv, additionalData);
}

/**
 * Decrypt hex-encoded ciphertext and return as string
 * 
 * @param ciphertextHex - Hex-encoded encrypted data
 * @param key - 32-byte encryption key
 * @param ivHex - Hex-encoded initialization vector
 * @param additionalData - Optional additional authenticated data
 * @returns Decrypted data as string
 */
export function decryptFromHexToString(
  ciphertextHex: string,
  key: Uint8Array,
  ivHex: string,
  additionalData?: Uint8Array
): string {
  const decrypted = decryptFromHex(ciphertextHex, key, ivHex, additionalData);
  return bytesToUtf8(decrypted);
}

/**
 * Wrap a key using AES-256-GCM (key wrapping)
 * Used to encrypt the DEK with the KEK
 * 
 * @param keyToWrap - The key to be wrapped (e.g., DEK)
 * @param wrappingKey - The key used for wrapping (e.g., KEK)
 * @returns Object containing wrapped key and IV
 */
export function wrapKey(
  keyToWrap: Uint8Array,
  wrappingKey: Uint8Array
): EncryptResult {
  return encrypt(keyToWrap, wrappingKey);
}

/**
 * Wrap a key and return hex-encoded result
 * 
 * @param keyToWrap - The key to be wrapped
 * @param wrappingKey - The key used for wrapping
 * @returns Object containing hex-encoded wrapped key and IV
 */
export function wrapKeyToHex(
  keyToWrap: Uint8Array,
  wrappingKey: Uint8Array
): EncryptResultHex {
  return encryptToHex(keyToWrap, wrappingKey);
}

/**
 * Unwrap a key using AES-256-GCM
 * Used to decrypt the DEK with the KEK
 * 
 * @param wrappedKey - The wrapped key (ciphertext)
 * @param wrappingKey - The key used for unwrapping (e.g., KEK)
 * @param iv - Initialization vector used during wrapping
 * @returns The unwrapped key
 */
export function unwrapKey(
  wrappedKey: Uint8Array,
  wrappingKey: Uint8Array,
  iv: Uint8Array
): Uint8Array {
  return decrypt(wrappedKey, wrappingKey, iv);
}

/**
 * Unwrap a hex-encoded key
 * 
 * @param wrappedKeyHex - Hex-encoded wrapped key
 * @param wrappingKey - The key used for unwrapping
 * @param ivHex - Hex-encoded initialization vector
 * @returns The unwrapped key
 */
export function unwrapKeyFromHex(
  wrappedKeyHex: string,
  wrappingKey: Uint8Array,
  ivHex: string
): Uint8Array {
  return decryptFromHex(wrappedKeyHex, wrappingKey, ivHex);
}

/**
 * Utility: Convert bytes to hex string
 */
export { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 };
