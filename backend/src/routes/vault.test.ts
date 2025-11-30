import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { vaultRouter, type ServicesResponse, type CreateServiceResponse, type ErrorResponse, type UpdateCredentialResponse } from './vault';

// Mock types
interface MockService {
  id: string;
  name: string;
  icon: string | null;
  created_at: number;
  updated_at: number;
}

// Helper to create mock KV namespace
function createMockKV(sessionData: Record<string, string> = {}) {
  return {
    get: vi.fn(async (key: string) => sessionData[key] || null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}

// Helper to create mock D1 database
function createMockDB(services: MockService[] = []) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          success: true,
          results: services,
        })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true })),
      })),
    })),
  };
}

// Helper to create valid session data
function createSessionData(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    userId,
    createdAt: now,
    expiresAt: now + 86400, // 24 hours
  });
}

describe('GET /api/vault/services', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 401 when session token is invalid', async () => {
    const mockKV = createMockKV(); // Empty KV = no valid sessions
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('INVALID_SESSION');
  });

  it('should return empty array when user has no services', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB([]); // No services

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as ServicesResponse;
    expect(body.services).toEqual([]);
  });

  it('should return services for authenticated user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockServices: MockService[] = [
      {
        id: 'service-1',
        name: 'GitHub',
        icon: 'github-icon',
        created_at: now - 3600,
        updated_at: now,
      },
      {
        id: 'service-2',
        name: 'AWS',
        icon: null,
        created_at: now - 7200,
        updated_at: now - 1800,
      },
    ];

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB(mockServices);

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as ServicesResponse;
    expect(body.services).toHaveLength(2);
    expect(body.services[0]).toEqual({
      id: 'service-1',
      name: 'GitHub',
      icon: 'github-icon',
      createdAt: now - 3600,
      updatedAt: now,
    });
    expect(body.services[1]).toEqual({
      id: 'service-2',
      name: 'AWS',
      icon: null,
      createdAt: now - 7200,
      updatedAt: now - 1800,
    });
  });

  it('should transform snake_case to camelCase in response', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockServices: MockService[] = [
      {
        id: 'service-1',
        name: 'Test Service',
        icon: 'test-icon',
        created_at: now - 100,
        updated_at: now,
      },
    ];

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB(mockServices);

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as ServicesResponse;
    
    // Verify camelCase keys
    expect(body.services[0]).toHaveProperty('createdAt');
    expect(body.services[0]).toHaveProperty('updatedAt');
    expect(body.services[0]).not.toHaveProperty('created_at');
    expect(body.services[0]).not.toHaveProperty('updated_at');
  });

  it('should return 500 when database query fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    
    // Mock DB that returns failure
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => ({
            success: false,
            error: 'Database error',
          })),
        })),
      })),
    };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify correct SQL query is executed', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    
    const prepareMock = vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          success: true,
          results: [],
        })),
      })),
    }));
    
    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify the SQL query includes correct WHERE and ORDER BY clauses
    expect(prepareMock).toHaveBeenCalled();
    const calls = prepareMock.mock.calls as unknown[][];
    const sqlQuery = calls[0]?.[0] as string | undefined;
    expect(sqlQuery).toContain('user_id = ?');
    expect(sqlQuery).toContain('is_deleted = 0');
    expect(sqlQuery).toContain('ORDER BY updated_at DESC');
  });

  it('should handle expired session', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredSessionData = JSON.stringify({
      userId: testUserId,
      createdAt: now - 86400 * 2, // 2 days ago
      expiresAt: now - 86400, // Expired 1 day ago
    });

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: expiredSessionData,
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('INVALID_SESSION');
  });
});

describe('POST /api/vault/services', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';

  // Helper to create valid session data
  function createSessionData(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      userId,
      createdAt: now,
      expiresAt: now + 86400,
    });
  }

  // Helper to create mock KV namespace
  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  // Helper to create mock D1 database for POST
  function createMockDB(runSuccess = true) {
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => ({ success: true, results: [] })),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({ success: runSuccess })),
        })),
      })),
    };
  }

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Service' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when name is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    // Zod returns generic message for missing required fields
    expect(body.error).toBeDefined();
  });

  it('should return 400 when name is empty', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '   ' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('empty');
  });

  it('should return 400 when name exceeds 255 characters', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'a'.repeat(256) }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('255');
  });

  it('should return 400 when icon exceeds 500 characters', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Test', icon: 'a'.repeat(501) }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('500');
  });

  it('should create service successfully with name only', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'GitHub' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateServiceResponse;
    expect(body.service).toBeDefined();
    expect(body.service.name).toBe('GitHub');
    expect(body.service.icon).toBeNull();
    expect(body.service.id).toBeDefined();
    expect(body.service.createdAt).toBeDefined();
    expect(body.service.updatedAt).toBeDefined();
  });

  it('should create service successfully with name and icon', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'AWS', icon: 'aws-icon-url' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateServiceResponse;
    expect(body.service.name).toBe('AWS');
    expect(body.service.icon).toBe('aws-icon-url');
  });

  it('should trim whitespace from service name', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '  GitHub  ' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateServiceResponse;
    expect(body.service.name).toBe('GitHub');
  });

  it('should return 500 when database insert fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB(false); // runSuccess = false

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Test Service' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify correct SQL INSERT is executed', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const bindMock = vi.fn(() => ({
      all: vi.fn(async () => ({ success: true, results: [] })),
      first: vi.fn(async () => null),
      run: vi.fn(async () => ({ success: true })),
    }));

    const prepareMock = vi.fn(() => ({ bind: bindMock }));
    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Test Service', icon: 'test-icon' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify INSERT query
    expect(prepareMock).toHaveBeenCalled();
    const calls = prepareMock.mock.calls as unknown[][];
    const sqlQuery = calls[0]?.[0] as string | undefined;
    expect(sqlQuery).toContain('INSERT INTO services');
    expect(sqlQuery).toContain('user_id');
    expect(sqlQuery).toContain('name');
    expect(sqlQuery).toContain('icon');
  });

  it('should generate unique service IDs', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res1 = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Service 1' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    const res2 = await app.request('/api/vault/services', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Service 2' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    const body1 = await res1.json() as CreateServiceResponse;
    const body2 = await res2.json() as CreateServiceResponse;

    expect(body1.service.id).not.toBe(body2.service.id);
  });
});


describe('DELETE /api/vault/services/:id', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testServiceId = 'service-123';

  // Helper to create valid session data
  function createSessionData(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      userId,
      createdAt: now,
      expiresAt: now + 86400,
    });
  }

  // Helper to create mock KV namespace
  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  // Helper to create mock D1 database for DELETE
  function createMockDBForDelete(options: {
    serviceExists?: boolean;
    serviceUserId?: string;
    isDeleted?: number;
    runSuccess?: boolean;
  } = {}) {
    const {
      serviceExists = true,
      serviceUserId = testUserId,
      isDeleted = 0,
      runSuccess = true,
    } = options;

    return {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!serviceExists) return null;
            return {
              id: testServiceId,
              user_id: serviceUserId,
              is_deleted: isDeleted,
            };
          }),
          run: vi.fn(async () => ({ success: runSuccess })),
          all: vi.fn(async () => ({ success: true, results: [] })),
        })),
      })),
    };
  }

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDBForDelete();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 404 when service does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ serviceExists: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when service belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ serviceUserId: 'different-user-456' });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 410 when service is already deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ isDeleted: 1 });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(410);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('ALREADY_DELETED');
  });

  it('should successfully soft delete service', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('should return 500 when database update fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ runSuccess: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify correct SQL queries are executed for soft delete', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const prepareMock = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          id: testServiceId,
          user_id: testUserId,
          is_deleted: 0,
        })),
        run: vi.fn(async () => ({ success: true })),
        all: vi.fn(async () => ({ success: true, results: [] })),
      })),
    }));

    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify SQL queries
    const calls = prepareMock.mock.calls as unknown[][];
    const sqlQueries = calls.map(call => call[0] as string);

    // Should have SELECT query to verify ownership
    expect(sqlQueries.some(sql => sql.includes('SELECT') && sql.includes('services'))).toBe(true);

    // Should have UPDATE query for services
    expect(sqlQueries.some(sql => sql.includes('UPDATE services') && sql.includes('is_deleted = 1'))).toBe(true);

    // Should have UPDATE query for credentials (cascade delete)
    expect(sqlQueries.some(sql => sql.includes('UPDATE credentials') && sql.includes('is_deleted = 1'))).toBe(true);
  });

  it('should cascade soft delete credentials when deleting service', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const runMock = vi.fn(async () => ({ success: true }));
    const prepareMock = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          id: testServiceId,
          user_id: testUserId,
          is_deleted: 0,
        })),
        run: runMock,
        all: vi.fn(async () => ({ success: true, results: [] })),
      })),
    }));

    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request(`/api/vault/services/${testServiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify credentials cascade delete query was executed
    const calls = prepareMock.mock.calls as unknown[][];
    const credentialsUpdateQuery = calls.find(call => 
      (call[0] as string).includes('UPDATE credentials') && 
      (call[0] as string).includes('service_id')
    );
    expect(credentialsUpdateQuery).toBeDefined();
  });
});


describe('GET /api/vault/credentials', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testServiceId = 'service-123';

  function createSessionData(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      userId,
      createdAt: now,
      expiresAt: now + 86400,
    });
  }

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  interface MockCredential {
    id: string;
    service_id: string;
    type: string;
    label: string;
    encrypted_value: string;
    iv: string;
    auth_tag: string;
    display_order: number;
    created_at: number;
    updated_at: number;
  }

  function createMockDBForCredentials(options: {
    serviceExists?: boolean;
    serviceUserId?: string;
    serviceIsDeleted?: number;
    credentials?: MockCredential[];
    querySuccess?: boolean;
  } = {}) {
    const {
      serviceExists = true,
      serviceUserId = testUserId,
      serviceIsDeleted = 0,
      credentials = [],
      querySuccess = true,
    } = options;

    return {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!serviceExists) return null;
            return {
              id: testServiceId,
              user_id: serviceUserId,
              is_deleted: serviceIsDeleted,
            };
          }),
          all: vi.fn(async () => ({
            success: querySuccess,
            results: credentials,
            error: querySuccess ? undefined : 'Database error',
          })),
          run: vi.fn(async () => ({ success: true })),
        })),
      })),
    };
  }

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDBForCredentials();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when serviceId is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 when service does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials({ serviceExists: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when service belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    // Mock DB that returns null for the combined user_id + service_id query
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
          all: vi.fn(async () => ({ success: true, results: [] })),
          run: vi.fn(async () => ({ success: true })),
        })),
      })),
    };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when service is deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials({ serviceIsDeleted: 1 });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return empty array when service has no credentials', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials({ credentials: [] });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credentials: unknown[] };
    expect(body.credentials).toEqual([]);
  });

  it('should return credentials for authenticated user', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockCredentials: MockCredential[] = [
      {
        id: 'cred-1',
        service_id: testServiceId,
        type: 'password',
        label: 'Main Password',
        encrypted_value: 'encrypted123',
        iv: 'iv123',
        auth_tag: 'tag123',
        display_order: 0,
        created_at: now - 3600,
        updated_at: now,
      },
      {
        id: 'cred-2',
        service_id: testServiceId,
        type: 'api_key',
        label: 'API Key',
        encrypted_value: 'encrypted456',
        iv: 'iv456',
        auth_tag: 'tag456',
        display_order: 1,
        created_at: now - 1800,
        updated_at: now - 900,
      },
    ];

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials({ credentials: mockCredentials });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credentials: unknown[] };
    expect(body.credentials).toHaveLength(2);
    expect(body.credentials[0]).toEqual({
      id: 'cred-1',
      serviceId: testServiceId,
      type: 'password',
      label: 'Main Password',
      encryptedValue: 'encrypted123',
      iv: 'iv123',
      authTag: 'tag123',
      displayOrder: 0,
      createdAt: now - 3600,
      updatedAt: now,
    });
  });

  it('should transform snake_case to camelCase in response', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockCredentials: MockCredential[] = [
      {
        id: 'cred-1',
        service_id: testServiceId,
        type: 'password',
        label: 'Test',
        encrypted_value: 'enc',
        iv: 'iv',
        auth_tag: 'tag',
        display_order: 0,
        created_at: now,
        updated_at: now,
      },
    ];

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials({ credentials: mockCredentials });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credentials: Record<string, unknown>[] };

    // Verify camelCase keys
    expect(body.credentials[0]).toHaveProperty('serviceId');
    expect(body.credentials[0]).toHaveProperty('encryptedValue');
    expect(body.credentials[0]).toHaveProperty('authTag');
    expect(body.credentials[0]).toHaveProperty('displayOrder');
    expect(body.credentials[0]).toHaveProperty('createdAt');
    expect(body.credentials[0]).toHaveProperty('updatedAt');
    // Verify no snake_case keys
    expect(body.credentials[0]).not.toHaveProperty('service_id');
    expect(body.credentials[0]).not.toHaveProperty('encrypted_value');
    expect(body.credentials[0]).not.toHaveProperty('auth_tag');
  });

  it('should return 500 when database query fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCredentials({ querySuccess: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify credentials are ordered by display_order', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const prepareMock = vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          id: testServiceId,
          user_id: testUserId,
          is_deleted: 0,
        })),
        all: vi.fn(async () => ({ success: true, results: [] })),
        run: vi.fn(async () => ({ success: true })),
      })),
    }));

    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request(`/api/vault/credentials?serviceId=${testServiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify SQL query includes ORDER BY display_order
    const calls = prepareMock.mock.calls as unknown[][];
    const credentialsQuery = calls.find(call => 
      (call[0] as string).includes('SELECT') && 
      (call[0] as string).includes('credentials')
    );
    expect(credentialsQuery).toBeDefined();
    expect(credentialsQuery![0]).toContain('ORDER BY display_order');
  });
});


import type { CreateCredentialResponse } from './vault';

describe('POST /api/vault/credentials', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testServiceId = 'service-123';

  function createSessionData(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      userId,
      createdAt: now,
      expiresAt: now + 86400,
    });
  }

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  function createMockDBForCreateCredential(options: {
    serviceExists?: boolean;
    serviceUserId?: string;
    serviceIsDeleted?: number;
    runSuccess?: boolean;
  } = {}) {
    const {
      serviceExists = true,
      serviceUserId = testUserId,
      serviceIsDeleted = 0,
      runSuccess = true,
    } = options;

    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!serviceExists) return null;
            return {
              id: testServiceId,
              user_id: serviceUserId,
              is_deleted: serviceIsDeleted,
            };
          }),
          all: vi.fn(async () => ({ success: true, results: [] })),
          run: vi.fn(async () => ({ success: runSuccess })),
        })),
      })),
    };
  }

  const validCredentialPayload = {
    serviceId: testServiceId,
    type: 'api_key',
    label: 'Test API Key',
    encryptedValue: 'ZW5jcnlwdGVkVmFsdWU=',
    iv: 'aXZWYWx1ZQ==',
    authTag: 'YXV0aFRhZw==',
  };

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when serviceId is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, serviceId: undefined }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    // Zod returns generic message for missing required fields
    expect(body.error).toBeDefined();
  });

  it('should return 400 when type is invalid', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, type: 'invalid_type' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    // Zod returns enum validation message
    expect(body.error).toBeDefined();
  });

  it('should return 400 when label is empty', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, label: '   ' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('label');
  });

  it('should return 400 when label exceeds 255 characters', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, label: 'a'.repeat(256) }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('255');
  });

  it('should return 400 when encryptedValue is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, encryptedValue: undefined }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toBeDefined();
  });

  it('should return 400 when iv is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, iv: undefined }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toBeDefined();
  });

  it('should return 400 when authTag is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, authTag: undefined }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toBeDefined();
  });

  it('should return 400 when displayOrder is negative', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, displayOrder: -1 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('Display order');
  });

  it('should return 404 when service does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential({ serviceExists: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when service belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    // Mock DB that returns null for the combined user_id + service_id query
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
          all: vi.fn(async () => ({ success: true, results: [] })),
          run: vi.fn(async () => ({ success: true })),
        })),
      })),
    };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when service is deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential({ serviceIsDeleted: 1 });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should create credential successfully', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateCredentialResponse;
    expect(body.credential).toBeDefined();
    expect(body.credential.id).toBeDefined();
    expect(body.credential.serviceId).toBe(testServiceId);
    expect(body.credential.type).toBe('api_key');
    expect(body.credential.label).toBe('Test API Key');
    expect(body.credential.encryptedValue).toBe('ZW5jcnlwdGVkVmFsdWU=');
    expect(body.credential.iv).toBe('aXZWYWx1ZQ==');
    expect(body.credential.authTag).toBe('YXV0aFRhZw==');
    expect(body.credential.displayOrder).toBe(0);
    expect(body.credential.createdAt).toBeDefined();
    expect(body.credential.updatedAt).toBeDefined();
  });

  it('should create credential with custom displayOrder', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, displayOrder: 5 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateCredentialResponse;
    expect(body.credential.displayOrder).toBe(5);
  });

  it('should trim whitespace from label', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, label: '  Trimmed Label  ' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateCredentialResponse;
    expect(body.credential.label).toBe('Trimmed Label');
  });

  it('should accept all valid credential types', async () => {
    const validTypes = ['password', 'api_key', 'secret_key', 'public_key', 'access_token', 'private_key', 'custom'];

    for (const type of validTypes) {
      const mockKV = createMockKV({
        [`session:${validSessionToken}`]: createSessionData(testUserId),
      });
      const mockDB = createMockDBForCreateCredential();

      const app = new Hono();
      app.route('/api/vault', vaultRouter);

      const res = await app.request('/api/vault/credentials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${validSessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...validCredentialPayload, type }),
      }, {
        DB: mockDB,
        RATE_LIMIT: mockKV,
        PEPPER: 'test-pepper',
      });

      expect(res.status).toBe(201);
      const body = await res.json() as CreateCredentialResponse;
      expect(body.credential.type).toBe(type);
    }
  });

  it('should return 500 when database insert fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential({ runSuccess: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify correct SQL INSERT is executed', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const bindMock = vi.fn(() => ({
      first: vi.fn(async () => ({
        id: testServiceId,
        user_id: testUserId,
        is_deleted: 0,
      })),
      all: vi.fn(async () => ({ success: true, results: [] })),
      run: vi.fn(async () => ({ success: true })),
    }));

    const prepareMock = vi.fn(() => ({ bind: bindMock }));
    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validCredentialPayload),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify INSERT query
    expect(prepareMock).toHaveBeenCalled();
    const calls = prepareMock.mock.calls as unknown[][];
    const insertQuery = calls.find(call => (call[0] as string).includes('INSERT INTO credentials'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery![0]).toContain('service_id');
    expect(insertQuery![0]).toContain('user_id');
    expect(insertQuery![0]).toContain('type');
    expect(insertQuery![0]).toContain('label');
    expect(insertQuery![0]).toContain('encrypted_value');
    expect(insertQuery![0]).toContain('iv');
    expect(insertQuery![0]).toContain('auth_tag');
    expect(insertQuery![0]).toContain('display_order');
  });

  it('should generate unique credential IDs', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForCreateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res1 = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, label: 'Credential 1' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    const res2 = await app.request('/api/vault/credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...validCredentialPayload, label: 'Credential 2' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    const body1 = await res1.json() as CreateCredentialResponse;
    const body2 = await res2.json() as CreateCredentialResponse;

    expect(body1.credential.id).not.toBe(body2.credential.id);
  });
});


describe('PUT /api/vault/credentials/:id', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testCredentialId = 'credential-123';
  const testServiceId = 'service-123';

  function createSessionData(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      userId,
      createdAt: now,
      expiresAt: now + 86400,
    });
  }

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  const existingCredential = {
    id: testCredentialId,
    service_id: testServiceId,
    user_id: testUserId,
    type: 'api_key' as const,
    label: 'Original Label',
    encrypted_value: 'b3JpZ2luYWxWYWx1ZQ==',
    iv: 'b3JpZ2luYWxJdg==',
    auth_tag: 'b3JpZ2luYWxUYWc=',
    display_order: 0,
    is_deleted: 0,
    created_at: Math.floor(Date.now() / 1000) - 3600,
  };

  function createMockDBForUpdateCredential(options: {
    credentialExists?: boolean;
    credentialUserId?: string;
    isDeleted?: number;
    runSuccess?: boolean;
  } = {}) {
    const {
      credentialExists = true,
      credentialUserId = testUserId,
      isDeleted = 0,
      runSuccess = true,
    } = options;

    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!credentialExists) return null;
            return {
              ...existingCredential,
              user_id: credentialUserId,
              is_deleted: isDeleted,
            };
          }),
          run: vi.fn(async () => ({ success: runSuccess })),
          all: vi.fn(async () => ({ success: true, results: [] })),
        })),
      })),
    };
  }

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when no fields are provided', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('At least one field');
  });

  it('should return 400 when only partial encryption fields are provided', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    // Only encryptedValue without iv and authTag
    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encryptedValue: 'bmV3VmFsdWU=' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('encryptedValue, iv, and authTag must all be provided');
  });

  it('should return 404 when credential does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential({ credentialExists: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when credential belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential({ credentialUserId: 'different-user-456' });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when credential is deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential({ isDeleted: 1 });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should update label successfully', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credential: { id: string; label: string; updatedAt: number } };
    expect(body.credential).toBeDefined();
    expect(body.credential.id).toBe(testCredentialId);
    expect(body.credential.label).toBe('Updated Label');
    expect(body.credential.updatedAt).toBeDefined();
  });

  it('should update displayOrder successfully', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayOrder: 5 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credential: { displayOrder: number } };
    expect(body.credential.displayOrder).toBe(5);
  });

  it('should update encrypted value with all encryption fields', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        encryptedValue: 'bmV3RW5jcnlwdGVkVmFsdWU=',
        iv: 'bmV3SXY=',
        authTag: 'bmV3QXV0aFRhZw==',
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credential: { encryptedValue: string; iv: string; authTag: string } };
    expect(body.credential.encryptedValue).toBe('bmV3RW5jcnlwdGVkVmFsdWU=');
    expect(body.credential.iv).toBe('bmV3SXY=');
    expect(body.credential.authTag).toBe('bmV3QXV0aFRhZw==');
  });

  it('should update multiple fields at once', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'New Label',
        displayOrder: 10,
        encryptedValue: 'bmV3VmFsdWU=',
        iv: 'bmV3SXY=',
        authTag: 'bmV3VGFn',
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credential: { label: string; displayOrder: number; encryptedValue: string } };
    expect(body.credential.label).toBe('New Label');
    expect(body.credential.displayOrder).toBe(10);
    expect(body.credential.encryptedValue).toBe('bmV3VmFsdWU=');
  });

  it('should trim whitespace from label', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: '  Trimmed Label  ' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credential: { label: string } };
    expect(body.credential.label).toBe('Trimmed Label');
  });

  it('should return 400 when label exceeds 255 characters', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'a'.repeat(256) }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('255');
  });

  it('should return 400 when displayOrder is negative', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayOrder: -1 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 500 when database update fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential({ runSuccess: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify correct SQL UPDATE is executed', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const bindMock = vi.fn(() => ({
      first: vi.fn(async () => existingCredential),
      run: vi.fn(async () => ({ success: true })),
      all: vi.fn(async () => ({ success: true, results: [] })),
    }));

    const prepareMock = vi.fn(() => ({ bind: bindMock }));
    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label', displayOrder: 3 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify UPDATE query
    expect(prepareMock).toHaveBeenCalled();
    const calls = prepareMock.mock.calls as unknown[][];
    const updateQuery = calls.find(call => (call[0] as string).includes('UPDATE credentials'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery![0]).toContain('label = ?');
    expect(updateQuery![0]).toContain('display_order = ?');
    expect(updateQuery![0]).toContain('updated_at = ?');
    expect(updateQuery![0]).toContain('WHERE id = ?');
    expect(updateQuery![0]).toContain('user_id = ?');
  });

  it('should preserve unchanged fields in response', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdateCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: 'Updated Label' }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { credential: { 
      id: string; 
      serviceId: string; 
      type: string; 
      encryptedValue: string;
      iv: string;
      authTag: string;
      displayOrder: number;
      createdAt: number;
    } };
    
    // Verify unchanged fields are preserved
    expect(body.credential.id).toBe(testCredentialId);
    expect(body.credential.serviceId).toBe(testServiceId);
    expect(body.credential.type).toBe('api_key');
    expect(body.credential.encryptedValue).toBe(existingCredential.encrypted_value);
    expect(body.credential.iv).toBe(existingCredential.iv);
    expect(body.credential.authTag).toBe(existingCredential.auth_tag);
    expect(body.credential.displayOrder).toBe(existingCredential.display_order);
    expect(body.credential.createdAt).toBe(existingCredential.created_at);
  });
});


describe('DELETE /api/vault/credentials/:id', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testCredentialId = 'credential-123';

  function createSessionData(userId: string): string {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      userId,
      createdAt: now,
      expiresAt: now + 86400,
    });
  }

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  function createMockDBForDeleteCredential(options: {
    credentialExists?: boolean;
    credentialUserId?: string;
    isDeleted?: number;
    runSuccess?: boolean;
  } = {}) {
    const {
      credentialExists = true,
      credentialUserId = testUserId,
      isDeleted = 0,
      runSuccess = true,
    } = options;

    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!credentialExists) return null;
            return {
              id: testCredentialId,
              user_id: credentialUserId,
              is_deleted: isDeleted,
            };
          }),
          run: vi.fn(async () => ({ success: runSuccess })),
          all: vi.fn(async () => ({ success: true, results: [] })),
        })),
      })),
    };
  }

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDBForDeleteCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 404 when credential does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDeleteCredential({ credentialExists: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when credential belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDeleteCredential({ credentialUserId: 'different-user-456' });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 410 when credential is already deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDeleteCredential({ isDeleted: 1 });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(410);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('ALREADY_DELETED');
  });

  it('should successfully soft delete credential', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDeleteCredential();

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('should return 500 when database update fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDeleteCredential({ runSuccess: false });

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    const res = await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });

  it('should verify correct SQL queries are executed for soft delete', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const prepareMock = vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          id: testCredentialId,
          user_id: testUserId,
          is_deleted: 0,
        })),
        run: vi.fn(async () => ({ success: true })),
        all: vi.fn(async () => ({ success: true, results: [] })),
      })),
    }));

    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify SQL queries
    const calls = prepareMock.mock.calls as unknown[][];
    const sqlQueries = calls.map(call => call[0] as string);

    // Should have SELECT query to verify ownership
    expect(sqlQueries.some(sql => sql.includes('SELECT') && sql.includes('credentials'))).toBe(true);

    // Should have UPDATE query for credentials with soft delete
    expect(sqlQueries.some(sql => sql.includes('UPDATE credentials') && sql.includes('is_deleted = 1'))).toBe(true);
  });

  it('should update updated_at timestamp when soft deleting', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const bindMock = vi.fn(() => ({
      first: vi.fn(async () => ({
        id: testCredentialId,
        user_id: testUserId,
        is_deleted: 0,
      })),
      run: vi.fn(async () => ({ success: true })),
      all: vi.fn(async () => ({ success: true, results: [] })),
    }));

    const prepareMock = vi.fn(() => ({ bind: bindMock }));
    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/vault', vaultRouter);

    await app.request(`/api/vault/credentials/${testCredentialId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    // Verify UPDATE query includes updated_at
    const calls = prepareMock.mock.calls as unknown[][];
    const updateQuery = calls.find(call => (call[0] as string).includes('UPDATE credentials'));
    expect(updateQuery).toBeDefined();
    expect(updateQuery![0]).toContain('updated_at = ?');
  });
});
