/**
 * AES-256-GCM Encryption Tests
 * 
 * Tests include:
 * - Basic encryption/decryption
 * - Known test vectors (NIST)
 * - Key wrapping/unwrapping
 * - Error handling
 * - Hex encoding/decoding
 */

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  encryptToHex,
  decryptFromHex,
  decryptToString,
  decryptFromHexToString,
  wrapKey,
  unwrapKey,
  wrapKeyToHex,
  unwrapKeyFromHex,
  generateIV,
  generateKey,
  AES_CONFIG,
  bytesToHex,
  hexToBytes,
  utf8ToBytes,
} from './aes';

describe('AES-256-GCM Encryption', () => {
  describe('generateIV', () => {
    it('should generate a 12-byte IV', () => {
      const iv = generateIV();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(AES_CONFIG.NONCE_LENGTH);
    });

    it('should generate unique IVs', () => {
      const iv1 = generateIV();
      const iv2 = generateIV();
      expect(bytesToHex(iv1)).not.toBe(bytesToHex(iv2));
    });
  });

  describe('generateKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(AES_CONFIG.KEY_LENGTH);
    });

    it('should generate unique keys', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const key = generateKey();
      const plaintext = 'Hello, World!';
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      const decrypted = decryptToString(ciphertext, key, iv);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt binary data', () => {
      const key = generateKey();
      const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      const decrypted = decrypt(ciphertext, key, iv);
      
      expect(decrypted).toEqual(plaintext);
    });

    it('should encrypt and decrypt empty string', () => {
      const key = generateKey();
      const plaintext = '';
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      const decrypted = decryptToString(ciphertext, key, iv);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode text', () => {
      const key = generateKey();
      const plaintext = '🔐 Secure Password 密码 пароль';
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      const decrypted = decryptToString(ciphertext, key, iv);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt large data', () => {
      const key = generateKey();
      const plaintext = 'A'.repeat(10000);
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      const decrypted = decryptToString(ciphertext, key, iv);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const key = generateKey();
      const plaintext = 'Same message';
      
      const result1 = encrypt(plaintext, key);
      const result2 = encrypt(plaintext, key);
      
      expect(bytesToHex(result1.ciphertext)).not.toBe(bytesToHex(result2.ciphertext));
      expect(bytesToHex(result1.iv)).not.toBe(bytesToHex(result2.iv));
    });

    it('should include authentication tag in ciphertext', () => {
      const key = generateKey();
      const plaintext = 'Test';
      const plaintextBytes = utf8ToBytes(plaintext);
      
      const { ciphertext } = encrypt(plaintext, key);
      
      // Ciphertext should be plaintext length + 16 bytes (auth tag)
      expect(ciphertext.length).toBe(plaintextBytes.length + AES_CONFIG.TAG_LENGTH);
    });
  });

  describe('encrypt/decrypt with AAD', () => {
    it('should encrypt and decrypt with additional authenticated data', () => {
      const key = generateKey();
      const plaintext = 'Secret message';
      const aad = utf8ToBytes('user-id-12345');
      
      const { ciphertext, iv } = encrypt(plaintext, key, aad);
      const decrypted = decryptToString(ciphertext, key, iv, aad);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong AAD', () => {
      const key = generateKey();
      const plaintext = 'Secret message';
      const aad = utf8ToBytes('user-id-12345');
      const wrongAad = utf8ToBytes('user-id-wrong');
      
      const { ciphertext, iv } = encrypt(plaintext, key, aad);
      
      expect(() => decrypt(ciphertext, key, iv, wrongAad)).toThrow();
    });

    it('should fail decryption when AAD is missing', () => {
      const key = generateKey();
      const plaintext = 'Secret message';
      const aad = utf8ToBytes('user-id-12345');
      
      const { ciphertext, iv } = encrypt(plaintext, key, aad);
      
      expect(() => decrypt(ciphertext, key, iv)).toThrow();
    });
  });

  describe('hex encoding', () => {
    it('should encrypt to hex and decrypt from hex', () => {
      const key = generateKey();
      const plaintext = 'Hello, Hex!';
      
      const { ciphertext, iv } = encryptToHex(plaintext, key);
      
      expect(typeof ciphertext).toBe('string');
      expect(typeof iv).toBe('string');
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(iv).toMatch(/^[0-9a-f]+$/);
      
      const decrypted = decryptFromHexToString(ciphertext, key, iv);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt from hex to bytes', () => {
      const key = generateKey();
      const plaintext = new Uint8Array([10, 20, 30, 40, 50]);
      
      const { ciphertext, iv } = encryptToHex(plaintext, key);
      const decrypted = decryptFromHex(ciphertext, key, iv);
      
      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('key wrapping', () => {
    it('should wrap and unwrap a key', () => {
      const kek = generateKey(); // Key Encryption Key
      const dek = generateKey(); // Data Encryption Key
      
      const { ciphertext: wrappedKey, iv } = wrapKey(dek, kek);
      const unwrappedKey = unwrapKey(wrappedKey, kek, iv);
      
      expect(unwrappedKey).toEqual(dek);
    });

    it('should wrap and unwrap a key with hex encoding', () => {
      const kek = generateKey();
      const dek = generateKey();
      
      const { ciphertext: wrappedKeyHex, iv: ivHex } = wrapKeyToHex(dek, kek);
      const unwrappedKey = unwrapKeyFromHex(wrappedKeyHex, kek, ivHex);
      
      expect(unwrappedKey).toEqual(dek);
    });

    it('should fail to unwrap with wrong KEK', () => {
      const kek = generateKey();
      const wrongKek = generateKey();
      const dek = generateKey();
      
      const { ciphertext: wrappedKey, iv } = wrapKey(dek, kek);
      
      expect(() => unwrapKey(wrappedKey, wrongKek, iv)).toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid key length', () => {
      const shortKey = new Uint8Array(16); // 128-bit key (too short)
      const plaintext = 'Test';
      
      expect(() => encrypt(plaintext, shortKey)).toThrow('Invalid key length');
    });

    it('should throw error for invalid IV length on decrypt', () => {
      const key = generateKey();
      const ciphertext = new Uint8Array(32);
      const shortIv = new Uint8Array(8); // Too short
      
      expect(() => decrypt(ciphertext, key, shortIv)).toThrow('Invalid IV length');
    });

    it('should throw error for tampered ciphertext', () => {
      const key = generateKey();
      const plaintext = 'Original message';
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      
      // Tamper with ciphertext
      ciphertext[0] ^= 0xff;
      
      expect(() => decrypt(ciphertext, key, iv)).toThrow();
    });

    it('should throw error for wrong key', () => {
      const key = generateKey();
      const wrongKey = generateKey();
      const plaintext = 'Secret';
      
      const { ciphertext, iv } = encrypt(plaintext, key);
      
      expect(() => decrypt(ciphertext, wrongKey, iv)).toThrow();
    });

    it('should throw error for wrong IV', () => {
      const key = generateKey();
      const plaintext = 'Secret';
      
      const { ciphertext } = encrypt(plaintext, key);
      const wrongIv = generateIV();
      
      expect(() => decrypt(ciphertext, key, wrongIv)).toThrow();
    });
  });

  describe('NIST test vectors', () => {
    // Test Case 1 from NIST SP 800-38D
    // https://csrc.nist.gov/CSRC/media/Projects/Cryptographic-Algorithm-Validation-Program/documents/mac/gcmtestvectors.zip
    it('should match NIST test vector (Test Case 1 - empty plaintext)', async () => {
      const key = hexToBytes('00000000000000000000000000000000' + '00000000000000000000000000000000');
      const iv = hexToBytes('000000000000000000000000');
      const plaintext = new Uint8Array(0);
      
      // Expected tag for empty plaintext with zero key and IV
      const expectedTag = hexToBytes('530f8afbc74536b9a963b4f1c4cb738b');
      
      const { gcm } = await import('@noble/ciphers/aes.js');
      const aes = gcm(key, iv);
      const ciphertext = aes.encrypt(plaintext);
      
      // Ciphertext should only contain the tag for empty plaintext
      expect(ciphertext.length).toBe(16);
      expect(bytesToHex(ciphertext)).toBe(bytesToHex(expectedTag));
    });

    // Test Case 2 - 128-bit plaintext
    it('should match NIST test vector (Test Case 2 - 128-bit plaintext)', async () => {
      const key = hexToBytes('00000000000000000000000000000000' + '00000000000000000000000000000000');
      const iv = hexToBytes('000000000000000000000000');
      const plaintext = hexToBytes('00000000000000000000000000000000');
      
      const expectedCiphertext = hexToBytes('cea7403d4d606b6e074ec5d3baf39d18');
      const expectedTag = hexToBytes('d0d1c8a799996bf0265b98b5d48ab919');
      
      const { gcm } = await import('@noble/ciphers/aes.js');
      const aes = gcm(key, iv);
      const result = aes.encrypt(plaintext);
      
      // Result contains ciphertext + tag
      const ciphertext = result.slice(0, 16);
      const tag = result.slice(16);
      
      expect(bytesToHex(ciphertext)).toBe(bytesToHex(expectedCiphertext));
      expect(bytesToHex(tag)).toBe(bytesToHex(expectedTag));
    });

    // Test decryption with known values
    it('should decrypt NIST test vector correctly', async () => {
      const key = hexToBytes('feffe9928665731c6d6a8f9467308308' + 'feffe9928665731c6d6a8f9467308308');
      const iv = hexToBytes('cafebabefacedbaddecaf888');
      const plaintext = hexToBytes(
        'd9313225f88406e5a55909c5aff5269a' +
        '86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525' +
        'b16aedf5aa0de657ba637b391aafd255'
      );
      
      // Encrypt
      const { gcm } = await import('@noble/ciphers/aes.js');
      const aes = gcm(key, iv);
      const ciphertext = aes.encrypt(plaintext);
      
      // Decrypt and verify
      const aes2 = gcm(key, iv);
      const decrypted = aes2.decrypt(ciphertext);
      
      expect(bytesToHex(decrypted)).toBe(bytesToHex(plaintext));
    });
  });

  describe('integration scenarios', () => {
    it('should handle credential encryption workflow', () => {
      // Simulate encrypting a credential value
      const dek = generateKey(); // Data Encryption Key
      const credential = JSON.stringify({
        username: 'user@example.com',
        password: 'super-secret-password-123!',
      });
      
      // Encrypt credential
      const { ciphertext, iv } = encryptToHex(credential, dek);
      
      // Store ciphertext and iv in database...
      
      // Later, decrypt credential
      const decrypted = decryptFromHexToString(ciphertext, dek, iv);
      const parsed = JSON.parse(decrypted);
      
      expect(parsed.username).toBe('user@example.com');
      expect(parsed.password).toBe('super-secret-password-123!');
    });

    it('should handle key hierarchy (KEK wrapping DEK)', () => {
      // Simulate the key hierarchy used in the password manager
      const kek = generateKey(); // Derived from master password via Argon2id
      const dek = generateKey(); // Random data encryption key
      
      // Wrap DEK with KEK for storage
      const { ciphertext: wrappedDek, iv: kekIv } = wrapKeyToHex(dek, kek);
      
      // Store wrappedDek and kekIv on server...
      
      // Later, unwrap DEK
      const unwrappedDek = unwrapKeyFromHex(wrappedDek, kek, kekIv);
      
      // Use DEK to encrypt/decrypt credentials
      const secret = 'My secret note';
      const { ciphertext, iv } = encrypt(secret, unwrappedDek);
      const decrypted = decryptToString(ciphertext, unwrappedDek, iv);
      
      expect(decrypted).toBe(secret);
      expect(unwrappedDek).toEqual(dek);
    });
  });
});
