/**
 * Tests for BIP39 Seed Phrase Generation and Recovery
 * 
 * Tests cover:
 * - Seed phrase generation (24 words)
 * - Seed phrase validation
 * - DEK derivation from seed phrase
 * - Confirmation flow
 * - Word suggestions and autocomplete
 * - Known test vectors
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSeedPhrase,
  validateSeedPhrase,
  validateSeedPhraseStrict,
  deriveDEKFromSeedPhrase,
  deriveDEKFromSeedPhraseAsync,
  getConfirmationIndices,
  verifyConfirmation,
  entropyToPhrase,
  phraseToEntropy,
  getWordByIndex,
  getWordIndex,
  getWordSuggestions,
  normalizePhrase,
  formatPhraseForDisplay,
  SEED_PHRASE_CONFIG,
  BIP39_WORDLIST,
  bytesToHex,
  hexToBytes,
} from './seed-phrase';

describe('Seed Phrase Generation', () => {
  it('should generate a 24-word seed phrase', () => {
    const result = generateSeedPhrase();
    
    expect(result.words).toHaveLength(24);
    expect(result.phrase.split(' ')).toHaveLength(24);
  });

  it('should generate unique phrases on each call', () => {
    const result1 = generateSeedPhrase();
    const result2 = generateSeedPhrase();
    
    expect(result1.phrase).not.toBe(result2.phrase);
  });

  it('should generate valid BIP39 phrases', () => {
    const result = generateSeedPhrase();
    
    expect(validateSeedPhrase(result.phrase)).toBe(true);
  });

  it('should include recovery key in result', () => {
    const result = generateSeedPhrase();
    
    expect(result.recoveryKey).toBeInstanceOf(Uint8Array);
    expect(result.recoveryKey.length).toBe(32);
  });

  it('should derive consistent recovery key from same phrase', () => {
    const result = generateSeedPhrase();
    const recoveryKey2 = deriveDEKFromSeedPhrase(result.phrase);
    
    expect(bytesToHex(result.recoveryKey)).toBe(bytesToHex(recoveryKey2));
  });
});

describe('Seed Phrase Validation', () => {
  // Known valid test vector from BIP39 spec
  const validPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const valid24WordPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

  it('should validate correct 12-word phrase', () => {
    expect(validateSeedPhrase(validPhrase)).toBe(true);
  });

  it('should validate correct 24-word phrase', () => {
    expect(validateSeedPhrase(valid24WordPhrase)).toBe(true);
  });

  it('should reject invalid checksum', () => {
    const invalidPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(validateSeedPhrase(invalidPhrase)).toBe(false);
  });

  it('should reject words not in wordlist', () => {
    const invalidPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon xyz123';
    expect(validateSeedPhrase(invalidPhrase)).toBe(false);
  });

  it('should reject empty string', () => {
    expect(validateSeedPhrase('')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(validateSeedPhrase(null as any)).toBe(false);
    expect(validateSeedPhrase(undefined as any)).toBe(false);
  });

  it('should handle extra whitespace', () => {
    const phraseWithSpaces = '  abandon   abandon  abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ';
    expect(validateSeedPhrase(phraseWithSpaces)).toBe(true);
  });

  it('should be case-insensitive', () => {
    const upperPhrase = 'ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT';
    expect(validateSeedPhrase(upperPhrase)).toBe(true);
  });
});

describe('Strict Validation', () => {
  const valid24WordPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

  it('should pass for valid 24-word phrase', () => {
    const result = validateSeedPhraseStrict(valid24WordPhrase, 24);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail for wrong word count', () => {
    const result = validateSeedPhraseStrict('abandon abandon abandon', 24);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Expected 24 words');
  });

  it('should fail for invalid words', () => {
    const invalidPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon xyz123';
    const result = validateSeedPhraseStrict(invalidPhrase, 24);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid words');
  });

  it('should fail for invalid checksum', () => {
    const invalidPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    const result = validateSeedPhraseStrict(invalidPhrase, 24);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid checksum');
  });

  it('should fail for empty input', () => {
    const result = validateSeedPhraseStrict('');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Seed phrase is required');
  });
});

describe('DEK Derivation', () => {
  const testPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('should derive 32-byte key', () => {
    const dek = deriveDEKFromSeedPhrase(testPhrase);
    
    expect(dek).toBeInstanceOf(Uint8Array);
    expect(dek.length).toBe(32);
  });

  it('should derive consistent key from same phrase', () => {
    const dek1 = deriveDEKFromSeedPhrase(testPhrase);
    const dek2 = deriveDEKFromSeedPhrase(testPhrase);
    
    expect(bytesToHex(dek1)).toBe(bytesToHex(dek2));
  });

  it('should derive different keys from different phrases', () => {
    // Both phrases must be valid BIP39 (correct checksum)
    const phrase2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
    
    const dek1 = deriveDEKFromSeedPhrase(testPhrase);
    const dek2 = deriveDEKFromSeedPhrase(phrase2);
    
    expect(bytesToHex(dek1)).not.toBe(bytesToHex(dek2));
  });

  it('should derive different keys with different passphrases', () => {
    const dek1 = deriveDEKFromSeedPhrase(testPhrase, '');
    const dek2 = deriveDEKFromSeedPhrase(testPhrase, 'password');
    
    expect(bytesToHex(dek1)).not.toBe(bytesToHex(dek2));
  });

  it('should throw for invalid phrase', () => {
    expect(() => deriveDEKFromSeedPhrase('invalid phrase')).toThrow('Invalid seed phrase');
  });

  it('should work with async version', async () => {
    const dek = await deriveDEKFromSeedPhraseAsync(testPhrase);
    const dekSync = deriveDEKFromSeedPhrase(testPhrase);
    
    expect(bytesToHex(dek)).toBe(bytesToHex(dekSync));
  });

  it('should call progress callback in async version', async () => {
    const progressValues: number[] = [];
    await deriveDEKFromSeedPhraseAsync(testPhrase, '', (p) => progressValues.push(p));
    
    expect(progressValues.length).toBeGreaterThan(0);
    expect(progressValues[progressValues.length - 1]).toBe(1.0);
  });
});

describe('Confirmation Flow', () => {
  it('should generate correct number of confirmation indices', () => {
    const indices = getConfirmationIndices(24, 3);
    
    expect(indices).toHaveLength(3);
  });

  it('should generate indices within valid range', () => {
    const indices = getConfirmationIndices(24, 3);
    
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(24);
    }
  });

  it('should generate unique indices', () => {
    const indices = getConfirmationIndices(24, 3);
    const uniqueIndices = new Set(indices);
    
    expect(uniqueIndices.size).toBe(3);
  });

  it('should return sorted indices', () => {
    const indices = getConfirmationIndices(24, 3);
    
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('should verify correct confirmations', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const confirmations = { 1: 'abandon', 6: 'abandon', 12: 'about' };
    
    expect(verifyConfirmation(phrase, confirmations)).toBe(true);
  });

  it('should reject incorrect confirmations', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const confirmations = { 1: 'abandon', 6: 'abandon', 12: 'wrong' };
    
    expect(verifyConfirmation(phrase, confirmations)).toBe(false);
  });

  it('should be case-insensitive for confirmations', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const confirmations = { 1: 'ABANDON', 12: 'ABOUT' };
    
    expect(verifyConfirmation(phrase, confirmations)).toBe(true);
  });

  it('should handle whitespace in confirmations', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const confirmations = { 1: '  abandon  ', 12: ' about ' };
    
    expect(verifyConfirmation(phrase, confirmations)).toBe(true);
  });
});

describe('Entropy Conversion', () => {
  it('should convert entropy to phrase and back', () => {
    const entropy = new Uint8Array(32);
    crypto.getRandomValues(entropy);
    
    const phrase = entropyToPhrase(entropy);
    const recoveredEntropy = phraseToEntropy(phrase);
    
    expect(bytesToHex(recoveredEntropy)).toBe(bytesToHex(entropy));
  });

  it('should generate valid phrase from entropy', () => {
    const entropy = new Uint8Array(32);
    crypto.getRandomValues(entropy);
    
    const phrase = entropyToPhrase(entropy);
    
    expect(validateSeedPhrase(phrase)).toBe(true);
    expect(phrase.split(' ')).toHaveLength(24);
  });

  // Known test vector from BIP39 spec
  it('should match BIP39 test vector', () => {
    // All zeros entropy should produce known phrase
    const entropy = new Uint8Array(16); // 12 words
    const phrase = entropyToPhrase(entropy);
    
    expect(phrase).toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  });
});

describe('Wordlist Functions', () => {
  it('should get word by index', () => {
    expect(getWordByIndex(0)).toBe('abandon');
    expect(getWordByIndex(2047)).toBe('zoo');
  });

  it('should throw for invalid index', () => {
    expect(() => getWordByIndex(-1)).toThrow('Invalid word index');
    expect(() => getWordByIndex(2048)).toThrow('Invalid word index');
  });

  it('should get index by word', () => {
    expect(getWordIndex('abandon')).toBe(0);
    expect(getWordIndex('zoo')).toBe(2047);
  });

  it('should return -1 for unknown word', () => {
    expect(getWordIndex('xyz123')).toBe(-1);
  });

  it('should be case-insensitive for word lookup', () => {
    expect(getWordIndex('ABANDON')).toBe(0);
    expect(getWordIndex('Zoo')).toBe(2047);
  });

  it('should have 2048 words in wordlist', () => {
    expect(BIP39_WORDLIST).toHaveLength(2048);
  });
});

describe('Word Suggestions', () => {
  it('should return suggestions for partial input', () => {
    const suggestions = getWordSuggestions('ab');
    
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every(s => s.startsWith('ab'))).toBe(true);
  });

  it('should limit number of suggestions', () => {
    const suggestions = getWordSuggestions('a', 3);
    
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('should return empty array for empty input', () => {
    expect(getWordSuggestions('')).toEqual([]);
  });

  it('should return empty array for no matches', () => {
    expect(getWordSuggestions('xyz')).toEqual([]);
  });

  it('should be case-insensitive', () => {
    const suggestions1 = getWordSuggestions('AB');
    const suggestions2 = getWordSuggestions('ab');
    
    expect(suggestions1).toEqual(suggestions2);
  });

  it('should include exact match', () => {
    const suggestions = getWordSuggestions('abandon');
    
    expect(suggestions).toContain('abandon');
  });
});

describe('Phrase Formatting', () => {
  it('should normalize phrase correctly', () => {
    const input = '  ABANDON   abandon  ABOUT  ';
    const normalized = normalizePhrase(input);
    
    expect(normalized).toBe('abandon abandon about');
  });

  it('should format phrase for display in groups of 4', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const groups = formatPhraseForDisplay(phrase);
    
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(4);
    expect(groups[1]).toHaveLength(4);
    expect(groups[2]).toHaveLength(4);
  });

  it('should format 24-word phrase into 6 groups', () => {
    const result = generateSeedPhrase();
    const groups = formatPhraseForDisplay(result.phrase);
    
    expect(groups).toHaveLength(6);
    groups.forEach(group => {
      expect(group).toHaveLength(4);
    });
  });
});

describe('Configuration', () => {
  it('should have correct word count config', () => {
    expect(SEED_PHRASE_CONFIG.WORD_COUNT).toBe(24);
  });

  it('should have correct entropy bits config', () => {
    expect(SEED_PHRASE_CONFIG.ENTROPY_BITS).toBe(256);
  });

  it('should have correct derived key length', () => {
    expect(SEED_PHRASE_CONFIG.DERIVED_KEY_LENGTH).toBe(32);
  });
});

describe('Security Properties', () => {
  it('should generate cryptographically random phrases', () => {
    // Generate multiple phrases and check they are all different
    const phrases = new Set<string>();
    for (let i = 0; i < 10; i++) {
      phrases.add(generateSeedPhrase().phrase);
    }
    
    expect(phrases.size).toBe(10);
  });

  it('should derive different keys for similar phrases', () => {
    // Two valid BIP39 phrases should produce completely different keys
    const phrase1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const phrase2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
    
    const key1 = deriveDEKFromSeedPhrase(phrase1);
    const key2 = deriveDEKFromSeedPhrase(phrase2);
    
    // Keys should be completely different (not just one byte different)
    let differentBytes = 0;
    for (let i = 0; i < key1.length; i++) {
      if (key1[i] !== key2[i]) differentBytes++;
    }
    
    // Expect roughly half the bytes to be different (avalanche effect)
    expect(differentBytes).toBeGreaterThan(10);
  });
});
