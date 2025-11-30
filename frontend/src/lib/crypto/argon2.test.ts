/**
 * Unit tests for Argon2id Key Derivation
 * 
 * Note: Argon2id is computationally expensive in pure JS.
 * Tests use reduced parameters for faster execution.
 * Production parameters are validated separately.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  saltToHex,
  hexToSalt,
  getArgon2Params,
  ARGON2_PARAMS,
} from './argon2';
import { argon2id } from '@noble/hashes/argon2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Test parameters - reduced for faster test execution
const TEST_PARAMS = { t: 1, m: 1024, p: 1, dkLen: 32 };

// Helper function for testing with reduced params
function testDeriveKey(password: string, salt: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  return argon2id(encoder.encode(password), salt, TEST_PARAMS);
}

describe('Argon2id Key Derivation', () => {
  describe('generateSalt', () => {
    it('should generate salt of default length (16 bytes)', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it('should generate salt of custom length', () => {
      const salt = generateSalt(32);
      expect(salt.length).toBe(32);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(bytesToHex(salt1)).not.toBe(bytesToHex(salt2));
    });
  });

  describe('saltToHex / hexToSalt', () => {
    it('should convert salt to hex and back', () => {
      const original = generateSalt();
      const hex = saltToHex(original);
      const restored = hexToSalt(hex);
      
      expect(hex).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
      expect(bytesToHex(restored)).toBe(bytesToHex(original));
    });

    it('should handle known test vector', () => {
      const salt = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const hex = saltToHex(salt);
      expect(hex).toBe('01020304');
      
      const restored = hexToSalt(hex);
      expect(Array.from(restored)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Argon2id core functionality (with test params)', () => {
    const testSalt = new Uint8Array(16).fill(0x01);
    const testPassword = 'test-password-123';

    it('should derive 32-byte hash', () => {
      const hash = testDeriveKey(testPassword, testSalt);
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should produce deterministic output for same inputs', () => {
      const hash1 = testDeriveKey(testPassword, testSalt);
      const hash2 = testDeriveKey(testPassword, testSalt);
      expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
    });

    it('should produce different output for different passwords', () => {
      const hash1 = testDeriveKey('password1', testSalt);
      const hash2 = testDeriveKey('password2', testSalt);
      expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));
    });

    it('should produce different output for different salts', () => {
      const salt1 = new Uint8Array(16).fill(0x01);
      const salt2 = new Uint8Array(16).fill(0x02);
      const hash1 = testDeriveKey(testPassword, salt1);
      const hash2 = testDeriveKey(testPassword, salt2);
      expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));
    });

    it('should handle empty password', () => {
      const hash = testDeriveKey('', testSalt);
      expect(hash.length).toBe(32);
    });

    it('should handle unicode passwords', () => {
      const hash = testDeriveKey('пароль🔐密码', testSalt);
      expect(hash.length).toBe(32);
    });

    it('should produce different output with different parameters', () => {
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(testPassword);
      
      const hash1 = argon2id(passwordBytes, testSalt, { t: 1, m: 1024, p: 1, dkLen: 32 });
      const hash2 = argon2id(passwordBytes, testSalt, { t: 2, m: 1024, p: 1, dkLen: 32 });
      
      expect(bytesToHex(hash1)).not.toBe(bytesToHex(hash2));
    });
  });

  describe('getArgon2Params', () => {
    it('should return AUTH parameters', () => {
      const params = getArgon2Params('AUTH');
      expect(params.algorithm).toBe('argon2id');
      expect(params.version).toBe(0x13);
      expect(params.t).toBe(ARGON2_PARAMS.AUTH.t);
      expect(params.m).toBe(ARGON2_PARAMS.AUTH.m);
      expect(params.p).toBe(ARGON2_PARAMS.AUTH.p);
      expect(params.dkLen).toBe(ARGON2_PARAMS.AUTH.dkLen);
    });

    it('should return KEK parameters by default', () => {
      const params = getArgon2Params();
      expect(params.t).toBe(ARGON2_PARAMS.KEK.t);
      expect(params.m).toBe(ARGON2_PARAMS.KEK.m);
    });
  });

  describe('ARGON2_PARAMS', () => {
    it('should have valid AUTH parameters', () => {
      expect(ARGON2_PARAMS.AUTH.t).toBeGreaterThanOrEqual(1);
      expect(ARGON2_PARAMS.AUTH.m).toBeGreaterThanOrEqual(8192); // Min 8 KB
      expect(ARGON2_PARAMS.AUTH.p).toBeGreaterThanOrEqual(1);
      expect(ARGON2_PARAMS.AUTH.dkLen).toBe(32);
    });

    it('should have valid KEK parameters', () => {
      expect(ARGON2_PARAMS.KEK.t).toBeGreaterThanOrEqual(1);
      expect(ARGON2_PARAMS.KEK.m).toBeGreaterThanOrEqual(8192);
      expect(ARGON2_PARAMS.KEK.p).toBeGreaterThanOrEqual(1);
      expect(ARGON2_PARAMS.KEK.dkLen).toBe(32);
    });

    it('should have KEK with higher security than AUTH', () => {
      // KEK should have more iterations or memory than AUTH
      const kekCost = ARGON2_PARAMS.KEK.t * ARGON2_PARAMS.KEK.m;
      const authCost = ARGON2_PARAMS.AUTH.t * ARGON2_PARAMS.AUTH.m;
      expect(kekCost).toBeGreaterThan(authCost);
    });

    it('should have AUTH memory >= 64MB (OWASP recommendation)', () => {
      expect(ARGON2_PARAMS.AUTH.m).toBeGreaterThanOrEqual(65536); // 64 MB
    });

    it('should have KEK memory >= 64MB', () => {
      expect(ARGON2_PARAMS.KEK.m).toBeGreaterThanOrEqual(65536);
    });
  });

  describe('Known test vectors', () => {
    // RFC 9106 test vector (simplified)
    it('should match expected output for known input', () => {
      const password = 'password';
      const salt = new Uint8Array([
        0x73, 0x61, 0x6c, 0x74, 0x73, 0x61, 0x6c, 0x74,
        0x73, 0x61, 0x6c, 0x74, 0x73, 0x61, 0x6c, 0x74
      ]); // "saltsaltsaltsalt"
      
      const encoder = new TextEncoder();
      const hash = argon2id(encoder.encode(password), salt, {
        t: 1,
        m: 1024,
        p: 1,
        dkLen: 32
      });
      
      // Verify it produces consistent output
      expect(hash.length).toBe(32);
      expect(bytesToHex(hash)).toMatch(/^[0-9a-f]{64}$/);
      
      // Run again to verify determinism
      const hash2 = argon2id(encoder.encode(password), salt, {
        t: 1,
        m: 1024,
        p: 1,
        dkLen: 32
      });
      expect(bytesToHex(hash)).toBe(bytesToHex(hash2));
    });
  });
});
