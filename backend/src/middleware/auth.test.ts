import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import {
  sessionMiddleware,
  createSession,
  getSession,
  deleteSession,
  extractBearerToken,
  type SessionData,
  type AuthVariables,
} from './auth';

// Mock KV namespace
const createMockKV = () => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
});

// Mock environment
const createMockEnv = (kv = createMockKV()) => ({
  RATE_LIMIT: kv as unknown as KVNamespace,
});

// Create test app with session middleware
const createTestApp = (env = createMockEnv()) => {
  const app = new Hono<{ Bindings: typeof env; Variables: AuthVariables }>();
  app.use('/protected/*', sessionMiddleware());
  app.get('/protected/resource', (c) => {
    const userId = c.get('userId');
    const sessionToken = c.get('sessionToken');
    return c.json({ userId, sessionToken });
  });
  return { app, env };
};

describe('extractBearerToken', () => {
  it('should extract token from valid Bearer header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    expect(extractBearerToken('Bearer my-session-token')).toBe('my-session-token');
  });

  it('should return null for missing header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('should return null for non-Bearer header', () => {
    expect(extractBearerToken('Basic abc123')).toBeNull();
    expect(extractBearerToken('Token abc123')).toBeNull();
  });

  it('should return null for empty Bearer token', () => {
    expect(extractBearerToken('Bearer ')).toBeNull();
  });

  it('should handle Bearer with spaces in token', () => {
    expect(extractBearerToken('Bearer token with spaces')).toBe('token with spaces');
  });
});

describe('createSession', () => {
  it('should create session with correct data', async () => {
    const mockKV = createMockKV();
    const sessionToken = 'test-session-token';
    const userId = 'user-123';

    const session = await createSession(
      mockKV as unknown as KVNamespace,
      sessionToken,
      userId
    );

    expect(session.userId).toBe(userId);
    expect(session.createdAt).toBeDefined();
    expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    expect(mockKV.put).toHaveBeenCalledWith(
      'session:test-session-token',
      expect.any(String),
      expect.objectContaining({ expirationTtl: expect.any(Number) })
    );
  });

  it('should use custom config', async () => {
    const mockKV = createMockKV();
    const sessionToken = 'test-token';
    const userId = 'user-456';

    await createSession(mockKV as unknown as KVNamespace, sessionToken, userId, {
      sessionDurationSeconds: 3600,
      keyPrefix: 'custom_session',
    });

    expect(mockKV.put).toHaveBeenCalledWith(
      'custom_session:test-token',
      expect.any(String),
      expect.objectContaining({ expirationTtl: 3600 })
    );
  });
});

describe('getSession', () => {
  it('should return session data for valid session', async () => {
    const mockKV = createMockKV();
    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      userId: 'user-123',
      createdAt: now - 100,
      expiresAt: now + 3600,
    };
    mockKV.get.mockResolvedValue(JSON.stringify(sessionData));

    const result = await getSession(
      mockKV as unknown as KVNamespace,
      'valid-token'
    );

    expect(result).toEqual(sessionData);
    expect(mockKV.get).toHaveBeenCalledWith('session:valid-token');
  });

  it('should return null for non-existent session', async () => {
    const mockKV = createMockKV();
    mockKV.get.mockResolvedValue(null);

    const result = await getSession(
      mockKV as unknown as KVNamespace,
      'invalid-token'
    );

    expect(result).toBeNull();
  });

  it('should return null and delete expired session', async () => {
    const mockKV = createMockKV();
    const now = Math.floor(Date.now() / 1000);
    const expiredSession: SessionData = {
      userId: 'user-123',
      createdAt: now - 7200,
      expiresAt: now - 3600, // Expired 1 hour ago
    };
    mockKV.get.mockResolvedValue(JSON.stringify(expiredSession));

    const result = await getSession(
      mockKV as unknown as KVNamespace,
      'expired-token'
    );

    expect(result).toBeNull();
    expect(mockKV.delete).toHaveBeenCalledWith('session:expired-token');
  });

  it('should return null for invalid JSON', async () => {
    const mockKV = createMockKV();
    mockKV.get.mockResolvedValue('invalid-json');

    const result = await getSession(
      mockKV as unknown as KVNamespace,
      'bad-token'
    );

    expect(result).toBeNull();
  });
});

describe('deleteSession', () => {
  it('should delete session from KV', async () => {
    const mockKV = createMockKV();

    await deleteSession(mockKV as unknown as KVNamespace, 'token-to-delete');

    expect(mockKV.delete).toHaveBeenCalledWith('session:token-to-delete');
  });

  it('should use custom key prefix', async () => {
    const mockKV = createMockKV();

    await deleteSession(mockKV as unknown as KVNamespace, 'token', {
      sessionDurationSeconds: 3600,
      keyPrefix: 'custom',
    });

    expect(mockKV.delete).toHaveBeenCalledWith('custom:token');
  });
});

describe('sessionMiddleware', () => {
  describe('Authorization header validation', () => {
    it('should return 401 without Authorization header', async () => {
      const mockKV = createMockKV();
      const { app, env } = createTestApp(createMockEnv(mockKV));

      const res = await app.request('/protected/resource', {
        method: 'GET',
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as { error: string; code: string };
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid Authorization format', async () => {
      const mockKV = createMockKV();
      const { app, env } = createTestApp(createMockEnv(mockKV));

      const res = await app.request('/protected/resource', {
        method: 'GET',
        headers: { Authorization: 'Basic abc123' },
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as { error: string; code: string };
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with empty Bearer token', async () => {
      const mockKV = createMockKV();
      const { app, env } = createTestApp(createMockEnv(mockKV));

      const res = await app.request('/protected/resource', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' },
      }, env);

      expect(res.status).toBe(401);
    });
  });

  describe('Session validation', () => {
    it('should return 401 for invalid session token', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockResolvedValue(null);
      const { app, env } = createTestApp(createMockEnv(mockKV));

      const res = await app.request('/protected/resource', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid-token' },
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as { error: string; code: string };
      expect(json.code).toBe('INVALID_SESSION');
    });

    it('should return 401 for expired session', async () => {
      const mockKV = createMockKV();
      const now = Math.floor(Date.now() / 1000);
      mockKV.get.mockResolvedValue(JSON.stringify({
        userId: 'user-123',
        createdAt: now - 7200,
        expiresAt: now - 3600,
      }));
      const { app, env } = createTestApp(createMockEnv(mockKV));

      const res = await app.request('/protected/resource', {
        method: 'GET',
        headers: { Authorization: 'Bearer expired-token' },
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as { error: string; code: string };
      expect(json.code).toBe('INVALID_SESSION');
    });
  });

  describe('Successful authentication', () => {
    it('should attach userId to context for valid session', async () => {
      const mockKV = createMockKV();
      const now = Math.floor(Date.now() / 1000);
      mockKV.get.mockResolvedValue(JSON.stringify({
        userId: 'user-abc-123',
        createdAt: now - 100,
        expiresAt: now + 3600,
      }));
      const { app, env } = createTestApp(createMockEnv(mockKV));

      const res = await app.request('/protected/resource', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-session-token' },
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as { userId: string; sessionToken: string };
      expect(json.userId).toBe('user-abc-123');
      expect(json.sessionToken).toBe('valid-session-token');
    });
  });

  describe('Error handling', () => {
    it('should return 500 if KV namespace not configured', async () => {
      const app = new Hono<{ Bindings: { RATE_LIMIT: undefined }; Variables: AuthVariables }>();
      app.use('/protected/*', sessionMiddleware());
      app.get('/protected/resource', (c) => c.json({ ok: true }));

      const res = await app.request('/protected/resource', {
        method: 'GET',
        headers: { Authorization: 'Bearer some-token' },
      }, { RATE_LIMIT: undefined });

      expect(res.status).toBe(500);
      const json = await res.json() as { error: string; code: string };
      expect(json.code).toBe('INTERNAL_ERROR');
    });
  });
});
