/**
 * HMAC Authentication Tests
 * 
 * Tests for HMAC-SHA256 authentication tag generation and verification.
 * Includes test vectors and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateAuthTag,
  generateAuthTagHex,
  verifyAuthTag,
  verifyAuthTagHex,
  constantTimeEqual,
  createHmac,
  signWithContext,
  verifyWithContext,
  generateTimestampedAuthTag,
  verifyTimestampedAuthTag,
  HMAC_CONFIG,
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
} from './hmac';

describe('HMAC Authentication', () => {
  // Test key (32 bytes)
  const testKey = new Uint8Array(32).fill(0x42);
  const testMessage = 'Hello, World!';
  const testMessageBytes = utf8ToBytes(testMessage);

  describe('generateAuthTag', () => {
    it('should generate a 32-byte authentication tag', () => {
      const tag = generateAuthTag(testKey, testMessage);
      expect(tag).toBeInstanceOf(Uint8Array);
      expect(tag.length).toBe(HMAC_CONFIG.OUTPUT_LENGTH);
    });

    it('should generate consistent tags for same input', () => {
      const tag1 = generateAuthTag(testKey, testMessage);
      const tag2 = generateAuthTag(testKey, testMessage);
      expect(bytesToHex(tag1)).toBe(bytesToHex(tag2));
    });

    it('should generate different tags for different messages', () => {
      const tag1 = generateAuthTag(testKey, 'message1');
      const tag2 = generateAuthTag(testKey, 'message2');
      expect(bytesToHex(tag1)).not.toBe(bytesToHex(tag2));
    });

    it('should generate different tags for different keys', () => {
      const key1 = new Uint8Array(32).fill(0x01);
      const key2 = new Uint8Array(32).fill(0x02);
      const tag1 = generateAuthTag(key1, testMessage);
      const tag2 = generateAuthTag(key2, testMessage);
      expect(bytesToHex(tag1)).not.toBe(bytesToHex(tag2));
    });

    it('should accept Uint8Array message', () => {
      const tag = generateAuthTag(testKey, testMessageBytes);
      expect(tag).toBeInstanceOf(Uint8Array);
      expect(tag.length).toBe(32);
    });

    it('should produce same tag for string and equivalent Uint8Array', () => {
      const tagFromString = generateAuthTag(testKey, testMessage);
      const tagFromBytes = generateAuthTag(testKey, testMessageBytes);
      expect(bytesToHex(tagFromString)).toBe(bytesToHex(tagFromBytes));
    });

    it('should handle empty message', () => {
      const tag = generateAuthTag(testKey, '');
      expect(tag).toBeInstanceOf(Uint8Array);
      expect(tag.length).toBe(32);
    });

    it('should handle empty Uint8Array message', () => {
      const tag = generateAuthTag(testKey, new Uint8Array(0));
      expect(tag).toBeInstanceOf(Uint8Array);
      expect(tag.length).toBe(32);
    });
  });

  describe('generateAuthTagHex', () => {
    it('should return hex string of correct length', () => {
      const tagHex = generateAuthTagHex(testKey, testMessage);
      expect(typeof tagHex).toBe('string');
      expect(tagHex.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should be consistent with generateAuthTag', () => {
      const tag = generateAuthTag(testKey, testMessage);
      const tagHex = generateAuthTagHex(testKey, testMessage);
      expect(tagHex).toBe(bytesToHex(tag));
    });

    it('should only contain valid hex characters', () => {
      const tagHex = generateAuthTagHex(testKey, testMessage);
      expect(tagHex).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('verifyAuthTag', () => {
    it('should return true for valid tag', () => {
      const tag = generateAuthTag(testKey, testMessage);
      const isValid = verifyAuthTag(testKey, testMessage, tag);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid tag', () => {
      const tag = generateAuthTag(testKey, testMessage);
      // Modify one byte
      const invalidTag = new Uint8Array(tag);
      invalidTag[0] ^= 0xff;
      const isValid = verifyAuthTag(testKey, testMessage, invalidTag);
      expect(isValid).toBe(false);
    });

    it('should return false for wrong message', () => {
      const tag = generateAuthTag(testKey, testMessage);
      const isValid = verifyAuthTag(testKey, 'wrong message', tag);
      expect(isValid).toBe(false);
    });

    it('should return false for wrong key', () => {
      const tag = generateAuthTag(testKey, testMessage);
      const wrongKey = new Uint8Array(32).fill(0x99);
      const isValid = verifyAuthTag(wrongKey, testMessage, tag);
      expect(isValid).toBe(false);
    });

    it('should return false for truncated tag', () => {
      const tag = generateAuthTag(testKey, testMessage);
      const truncatedTag = tag.slice(0, 16);
      const isValid = verifyAuthTag(testKey, testMessage, truncatedTag);
      expect(isValid).toBe(false);
    });
  });

  describe('verifyAuthTagHex', () => {
    it('should return true for valid hex tag', () => {
      const tagHex = generateAuthTagHex(testKey, testMessage);
      const isValid = verifyAuthTagHex(testKey, testMessage, tagHex);
      expect(isValid).toBe(true);
    });

    it('should return false for invalid hex tag', () => {
      const tagHex = generateAuthTagHex(testKey, testMessage);
      // Modify first character
      const invalidTagHex = 'f' + tagHex.slice(1);
      const isValid = verifyAuthTagHex(testKey, testMessage, invalidTagHex);
      expect(isValid).toBe(false);
    });

    it('should return false for invalid hex string', () => {
      const isValid = verifyAuthTagHex(testKey, testMessage, 'not-valid-hex!');
      expect(isValid).toBe(false);
    });

    it('should return false for empty hex string', () => {
      const isValid = verifyAuthTagHex(testKey, testMessage, '');
      expect(isValid).toBe(false);
    });
  });

  describe('constantTimeEqual', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should return false for different length arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should return true for empty arrays', () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);
      expect(constantTimeEqual(a, b)).toBe(true);
    });

    it('should return false when only first byte differs', () => {
      const a = new Uint8Array([0, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    it('should return false when only last byte differs', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 0]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });
  });

  describe('createHmac (streaming API)', () => {
    it('should produce same result as direct call', () => {
      const directTag = generateAuthTag(testKey, testMessage);
      const streamingTag = createHmac(testKey)
        .update(testMessageBytes)
        .digest();
      expect(bytesToHex(directTag)).toBe(bytesToHex(streamingTag));
    });

    it('should support multiple updates', () => {
      const fullMessage = 'Hello, World!';
      const directTag = generateAuthTag(testKey, fullMessage);
      
      const streamingTag = createHmac(testKey)
        .update(utf8ToBytes('Hello, '))
        .update(utf8ToBytes('World!'))
        .digest();
      
      expect(bytesToHex(directTag)).toBe(bytesToHex(streamingTag));
    });

    it('should handle empty updates', () => {
      const tag1 = createHmac(testKey)
        .update(new Uint8Array(0))
        .update(testMessageBytes)
        .digest();
      
      const tag2 = generateAuthTag(testKey, testMessage);
      expect(bytesToHex(tag1)).toBe(bytesToHex(tag2));
    });
  });

  describe('signWithContext', () => {
    it('should generate tag with context', () => {
      const tag = signWithContext(testKey, 'api-auth', testMessage);
      expect(tag).toBeInstanceOf(Uint8Array);
      expect(tag.length).toBe(32);
    });

    it('should produce different tags for different contexts', () => {
      const tag1 = signWithContext(testKey, 'context1', testMessage);
      const tag2 = signWithContext(testKey, 'context2', testMessage);
      expect(bytesToHex(tag1)).not.toBe(bytesToHex(tag2));
    });

    it('should produce different tag than without context', () => {
      const tagWithContext = signWithContext(testKey, 'api-auth', testMessage);
      const tagWithoutContext = generateAuthTag(testKey, testMessage);
      expect(bytesToHex(tagWithContext)).not.toBe(bytesToHex(tagWithoutContext));
    });

    it('should be consistent for same inputs', () => {
      const tag1 = signWithContext(testKey, 'api-auth', testMessage);
      const tag2 = signWithContext(testKey, 'api-auth', testMessage);
      expect(bytesToHex(tag1)).toBe(bytesToHex(tag2));
    });
  });

  describe('verifyWithContext', () => {
    it('should return true for valid tag with correct context', () => {
      const context = 'api-auth';
      const tag = signWithContext(testKey, context, testMessage);
      const isValid = verifyWithContext(testKey, context, testMessage, tag);
      expect(isValid).toBe(true);
    });

    it('should return false for wrong context', () => {
      const tag = signWithContext(testKey, 'context1', testMessage);
      const isValid = verifyWithContext(testKey, 'context2', testMessage, tag);
      expect(isValid).toBe(false);
    });

    it('should return false for wrong message', () => {
      const context = 'api-auth';
      const tag = signWithContext(testKey, context, testMessage);
      const isValid = verifyWithContext(testKey, context, 'wrong message', tag);
      expect(isValid).toBe(false);
    });
  });

  describe('generateTimestampedAuthTag', () => {
    it('should generate tag with timestamp', () => {
      const result = generateTimestampedAuthTag(testKey, testMessage);
      expect(result.tag).toBeInstanceOf(Uint8Array);
      expect(result.tag.length).toBe(32);
      expect(typeof result.timestamp).toBe('number');
    });

    it('should use current time by default', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = generateTimestampedAuthTag(testKey, testMessage);
      const after = Math.floor(Date.now() / 1000);
      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should use provided timestamp', () => {
      const timestamp = 1700000000;
      const result = generateTimestampedAuthTag(testKey, testMessage, timestamp);
      expect(result.timestamp).toBe(timestamp);
    });

    it('should produce different tags for different timestamps', () => {
      const result1 = generateTimestampedAuthTag(testKey, testMessage, 1000);
      const result2 = generateTimestampedAuthTag(testKey, testMessage, 2000);
      expect(bytesToHex(result1.tag)).not.toBe(bytesToHex(result2.tag));
    });

    it('should be consistent for same timestamp', () => {
      const timestamp = 1700000000;
      const result1 = generateTimestampedAuthTag(testKey, testMessage, timestamp);
      const result2 = generateTimestampedAuthTag(testKey, testMessage, timestamp);
      expect(bytesToHex(result1.tag)).toBe(bytesToHex(result2.tag));
    });
  });

  describe('verifyTimestampedAuthTag', () => {
    it('should return valid for fresh tag', () => {
      const { tag, timestamp } = generateTimestampedAuthTag(testKey, testMessage);
      const result = verifyTimestampedAuthTag(testKey, testMessage, tag, timestamp);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for expired tag', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const { tag } = generateTimestampedAuthTag(testKey, testMessage, oldTimestamp);
      const result = verifyTimestampedAuthTag(testKey, testMessage, tag, oldTimestamp, 300);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should return invalid for future timestamp', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
      const { tag } = generateTimestampedAuthTag(testKey, testMessage, futureTimestamp);
      const result = verifyTimestampedAuthTag(testKey, testMessage, tag, futureTimestamp);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should return invalid for wrong tag', () => {
      const { timestamp } = generateTimestampedAuthTag(testKey, testMessage);
      const wrongTag = new Uint8Array(32).fill(0xff);
      const result = verifyTimestampedAuthTag(testKey, testMessage, wrongTag, timestamp);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should respect custom maxAgeSeconds', () => {
      const timestamp = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      const { tag } = generateTimestampedAuthTag(testKey, testMessage, timestamp);
      
      // Should be valid with 60 second max age
      const result1 = verifyTimestampedAuthTag(testKey, testMessage, tag, timestamp, 60);
      expect(result1.isValid).toBe(true);
      
      // Should be invalid with 5 second max age
      const result2 = verifyTimestampedAuthTag(testKey, testMessage, tag, timestamp, 5);
      expect(result2.isValid).toBe(false);
    });
  });

  describe('HMAC-SHA256 Test Vectors', () => {
    // RFC 4231 Test Vectors for HMAC-SHA256
    it('should match RFC 4231 Test Case 1', () => {
      // Key: 0x0b repeated 20 times
      const key = new Uint8Array(20).fill(0x0b);
      const data = utf8ToBytes('Hi There');
      const expectedHex = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
      
      const tag = generateAuthTag(key, data);
      expect(bytesToHex(tag)).toBe(expectedHex);
    });

    it('should match RFC 4231 Test Case 2', () => {
      // Key: "Jefe"
      const key = utf8ToBytes('Jefe');
      const data = utf8ToBytes('what do ya want for nothing?');
      const expectedHex = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843';
      
      const tag = generateAuthTag(key, data);
      expect(bytesToHex(tag)).toBe(expectedHex);
    });

    it('should match RFC 4231 Test Case 3', () => {
      // Key: 0xaa repeated 20 times
      const key = new Uint8Array(20).fill(0xaa);
      // Data: 0xdd repeated 50 times
      const data = new Uint8Array(50).fill(0xdd);
      const expectedHex = '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe';
      
      const tag = generateAuthTag(key, data);
      expect(bytesToHex(tag)).toBe(expectedHex);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(100000);
      const tag = generateAuthTag(testKey, longMessage);
      expect(tag.length).toBe(32);
      
      const isValid = verifyAuthTag(testKey, longMessage, tag);
      expect(isValid).toBe(true);
    });

    it('should handle binary data with null bytes', () => {
      const binaryData = new Uint8Array([0x00, 0x01, 0x00, 0x02, 0x00]);
      const tag = generateAuthTag(testKey, binaryData);
      expect(tag.length).toBe(32);
      
      const isValid = verifyAuthTag(testKey, binaryData, tag);
      expect(isValid).toBe(true);
    });

    it('should handle unicode messages', () => {
      const unicodeMessage = '你好世界 🌍 مرحبا';
      const tag = generateAuthTag(testKey, unicodeMessage);
      expect(tag.length).toBe(32);
      
      const isValid = verifyAuthTag(testKey, unicodeMessage, tag);
      expect(isValid).toBe(true);
    });

    it('should handle short keys (with warning)', () => {
      const shortKey = new Uint8Array(16); // Less than recommended 32 bytes
      const tag = generateAuthTag(shortKey, testMessage);
      expect(tag.length).toBe(32);
    });
  });
});
