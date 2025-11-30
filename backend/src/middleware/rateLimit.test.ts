import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  checkRateLimit,
  getClientIP,
  setRateLimitHeaders,
  rateLimitMiddleware,
  authRateLimitMiddleware,
  registrationRateLimitMiddleware,
  RateLimitConfig,
} from './rateLimit';

// Mock KV namespace
function createMockKV() {
  const store = new Map<string, { value: string; expiration?: number }>();

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiration && Date.now() / 1000 > item.expiration) {
        store.delete(key);
        return null;
      }
      return item.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expiration = options?.expirationTtl
        ? Math.floor(Date.now() / 1000) + options.expirationTtl
        : undefined;
      store.set(key, { value, expiration });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
    _clear: () => store.clear(),
  } as unknown as KVNamespace & { _store: Map<string, any>; _clear: () => void };
}

describe('checkRateLimit', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-27T12:00:00Z'));
  });

  it('should allow first request and set remaining to limit - 1', async () => {
    const result = await checkRateLimit('192.168.1.1', mockKV);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(mockKV.put).toHaveBeenCalledWith('rate_limit:192.168.1.1', '1', { expirationTtl: 900 });
  });

  it('should decrement remaining on subsequent requests', async () => {
    // First request
    await checkRateLimit('192.168.1.1', mockKV);
    
    // Second request
    const result = await checkRateLimit('192.168.1.1', mockKV);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);
  });

  it('should block requests after limit is reached', async () => {
    // Make 5 requests (the limit)
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('192.168.1.1', mockKV);
    }

    // 6th request should be blocked
    const result = await checkRateLimit('192.168.1.1', mockKV);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should use custom config when provided', async () => {
    const config: RateLimitConfig = {
      limit: 10,
      windowSeconds: 60,
      keyPrefix: 'custom',
    };

    const result = await checkRateLimit('192.168.1.1', mockKV, config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(mockKV.put).toHaveBeenCalledWith('custom:192.168.1.1', '1', { expirationTtl: 60 });
  });

  it('should track different IPs separately', async () => {
    // Exhaust limit for IP1
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('192.168.1.1', mockKV);
    }

    // IP2 should still be allowed
    const result = await checkRateLimit('192.168.1.2', mockKV);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should return correct resetAt timestamp', async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await checkRateLimit('192.168.1.1', mockKV);

    expect(result.resetAt).toBe(now + 900);
  });
});

describe('getClientIP', () => {
  it('should return CF-Connecting-IP header if present', () => {
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'CF-Connecting-IP') return '1.2.3.4';
          return undefined;
        }),
      },
    } as any;

    expect(getClientIP(mockContext)).toBe('1.2.3.4');
  });

  it('should return X-Forwarded-For first IP if CF-Connecting-IP not present', () => {
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'X-Forwarded-For') return '5.6.7.8, 9.10.11.12';
          return undefined;
        }),
      },
    } as any;

    expect(getClientIP(mockContext)).toBe('5.6.7.8');
  });

  it('should return X-Real-IP if other headers not present', () => {
    const mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'X-Real-IP') return '13.14.15.16';
          return undefined;
        }),
      },
    } as any;

    expect(getClientIP(mockContext)).toBe('13.14.15.16');
  });

  it('should return 127.0.0.1 as fallback', () => {
    const mockContext = {
      req: {
        header: vi.fn(() => undefined),
      },
    } as any;

    expect(getClientIP(mockContext)).toBe('127.0.0.1');
  });
});

describe('setRateLimitHeaders', () => {
  it('should set all rate limit headers', () => {
    const headers: Record<string, string> = {};
    const mockContext = {
      header: vi.fn((name: string, value: string) => {
        headers[name] = value;
      }),
    } as any;

    setRateLimitHeaders(mockContext, { allowed: true, remaining: 3, resetAt: 1732708800 }, 5);

    expect(headers['X-RateLimit-Limit']).toBe('5');
    expect(headers['X-RateLimit-Remaining']).toBe('3');
    expect(headers['X-RateLimit-Reset']).toBe('1732708800');
  });
});

describe('rateLimitMiddleware', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let app: Hono<{ Bindings: { RATE_LIMIT: KVNamespace } }>;

  beforeEach(() => {
    mockKV = createMockKV();
    app = new Hono<{ Bindings: { RATE_LIMIT: KVNamespace } }>();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-27T12:00:00Z'));
  });

  it('should allow requests within limit', async () => {
    app.use('*', rateLimitMiddleware());
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test', {}, { RATE_LIMIT: mockKV });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should return 429 when rate limit exceeded', async () => {
    app.use('*', rateLimitMiddleware());
    app.get('/test', (c) => c.json({ success: true }));

    // Make 5 requests to exhaust limit
    for (let i = 0; i < 5; i++) {
      await app.request('/test', {}, { RATE_LIMIT: mockKV });
    }

    // 6th request should be blocked
    const res = await app.request('/test', {}, { RATE_LIMIT: mockKV });

    expect(res.status).toBe(429);
    const body = await res.json() as { error: string; retryAfter: number };
    expect(body.error).toBe('Too Many Requests');
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it('should continue if KV namespace not configured', async () => {
    app.use('*', rateLimitMiddleware());
    app.get('/test', (c) => c.json({ success: true }));

    const res = await app.request('/test', {}, { RATE_LIMIT: undefined as any });

    expect(res.status).toBe(200);
  });

  it('should use custom config', async () => {
    app.use('*', rateLimitMiddleware({ limit: 2, windowSeconds: 60 }));
    app.get('/test', (c) => c.json({ success: true }));

    // First request
    const res1 = await app.request('/test', {}, { RATE_LIMIT: mockKV });
    expect(res1.headers.get('X-RateLimit-Limit')).toBe('2');
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('1');

    // Second request
    const res2 = await app.request('/test', {}, { RATE_LIMIT: mockKV });
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('0');

    // Third request should be blocked
    const res3 = await app.request('/test', {}, { RATE_LIMIT: mockKV });
    expect(res3.status).toBe(429);
  });
});

describe('authRateLimitMiddleware', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let app: Hono<{ Bindings: { RATE_LIMIT: KVNamespace } }>;

  beforeEach(() => {
    mockKV = createMockKV();
    app = new Hono<{ Bindings: { RATE_LIMIT: KVNamespace } }>();
  });

  it('should use auth-specific key prefix', async () => {
    app.use('*', authRateLimitMiddleware());
    app.post('/login', (c) => c.json({ success: true }));

    await app.request('/login', { method: 'POST' }, { RATE_LIMIT: mockKV });

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('auth_rate_limit:'),
      '1',
      { expirationTtl: 900 }
    );
  });
});

describe('registrationRateLimitMiddleware', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let app: Hono<{ Bindings: { RATE_LIMIT: KVNamespace } }>;

  beforeEach(() => {
    mockKV = createMockKV();
    app = new Hono<{ Bindings: { RATE_LIMIT: KVNamespace } }>();
  });

  it('should use registration-specific key prefix and 1 hour window', async () => {
    app.use('*', registrationRateLimitMiddleware());
    app.post('/register', (c) => c.json({ success: true }));

    await app.request('/register', { method: 'POST' }, { RATE_LIMIT: mockKV });

    expect(mockKV.put).toHaveBeenCalledWith(
      expect.stringContaining('reg_rate_limit:'),
      '1',
      { expirationTtl: 3600 }
    );
  });
});
