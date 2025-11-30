/**
 * Tests for Crypto Worker
 *
 * Tests cover:
 * - Worker initialization and pre-warming
 * - Argon2id key derivation (AuthHash, KEK)
 * - Key wrapping/unwrapping
 * - KEK caching
 * - Memory sanitization
 * - Worker lifecycle management
 *
 * Note: Web Workers are not available in Node.js/jsdom environment,
 * so we test the manager logic and mock the worker communication.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CryptoWorkerManager,
  getCryptoWorker,
  preWarmCryptoWorker,
  lockVault,
  terminateCryptoWorker,
} from './worker';

interface MockMessage {
  id: string;
  type: string;
  payload?: unknown;
}

/**
 * Mock worker responses based on message type
 */
function mockWorkerResponse(message: MockMessage) {
  const { id, type } = message;

  switch (type) {
    case 'init':
      return { id, type: 'success', payload: { initialized: true } };

    case 'deriveAuthHash':
      return {
        id,
        type: 'success',
        payload: new Uint8Array(32).fill(1),
      };

    case 'deriveKEK':
      return {
        id,
        type: 'success',
        payload: new Uint8Array(32).fill(2),
      };

    case 'deriveKeys':
      return {
        id,
        type: 'success',
        payload: {
          authHash: new Uint8Array(32).fill(1),
          kek: new Uint8Array(32).fill(2),
        },
      };

    case 'cacheKEK':
      return { id, type: 'success', payload: { cached: true } };

    case 'getCachedKEK':
      return { id, type: 'success', payload: true };

    case 'wrapKey':
      return {
        id,
        type: 'success',
        payload: {
          wrappedKey: new Uint8Array(48),
          iv: new Uint8Array(12),
        },
      };

    case 'unwrapKey':
      return {
        id,
        type: 'success',
        payload: new Uint8Array(32).fill(3),
      };

    case 'sanitize':
      return { id, type: 'success', payload: { sanitized: true } };

    case 'ping':
      return { id, type: 'success', payload: { pong: true } };

    default:
      return { id, type: 'error', error: `Unknown type: ${type}` };
  }
}

// Mock Worker class
class MockWorker {
  private listeners: Map<string, Set<(event: MessageEvent) => void>> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    // Initialize
  }

  postMessage(message: MockMessage) {
    setTimeout(() => {
      const response = mockWorkerResponse(message);
      const event = { data: response } as MessageEvent;

      if (this.messageHandler) {
        this.messageHandler(event);
      }

      const messageListeners = this.listeners.get('message');
      if (messageListeners) {
        messageListeners.forEach((listener) => listener(event));
      }
    }, 10);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  terminate() {
    this.listeners.clear();
    this.messageHandler = null;
  }

  set onmessage(handler: ((event: MessageEvent) => void) | null) {
    this.messageHandler = handler;
  }

  get onmessage() {
    return this.messageHandler;
  }

  onerror: ((event: ErrorEvent) => void) | null = null;
}

// Mock the worker import
vi.mock('./crypto.worker?worker', () => {
  return {
    default: MockWorker,
  };
});

describe('CryptoWorkerManager', () => {
  let manager: CryptoWorkerManager;

  beforeEach(() => {
    manager = new CryptoWorkerManager();
  });

  afterEach(() => {
    manager.terminate();
  });

  describe('Initialization', () => {
    it('should initialize the worker', async () => {
      await manager.init();
      const isAlive = await manager.ping();
      expect(isAlive).toBe(true);
    });

    it('should only initialize once', async () => {
      await manager.init();
      await manager.init();
      await manager.init();
      const isAlive = await manager.ping();
      expect(isAlive).toBe(true);
    });

    it('should auto-initialize on first operation', async () => {
      const isAlive = await manager.ping();
      expect(isAlive).toBe(true);
    });
  });

  describe('Key Derivation', () => {
    it('should derive AuthHash', async () => {
      const password = 'test-password';
      const salt = new Uint8Array(16).fill(1);

      const hash = await manager.deriveAuthHash(password, salt);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should derive KEK', async () => {
      const password = 'test-password';
      const salt = new Uint8Array(16).fill(2);

      const kek = await manager.deriveKEK(password, salt);

      expect(kek).toBeInstanceOf(Uint8Array);
      expect(kek.length).toBe(32);
    });

    it('should derive both keys at once', async () => {
      const password = 'test-password';
      const authSalt = new Uint8Array(16).fill(1);
      const kekSalt = new Uint8Array(16).fill(2);

      const result = await manager.deriveKeys(password, authSalt, kekSalt);

      expect(result.authHash).toBeInstanceOf(Uint8Array);
      expect(result.authHash.length).toBe(32);
      expect(result.kek).toBeInstanceOf(Uint8Array);
      expect(result.kek.length).toBe(32);
    });

    it('should accept progress callback during derivation', async () => {
      const password = 'test-password';
      const salt = new Uint8Array(16).fill(1);
      const progressValues: number[] = [];

      await manager.deriveAuthHash(password, salt, (p) => progressValues.push(p));

      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('KEK Caching', () => {
    it('should cache KEK', async () => {
      const kek = new Uint8Array(32).fill(5);

      await manager.cacheKEK(kek);
      const hasCached = await manager.hasCachedKEK();

      expect(hasCached).toBe(true);
    });
  });

  describe('Key Wrapping', () => {
    it('should wrap a key', async () => {
      const keyToWrap = new Uint8Array(32).fill(3);
      const wrappingKey = new Uint8Array(32).fill(4);

      const result = await manager.wrapKey(keyToWrap, wrappingKey);

      expect(result.wrappedKey).toBeInstanceOf(Uint8Array);
      expect(result.iv).toBeInstanceOf(Uint8Array);
      expect(result.iv.length).toBe(12);
    });

    it('should unwrap a key', async () => {
      const wrappedKey = new Uint8Array(48);
      const iv = new Uint8Array(12);
      const wrappingKey = new Uint8Array(32).fill(4);

      const unwrapped = await manager.unwrapKey(wrappedKey, iv, wrappingKey);

      expect(unwrapped).toBeInstanceOf(Uint8Array);
      expect(unwrapped.length).toBe(32);
    });
  });

  describe('Memory Sanitization', () => {
    it('should sanitize worker memory', async () => {
      await manager.init();
      await manager.sanitize();
      expect(true).toBe(true);
    });

    it('should lock vault and sanitize', async () => {
      await manager.init();
      await manager.lock();
      const isAlive = await manager.ping();
      expect(isAlive).toBe(true);
    });
  });

  describe('Worker Lifecycle', () => {
    it('should terminate worker', () => {
      manager.terminate();
      expect(true).toBe(true);
    });

    it('should recreate worker after termination', async () => {
      await manager.init();
      manager.terminate();

      const isAlive = await manager.ping();
      expect(isAlive).toBe(true);
    });
  });
});

describe('Singleton Functions', () => {
  afterEach(() => {
    terminateCryptoWorker();
  });

  it('should get singleton instance', () => {
    const worker1 = getCryptoWorker();
    const worker2 = getCryptoWorker();

    expect(worker1).toBe(worker2);
  });

  it('should pre-warm crypto worker', async () => {
    await preWarmCryptoWorker();
    const worker = getCryptoWorker();
    const isAlive = await worker.ping();

    expect(isAlive).toBe(true);
  });

  it('should lock vault', async () => {
    await preWarmCryptoWorker();
    await lockVault();
    expect(true).toBe(true);
  });

  it('should terminate crypto worker', async () => {
    await preWarmCryptoWorker();
    terminateCryptoWorker();
    const worker = getCryptoWorker();
    expect(worker).toBeDefined();
  });
});

describe('SharedArrayBuffer Support', () => {
  it('should detect SharedArrayBuffer support', () => {
    const supports = CryptoWorkerManager.supportsSharedArrayBuffer;
    expect(typeof supports).toBe('boolean');
  });
});

describe('Error Handling', () => {
  let manager: CryptoWorkerManager;

  beforeEach(() => {
    manager = new CryptoWorkerManager();
  });

  afterEach(() => {
    manager.terminate();
  });

  it('should handle worker not initialized gracefully', async () => {
    manager.terminate();

    const isAlive = await manager.ping();
    expect(isAlive).toBe(true);
  });
});
