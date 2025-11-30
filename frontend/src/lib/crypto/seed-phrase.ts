/**
 * BIP39 Seed Phrase Generation and Recovery Functions
 * 
 * Uses @scure/bip39 for audited, minimal BIP39 implementation.
 * This module provides seed phrase generation for account recovery,
 * allowing users to recover their DEK without the master password.
 * 
 * Security Properties:
 * - 256-bit entropy for 24-word phrases (maximum security)
 * - BIP39 standard wordlist (2048 English words)
 * - Seed phrase never stored on server (user responsibility)
 * - PBKDF2-HMAC-SHA512 for seed derivation (2048 iterations)
 * 
 * Recovery Flow:
 * 1. User enters 24-word seed phrase
 * 2. Derive recovery key from seed phrase
 * 3. Use recovery key to decrypt wrapped DEK
 * 4. User sets new master password
 * 5. Re-encrypt DEK with new KEK
 */

import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  mnemonicToEntropy,
  entropyToMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Seed phrase configuration
 */
export const SEED_PHRASE_CONFIG = {
  /** Number of words in the seed phrase (24 = 256-bit entropy) */
  WORD_COUNT: 24,
  /** Entropy bits for 24 words */
  ENTROPY_BITS: 256,
  /** Derived key length in bytes */
  DERIVED_KEY_LENGTH: 32,
  /** Application-specific info for HKDF */
  HKDF_INFO: 'secrets-by-codavibe-recovery-key',
} as const;

/**
 * Result of seed phrase generation
 */
export interface SeedPhraseResult {
  /** The 24-word mnemonic phrase */
  phrase: string;
  /** Array of individual words */
  words: string[];
  /** The derived recovery key (32 bytes) */
  recoveryKey: Uint8Array;
}

/**
 * Generate a new 24-word BIP39 seed phrase
 * 
 * Uses cryptographically secure random number generation.
 * The seed phrase should be displayed once and saved by the user.
 * 
 * @returns Object containing phrase, words array, and derived recovery key
 */
export function generateSeedPhrase(): SeedPhraseResult {
  // Generate 24-word mnemonic (256-bit entropy)
  const phrase = generateMnemonic(wordlist, SEED_PHRASE_CONFIG.ENTROPY_BITS);
  const words = phrase.split(' ');
  
  // Derive recovery key from seed phrase
  const recoveryKey = deriveDEKFromSeedPhrase(phrase);
  
  return {
    phrase,
    words,
    recoveryKey,
  };
}

/**
 * Validate a BIP39 seed phrase
 * 
 * Checks that:
 * - All words are in the BIP39 wordlist
 * - Checksum is valid
 * - Word count is correct (12, 15, 18, 21, or 24 words)
 * 
 * @param phrase - The seed phrase to validate (space-separated words)
 * @returns true if valid, false otherwise
 */
export function validateSeedPhrase(phrase: string): boolean {
  if (!phrase || typeof phrase !== 'string') {
    return false;
  }
  
  // Normalize whitespace
  const normalizedPhrase = normalizePhrase(phrase);
  
  // Validate using BIP39 library
  return validateMnemonic(normalizedPhrase, wordlist);
}

/**
 * Validate seed phrase and check word count
 * 
 * @param phrase - The seed phrase to validate
 * @param expectedWordCount - Expected number of words (default: 24)
 * @returns Object with isValid flag and error message if invalid
 */
export function validateSeedPhraseStrict(
  phrase: string,
  expectedWordCount: number = SEED_PHRASE_CONFIG.WORD_COUNT
): { isValid: boolean; error?: string } {
  if (!phrase || typeof phrase !== 'string') {
    return { isValid: false, error: 'Seed phrase is required' };
  }
  
  const normalizedPhrase = normalizePhrase(phrase);
  const words = normalizedPhrase.split(' ');
  
  // Check word count
  if (words.length !== expectedWordCount) {
    return {
      isValid: false,
      error: `Expected ${expectedWordCount} words, got ${words.length}`,
    };
  }
  
  // Check each word is in wordlist
  const invalidWords = words.filter(word => !wordlist.includes(word));
  if (invalidWords.length > 0) {
    return {
      isValid: false,
      error: `Invalid words: ${invalidWords.slice(0, 3).join(', ')}${invalidWords.length > 3 ? '...' : ''}`,
    };
  }
  
  // Validate checksum
  if (!validateMnemonic(normalizedPhrase, wordlist)) {
    return { isValid: false, error: 'Invalid checksum' };
  }
  
  return { isValid: true };
}

/**
 * Derive DEK (Data Encryption Key) from seed phrase
 * 
 * Uses BIP39 seed derivation (PBKDF2-HMAC-SHA512) followed by
 * HKDF to derive a 32-byte key suitable for AES-256.
 * 
 * @param phrase - The 24-word seed phrase
 * @param passphrase - Optional BIP39 passphrase (default: empty)
 * @returns 32-byte DEK as Uint8Array
 * @throws Error if seed phrase is invalid
 */
export function deriveDEKFromSeedPhrase(
  phrase: string,
  passphrase: string = ''
): Uint8Array {
  const normalizedPhrase = normalizePhrase(phrase);
  
  // Validate before deriving
  if (!validateMnemonic(normalizedPhrase, wordlist)) {
    throw new Error('Invalid seed phrase');
  }
  
  // Derive BIP39 seed (64 bytes) using PBKDF2-HMAC-SHA512
  const seed = mnemonicToSeedSync(normalizedPhrase, passphrase);
  
  // Use HKDF to derive a 32-byte key from the seed
  // This provides domain separation for our specific use case
  const info = new TextEncoder().encode(SEED_PHRASE_CONFIG.HKDF_INFO);
  const recoveryKey = hkdf(sha256, seed, undefined, info, SEED_PHRASE_CONFIG.DERIVED_KEY_LENGTH);
  
  return recoveryKey;
}

/**
 * Derive DEK asynchronously (for UI responsiveness)
 * 
 * @param phrase - The 24-word seed phrase
 * @param passphrase - Optional BIP39 passphrase
 * @param onProgress - Optional progress callback
 * @returns Promise resolving to 32-byte DEK
 */
export async function deriveDEKFromSeedPhraseAsync(
  phrase: string,
  passphrase: string = '',
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        onProgress?.(0.1);
        const result = deriveDEKFromSeedPhrase(phrase, passphrase);
        onProgress?.(1.0);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

/**
 * Get random word indices for seed phrase confirmation
 * 
 * During registration, users should confirm their seed phrase
 * by entering specific words at random positions.
 * 
 * @param wordCount - Total number of words in the phrase
 * @param confirmCount - Number of words to confirm (default: 3)
 * @returns Array of 1-based word indices to confirm
 */
export function getConfirmationIndices(
  wordCount: number = SEED_PHRASE_CONFIG.WORD_COUNT,
  confirmCount: number = 3
): number[] {
  const indices: number[] = [];
  const available = Array.from({ length: wordCount }, (_, i) => i + 1);
  
  // Use crypto.getRandomValues for secure random selection
  const randomValues = new Uint32Array(confirmCount);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < confirmCount; i++) {
    const randomIndex = randomValues[i] % available.length;
    indices.push(available[randomIndex]);
    available.splice(randomIndex, 1);
  }
  
  // Sort indices for better UX
  return indices.sort((a, b) => a - b);
}

/**
 * Verify user's confirmation of seed phrase words
 * 
 * @param phrase - The original seed phrase
 * @param confirmations - Object mapping 1-based indices to user-entered words
 * @returns true if all confirmations match
 */
export function verifyConfirmation(
  phrase: string,
  confirmations: Record<number, string>
): boolean {
  const words = normalizePhrase(phrase).split(' ');
  
  for (const [indexStr, enteredWord] of Object.entries(confirmations)) {
    const index = parseInt(indexStr, 10) - 1; // Convert to 0-based
    if (index < 0 || index >= words.length) {
      return false;
    }
    if (words[index].toLowerCase() !== enteredWord.toLowerCase().trim()) {
      return false;
    }
  }
  
  return true;
}

/**
 * Convert entropy to mnemonic phrase
 * Useful for deterministic testing
 * 
 * @param entropy - 32 bytes of entropy for 24 words
 * @returns The mnemonic phrase
 */
export function entropyToPhrase(entropy: Uint8Array): string {
  return entropyToMnemonic(entropy, wordlist);
}

/**
 * Convert mnemonic phrase to entropy
 * 
 * @param phrase - The mnemonic phrase
 * @returns The entropy bytes
 */
export function phraseToEntropy(phrase: string): Uint8Array {
  const normalizedPhrase = normalizePhrase(phrase);
  return mnemonicToEntropy(normalizedPhrase, wordlist);
}

/**
 * Get a word from the BIP39 wordlist by index
 * 
 * @param index - Word index (0-2047)
 * @returns The word at that index
 */
export function getWordByIndex(index: number): string {
  if (index < 0 || index >= wordlist.length) {
    throw new Error(`Invalid word index: ${index}. Must be 0-2047.`);
  }
  return wordlist[index];
}

/**
 * Get the index of a word in the BIP39 wordlist
 * 
 * @param word - The word to look up
 * @returns The index (0-2047) or -1 if not found
 */
export function getWordIndex(word: string): number {
  return wordlist.indexOf(word.toLowerCase().trim());
}

/**
 * Get autocomplete suggestions for partial word input
 * 
 * @param partial - Partial word input
 * @param maxSuggestions - Maximum number of suggestions (default: 5)
 * @returns Array of matching words from the wordlist
 */
export function getWordSuggestions(
  partial: string,
  maxSuggestions: number = 5
): string[] {
  if (!partial || partial.length < 1) {
    return [];
  }
  
  const normalizedPartial = partial.toLowerCase().trim();
  const suggestions: string[] = [];
  
  for (const word of wordlist) {
    if (word.startsWith(normalizedPartial)) {
      suggestions.push(word);
      if (suggestions.length >= maxSuggestions) {
        break;
      }
    }
  }
  
  return suggestions;
}

/**
 * Normalize a seed phrase (lowercase, single spaces, trimmed)
 * 
 * @param phrase - The phrase to normalize
 * @returns Normalized phrase
 */
export function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Format seed phrase for display (groups of 4 words)
 * 
 * @param phrase - The seed phrase
 * @returns Array of word groups for display
 */
export function formatPhraseForDisplay(phrase: string): string[][] {
  const words = normalizePhrase(phrase).split(' ');
  const groups: string[][] = [];
  
  for (let i = 0; i < words.length; i += 4) {
    groups.push(words.slice(i, i + 4));
  }
  
  return groups;
}

/**
 * Export the wordlist for external use (e.g., validation UI)
 */
export { wordlist as BIP39_WORDLIST };

/**
 * Utility exports
 */
export { bytesToHex, hexToBytes };
