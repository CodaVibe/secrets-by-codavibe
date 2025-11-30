/**
 * Crypto Worker - Web Worker for Heavy Cryptographic Operations
 * 
 * Offloads heavy Argon2id computation to a Web Worker to prevent UI blocking.
 * This module provides the main thread interface for communicating with the worker.
 * 
 * Design Properties (P18.1-P18.5):
 * - P18.1: Worker pre-warmed on app load
 * - P18.2: Argon2id params adaptive (300-500ms target)
 * - P18.3: KEK cached in worker memory during session
 * - P18.4: Memory sanitization on lock (overwrite with random data)
 * - P18.5: Use SharedArrayBuffer if available (crossOriginIsolated)
 * 
 * Security Considerations:
 * - KEK is cached in worker memory only, never in main thread after derivation
 * - Memory sanitization overwrites sensitive data with random bytes
 * - Worker terminates and recreates on lock for complete memory cleanup
 */

// Message types for worker communication
export interface WorkerMessage {
  id: string;
  type: WorkerMessageType;
  payload?: unknown;
}

export type WorkerMessageType =
  | 'init'
  | 'deriveAuthHash'
  | 'deriveKEK'
  | 'deriveKeys'
  | 'cacheKEK'
  | 'getCachedKEK'
  | 'wrapKey'
  | 'unwrapKey'
  | 'sanitize'
  | 'ping';

export interface WorkerResponse {
  id: string;
  type: 'success' | 'error' | 'progress';
  payload?: unknown;
  error?: string;
}

export interface DeriveAuthHashPayload {
  password: string;
  salt: Uint8Array;
}

export interface DeriveKEKPayload {
  password: string;
  salt: Uint8Array;
}

export interface DeriveKeysPayload {
  password: string;
  authSalt: Uint8Array;
  kekSalt: Uint8Array;
}

export interface DeriveKeysResult {
  authHash: Uint8Array;
  kek: Uint8Array;
}

export interface WrapKeyPayload {
  keyToWrap: Uint8Array;
  wrappingKey?: Uint8Array; // If not provided, uses cached KEK
}

export interface WrapKeyResult {
  wrappedKey: Uint8Array;
  iv: Uint8Array;
}

export interface UnwrapKeyPayload {
  wrappedKey: Uint8Array;
  iv: Uint8Array;
  wrappingKey?: Uint8Array; // If not provided, uses cached KEK
}

/**
 * Crypto Worker Manager
 * 
 * Manages the lifecycle of the crypto worker and provides
 * a promise-based API for cryptographic operations.
 */
export class CryptoWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: number) => void;
  }>();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private requestCounter = 0;

  /**
   * Check if SharedArrayBuffer is available (requires crossOriginIsolated)
   */
  static get supportsSharedArrayBuffer(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && 
           typeof crossOriginIsolated !== 'undefined' && 
           crossOriginIsolated;
  }

  /**
   * Initialize the crypto worker
   * Pre-warms the worker for faster subsequent operations (P18.1)
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initWorker();
    await this.initPromise;
    this.isInitialized = true;
  }

  private async _initWorker(): Promise<void> {
    // Create worker using Vite's ?worker syntax
    const WorkerConstructor = (await import('./crypto.worker?worker')).default;
    this.worker = new WorkerConstructor();

    // Set up message handler
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, type, payload, error } = event.data;
      const pending = this.pendingRequests.get(id);
      
      if (!pending) return;

      if (type === 'progress' && pending.onProgress) {
        pending.onProgress(payload as number);
        return;
      }

      this.pendingRequests.delete(id);

      if (type === 'error') {
        pending.reject(new Error(error || 'Worker error'));
      } else {
        pending.resolve(payload);
      }
    };

    this.worker.onerror = (error) => {
      console.error('Crypto worker error:', error);
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('Worker error'));
        this.pendingRequests.delete(id);
      }
    };

    // Send init message and wait for response
    await this.sendMessage('init', { 
      supportsSharedArrayBuffer: CryptoWorkerManager.supportsSharedArrayBuffer 
    });
  }

  /**
   * Send a message to the worker and wait for response
   */
  private sendMessage<T>(
    type: WorkerMessageType,
    payload?: unknown,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `${++this.requestCounter}-${Date.now()}`;
      
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
      });

      const message: WorkerMessage = { id, type, payload };
      this.worker.postMessage(message);
    });
  }

  /**
   * Derive AuthHash from password (for server authentication)
   */
  async deriveAuthHash(
    password: string,
    salt: Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<Uint8Array> {
    await this.init();
    const payload: DeriveAuthHashPayload = { password, salt };
    return this.sendMessage<Uint8Array>('deriveAuthHash', payload, onProgress);
  }

  /**
   * Derive KEK from password (for key wrapping)
   */
  async deriveKEK(
    password: string,
    salt: Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<Uint8Array> {
    await this.init();
    const payload: DeriveKEKPayload = { password, salt };
    return this.sendMessage<Uint8Array>('deriveKEK', payload, onProgress);
  }

  /**
   * Derive both AuthHash and KEK from password
   * More efficient than calling both separately
   */
  async deriveKeys(
    password: string,
    authSalt: Uint8Array,
    kekSalt: Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<DeriveKeysResult> {
    await this.init();
    const payload: DeriveKeysPayload = { password, authSalt, kekSalt };
    return this.sendMessage<DeriveKeysResult>('deriveKeys', payload, onProgress);
  }

  /**
   * Cache KEK in worker memory (P18.3)
   * KEK stays in worker, never returned to main thread after this
   */
  async cacheKEK(kek: Uint8Array): Promise<void> {
    await this.init();
    await this.sendMessage('cacheKEK', { kek });
  }

  /**
   * Check if KEK is cached in worker
   */
  async hasCachedKEK(): Promise<boolean> {
    await this.init();
    return this.sendMessage<boolean>('getCachedKEK', { checkOnly: true });
  }

  /**
   * Wrap a key using cached KEK or provided wrapping key
   */
  async wrapKey(
    keyToWrap: Uint8Array,
    wrappingKey?: Uint8Array
  ): Promise<WrapKeyResult> {
    await this.init();
    const payload: WrapKeyPayload = { keyToWrap, wrappingKey };
    return this.sendMessage<WrapKeyResult>('wrapKey', payload);
  }

  /**
   * Unwrap a key using cached KEK or provided wrapping key
   */
  async unwrapKey(
    wrappedKey: Uint8Array,
    iv: Uint8Array,
    wrappingKey?: Uint8Array
  ): Promise<Uint8Array> {
    await this.init();
    const payload: UnwrapKeyPayload = { wrappedKey, iv, wrappingKey };
    return this.sendMessage<Uint8Array>('unwrapKey', payload);
  }

  /**
   * Sanitize worker memory (P18.4)
   * Overwrites cached keys with random data
   */
  async sanitize(): Promise<void> {
    if (!this.worker) return;
    await this.sendMessage('sanitize');
  }

  /**
   * Lock the vault - sanitize and terminate worker
   * Creates a fresh worker on next operation for complete memory cleanup
   */
  async lock(): Promise<void> {
    if (!this.worker) return;
    
    try {
      await this.sanitize();
    } catch {
      // Ignore errors during sanitization
    }
    
    this.terminate();
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.initPromise = null;
    this.pendingRequests.clear();
  }

  /**
   * Ping the worker to check if it's responsive
   */
  async ping(): Promise<boolean> {
    try {
      await this.init();
      await this.sendMessage('ping');
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance for app-wide use
let cryptoWorkerInstance: CryptoWorkerManager | null = null;

/**
 * Get the singleton crypto worker instance
 */
export function getCryptoWorker(): CryptoWorkerManager {
  if (!cryptoWorkerInstance) {
    cryptoWorkerInstance = new CryptoWorkerManager();
  }
  return cryptoWorkerInstance;
}

/**
 * Pre-warm the crypto worker on app load (P18.1)
 * Call this early in app initialization
 */
export async function preWarmCryptoWorker(): Promise<void> {
  const worker = getCryptoWorker();
  await worker.init();
}

/**
 * Lock the vault and sanitize worker memory
 */
export async function lockVault(): Promise<void> {
  if (cryptoWorkerInstance) {
    await cryptoWorkerInstance.lock();
  }
}

/**
 * Terminate and cleanup the crypto worker
 */
export function terminateCryptoWorker(): void {
  if (cryptoWorkerInstance) {
    cryptoWorkerInstance.terminate();
    cryptoWorkerInstance = null;
  }
}
