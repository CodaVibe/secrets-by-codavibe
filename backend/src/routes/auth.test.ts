import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { authRouter, constantTimeCompare } from './auth';

// Response types for type assertions
interface ErrorJson {
  error: string;
  code: string;
}

interface RegisterSuccessJson {
  userId: string;
  sessionToken: string;
}

interface LoginSuccessJson {
  userId: string;
  sessionToken: string;
  wrappedKey: string;
  kekSalt: string;
  authSalt: string;
  argon2Params: {
    memory: number;
    iterations: number;
    parallelism: number;
  };
}

// Mock D1 database
const createMockDB = () => ({
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
});

// Mock KV namespace
const createMockKV = () => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
});

// Mock environment
const createMockEnv = (db = createMockDB(), kv = createMockKV()) => ({
  DB: db,
  RATE_LIMIT: kv as unknown as KVNamespace,
  PEPPER: 'test-pepper-secret-value-for-testing',
});

// Helper to create valid registration request
const createValidRegisterRequest = (overrides = {}) => ({
  email: 'test@example.com',
  authHash: btoa('test-auth-hash-value'),
  authSalt: btoa('test-auth-salt-value'),
  kekSalt: btoa('test-kek-salt-value'),
  wrappedKey: btoa('test-wrapped-key-value'),
  argon2Params: {
    memory: 65536,
    iterations: 3,
    parallelism: 4,
  },
  ...overrides,
});

// Create test app
const createTestApp = (env = createMockEnv()) => {
  const app = new Hono<{ Bindings: typeof env }>();
  app.route('/api/auth', authRouter);
  return { app, env };
};

describe('POST /api/auth/register', () => {
  describe('Validation', () => {
    it('should reject empty request body', async () => {
      const { app, env } = createTestApp();
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing email', async () => {
      const { app, env } = createTestApp();
      const body = createValidRegisterRequest();
      delete (body as Record<string, unknown>).email;

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('Email');
    });


    it('should reject invalid email format', async () => {
      const { app, env } = createTestApp();
      const body = createValidRegisterRequest({ email: 'invalid-email' });

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('email');
    });

    it('should reject missing authHash', async () => {
      const { app, env } = createTestApp();
      const body = createValidRegisterRequest();
      delete (body as Record<string, unknown>).authHash;

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('AuthHash');
    });

    it('should reject invalid base64 authHash', async () => {
      const { app, env } = createTestApp();
      const body = createValidRegisterRequest({ authHash: 'not-valid-base64!!!' });

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('base64');
    });

    it('should reject invalid argon2 memory parameter', async () => {
      const { app, env } = createTestApp();
      const body = createValidRegisterRequest({
        argon2Params: { memory: 100, iterations: 3, parallelism: 4 },
      });

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('memory');
    });

    it('should reject invalid argon2 iterations parameter', async () => {
      const { app, env } = createTestApp();
      const body = createValidRegisterRequest({
        argon2Params: { memory: 65536, iterations: 0, parallelism: 4 },
      });

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('iterations');
    });
  });

  describe('Email uniqueness', () => {
    it('should reject duplicate email', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue({ id: 'existing-user-id' });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRegisterRequest()),
      }, env);

      expect(res.status).toBe(409);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('EMAIL_EXISTS');
    });

    it('should normalize email to lowercase', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const body = createValidRegisterRequest({ email: 'Test@EXAMPLE.com' });
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(mockDB.bind).toHaveBeenCalledWith('test@example.com');
    });
  });


  describe('Successful registration', () => {
    it('should create user and return userId and sessionToken', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRegisterRequest()),
      }, env);

      expect(res.status).toBe(201);
      const json = await res.json() as RegisterSuccessJson;
      expect(json.userId).toBeDefined();
      expect(json.sessionToken).toBeDefined();
      expect(typeof json.userId).toBe('string');
      expect(typeof json.sessionToken).toBe('string');
    });

    it('should generate unique userId (UUID format)', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRegisterRequest()),
      }, env);

      const json = await res.json() as RegisterSuccessJson;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(json.userId).toMatch(uuidRegex);
    });

    it('should store user with hashed authVerifier (not plain authHash)', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const body = createValidRegisterRequest();
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      const bindCalls = mockDB.bind.mock.calls;
      const insertCall = bindCalls[bindCalls.length - 1];
      
      expect(insertCall[2]).not.toBe(body.authHash);
      expect(typeof insertCall[2]).toBe('string');
    });

    it('should store argon2Params as JSON', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const body = createValidRegisterRequest();
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      const bindCalls = mockDB.bind.mock.calls;
      const insertCall = bindCalls[bindCalls.length - 1];
      
      const argon2ParamsJson = insertCall[6] as string;
      const parsed = JSON.parse(argon2ParamsJson);
      expect(parsed.m).toBe(65536);
      expect(parsed.t).toBe(3);
      expect(parsed.p).toBe(4);
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockRejectedValue(new Error('Database connection failed'));
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRegisterRequest()),
      }, env);

      expect(res.status).toBe(500);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('INTERNAL_ERROR');
    });

    it('should handle race condition on duplicate email', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      mockDB.run.mockRejectedValue(new Error('UNIQUE constraint failed: users.email'));
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRegisterRequest()),
      }, env);

      expect(res.status).toBe(409);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('EMAIL_EXISTS');
    });
  });
});


// Helper to create valid login request
const createValidLoginRequest = (overrides = {}) => ({
  email: 'test@example.com',
  authHash: btoa('test-auth-hash-value'),
  ...overrides,
});

// Helper to create mock user from database
const createMockUser = (overrides = {}) => ({
  id: 'user-123-uuid',
  email: 'test@example.com',
  auth_verifier: 'mock-verifier',
  auth_salt: btoa('test-auth-salt'),
  kek_salt: btoa('test-kek-salt'),
  wrapped_key: btoa('test-wrapped-key'),
  argon2_params: '{"m":65536,"t":3,"p":4}',
  failed_login_attempts: 0,
  locked_until: null,
  ...overrides,
});

describe('POST /api/auth/login', () => {
  describe('Validation', () => {
    it('should reject empty request body', async () => {
      const { app, env } = createTestApp();
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('VALIDATION_ERROR');
    });

    it('should reject missing email', async () => {
      const { app, env } = createTestApp();
      const body = createValidLoginRequest();
      delete (body as Record<string, unknown>).email;

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('Email');
    });

    it('should reject invalid email format', async () => {
      const { app, env } = createTestApp();
      const body = createValidLoginRequest({ email: 'invalid-email' });

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('email');
    });

    it('should reject missing authHash', async () => {
      const { app, env } = createTestApp();
      const body = createValidLoginRequest();
      delete (body as Record<string, unknown>).authHash;

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('AuthHash');
    });

    it('should reject invalid base64 authHash', async () => {
      const { app, env } = createTestApp();
      const body = createValidLoginRequest({ authHash: 'not-valid-base64!!!' });

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(res.status).toBe(400);
      const json = await res.json() as ErrorJson;
      expect(json.error).toContain('base64');
    });
  });

  describe('User lookup', () => {
    it('should return 401 for non-existent user', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidLoginRequest()),
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('INVALID_CREDENTIALS');
      expect(json.error).toBe('Invalid email or password');
    });

    it('should normalize email to lowercase for lookup', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(null);
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const body = createValidLoginRequest({ email: 'Test@EXAMPLE.com' });
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, env);

      expect(mockDB.bind).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('Account lockout', () => {
    it('should return 423 for locked account', async () => {
      const mockDB = createMockDB();
      const futureTime = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
      mockDB.first.mockResolvedValue(createMockUser({ locked_until: futureTime }));
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidLoginRequest()),
      }, env);

      expect(res.status).toBe(423);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('ACCOUNT_LOCKED');
    });

    it('should allow login if lockout has expired', async () => {
      const mockDB = createMockDB();
      const pastTime = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      mockDB.first.mockResolvedValue(createMockUser({ locked_until: pastTime }));
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidLoginRequest()),
      }, env);

      // Will fail auth (wrong verifier) but not due to lockout
      expect(res.status).toBe(401);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('INVALID_CREDENTIALS');
    });

    it('should increment failed_login_attempts on wrong password', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(createMockUser({ failed_login_attempts: 2 }));
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidLoginRequest()),
      }, env);

      // Check that update was called with incremented count
      const bindCalls = mockDB.bind.mock.calls;
      const updateCall = bindCalls[bindCalls.length - 1];
      expect(updateCall[0]).toBe(3); // failed_login_attempts incremented
    });

    it('should lock account after 5 failed attempts', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockResolvedValue(createMockUser({ failed_login_attempts: 4 }));
      mockDB.run.mockResolvedValue({ success: true });
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidLoginRequest()),
      }, env);

      expect(res.status).toBe(423);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('ACCOUNT_LOCKED');

      // Check that locked_until was set
      const bindCalls = mockDB.bind.mock.calls;
      const updateCall = bindCalls[bindCalls.length - 1];
      expect(updateCall[0]).toBe(5); // failed_login_attempts = 5
      expect(typeof updateCall[1]).toBe('number'); // locked_until timestamp
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockDB = createMockDB();
      mockDB.first.mockRejectedValue(new Error('Database connection failed'));
      const { app, env } = createTestApp(createMockEnv(mockDB));

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidLoginRequest()),
      }, env);

      expect(res.status).toBe(500);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('INTERNAL_ERROR');
    });
  });
});

describe('POST /api/auth/logout', () => {
  describe('Authorization header validation', () => {
    it('should reject request without Authorization header', async () => {
      const { app, env } = createTestApp();
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('UNAUTHORIZED');
      expect(json.error).toContain('Authorization');
    });

    it('should reject request with invalid Authorization header format', async () => {
      const { app, env } = createTestApp();
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Basic abc123' },
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with empty Bearer token', async () => {
      const { app, env } = createTestApp();
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' },
      }, env);

      expect(res.status).toBe(401);
      const json = await res.json() as ErrorJson;
      expect(json.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Successful logout', () => {
    it('should return success with valid session token', async () => {
      const { app, env } = createTestApp();
      const res = await app.request('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid-session-token-here' },
      }, env);

      expect(res.status).toBe(200);
      const json = await res.json() as { success: boolean; message: string };
      expect(json.success).toBe(true);
      expect(json.message).toBe('Logged out successfully');
    });
  });
});

describe('constantTimeCompare', () => {
  it('should return true for identical strings', () => {
    expect(constantTimeCompare('abc123', 'abc123')).toBe(true);
    expect(constantTimeCompare('', '')).toBe(true);
    expect(constantTimeCompare('a', 'a')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(constantTimeCompare('abc123', 'abc124')).toBe(false);
    expect(constantTimeCompare('abc', 'abd')).toBe(false);
    expect(constantTimeCompare('a', 'b')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(constantTimeCompare('abc', 'abcd')).toBe(false);
    expect(constantTimeCompare('abcd', 'abc')).toBe(false);
    expect(constantTimeCompare('', 'a')).toBe(false);
  });

  it('should handle special characters', () => {
    expect(constantTimeCompare('a+b/c=', 'a+b/c=')).toBe(true);
    expect(constantTimeCompare('a+b/c=', 'a+b/c!')).toBe(false);
  });
});
