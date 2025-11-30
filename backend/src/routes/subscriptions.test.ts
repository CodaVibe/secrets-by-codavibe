import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { subscriptionsRouter, type SubscriptionsResponse, type CreateSubscriptionResponse, type UpdateSubscriptionResponse, type ErrorResponse } from './subscriptions';

// Mock types
interface MockSubscription {
  id: string;
  service_name: string;
  cost: number;
  currency: string;
  billing_cycle: string;
  billing_cycle_days: number | null;
  next_renewal: number;
  payment_method: string | null;
  start_date: number;
  tier: string | null;
  is_trial: number;
  trial_end_date: number | null;
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
function createMockDB(subscriptions: MockSubscription[] = []) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({
          success: true,
          results: subscriptions,
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

describe('GET /api/subscriptions', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';

  it('should return 401 when no authorization header is provided', async () => {
    const mockKV = createMockKV();
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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
    const mockKV = createMockKV();
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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

  it('should return empty array when user has no subscriptions', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB([]);

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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
    const body = await res.json() as SubscriptionsResponse;
    expect(body.subscriptions).toEqual([]);
  });

  it('should return subscriptions for authenticated user ordered by next_renewal ASC', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockSubscriptions: MockSubscription[] = [
      {
        id: 'sub-1',
        service_name: 'Netflix',
        cost: 15.99,
        currency: 'USD',
        billing_cycle: 'monthly',
        billing_cycle_days: null,
        next_renewal: now + 86400, // Tomorrow
        payment_method: 'Credit Card',
        start_date: now - 86400 * 30,
        tier: 'Premium',
        is_trial: 0,
        trial_end_date: null,
        created_at: now - 3600,
        updated_at: now,
      },
      {
        id: 'sub-2',
        service_name: 'Spotify',
        cost: 9.99,
        currency: 'USD',
        billing_cycle: 'monthly',
        billing_cycle_days: null,
        next_renewal: now + 86400 * 7, // Next week
        payment_method: null,
        start_date: now - 86400 * 60,
        tier: null,
        is_trial: 1,
        trial_end_date: now + 86400 * 14,
        created_at: now - 7200,
        updated_at: now - 1800,
      },
    ];

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB(mockSubscriptions);

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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
    const body = await res.json() as SubscriptionsResponse;
    expect(body.subscriptions).toHaveLength(2);
    expect(body.subscriptions[0]).toEqual({
      id: 'sub-1',
      serviceName: 'Netflix',
      cost: 15.99,
      currency: 'USD',
      billingCycle: 'monthly',
      billingCycleDays: null,
      nextRenewal: now + 86400,
      paymentMethod: 'Credit Card',
      startDate: now - 86400 * 30,
      tier: 'Premium',
      isTrial: false,
      trialEndDate: null,
      createdAt: now - 3600,
      updatedAt: now,
    });
    expect(body.subscriptions[1].isTrial).toBe(true);
  });

  it('should transform snake_case to camelCase in response', async () => {
    const now = Math.floor(Date.now() / 1000);
    const mockSubscriptions: MockSubscription[] = [
      {
        id: 'sub-1',
        service_name: 'Test Service',
        cost: 10.00,
        currency: 'CAD',
        billing_cycle: 'yearly',
        billing_cycle_days: null,
        next_renewal: now + 86400,
        payment_method: 'PayPal',
        start_date: now - 86400,
        tier: 'Basic',
        is_trial: 0,
        trial_end_date: null,
        created_at: now - 100,
        updated_at: now,
      },
    ];

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB(mockSubscriptions);

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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
    const body = await res.json() as SubscriptionsResponse;
    
    // Verify camelCase keys
    expect(body.subscriptions[0]).toHaveProperty('serviceName');
    expect(body.subscriptions[0]).toHaveProperty('billingCycle');
    expect(body.subscriptions[0]).toHaveProperty('nextRenewal');
    expect(body.subscriptions[0]).toHaveProperty('startDate');
    expect(body.subscriptions[0]).toHaveProperty('isTrial');
    expect(body.subscriptions[0]).toHaveProperty('createdAt');
    expect(body.subscriptions[0]).toHaveProperty('updatedAt');
    // Verify snake_case keys are NOT present
    expect(body.subscriptions[0]).not.toHaveProperty('service_name');
    expect(body.subscriptions[0]).not.toHaveProperty('billing_cycle');
    expect(body.subscriptions[0]).not.toHaveProperty('next_renewal');
  });

  it('should return 500 when database query fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    
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
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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

  it('should verify correct SQL query is executed with ORDER BY next_renewal ASC', async () => {
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
    app.route('/api/subscriptions', subscriptionsRouter);

    await app.request('/api/subscriptions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(prepareMock).toHaveBeenCalled();
    const calls = prepareMock.mock.calls as unknown[][];
    const sqlQuery = calls[0]?.[0] as string | undefined;
    expect(sqlQuery).toContain('user_id = ?');
    expect(sqlQuery).toContain('is_deleted = 0');
    expect(sqlQuery).toContain('ORDER BY next_renewal ASC');
  });

  it('should handle expired session', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredSessionData = JSON.stringify({
      userId: testUserId,
      createdAt: now - 86400 * 2,
      expiresAt: now - 86400,
    });

    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: expiredSessionData,
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
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


describe('POST /api/subscriptions', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

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
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceName: 'Netflix', cost: 15.99, currency: 'USD', billingCycle: 'monthly', nextRenewal: Date.now(), startDate: Date.now() }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 when serviceName is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cost: 15.99, currency: 'USD', billingCycle: 'monthly', nextRenewal: Date.now(), startDate: Date.now() }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when cost is not positive', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serviceName: 'Netflix', cost: 0, currency: 'USD', billingCycle: 'monthly', nextRenewal: Date.now(), startDate: Date.now() }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('greater than 0');
  });

  it('should return 400 when currency is invalid', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serviceName: 'Netflix', cost: 15.99, currency: 'GBP', billingCycle: 'monthly', nextRenewal: Date.now(), startDate: Date.now() }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when billingCycle is invalid', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serviceName: 'Netflix', cost: 15.99, currency: 'USD', billingCycle: 'weekly', nextRenewal: Date.now(), startDate: Date.now() }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 when billingCycle is custom but billingCycleDays is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serviceName: 'Custom Service', cost: 25.00, currency: 'USD', billingCycle: 'custom', nextRenewal: now + 86400, startDate: now }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('billingCycleDays');
  });

  it('should return 400 when isTrial is true but trialEndDate is missing', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serviceName: 'Trial Service', cost: 9.99, currency: 'USD', billingCycle: 'monthly', nextRenewal: now + 86400, startDate: now, isTrial: true }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(400);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('trialEndDate');
  });

  it('should create subscription successfully with all required fields', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceName: 'Netflix',
        cost: 15.99,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewal: now + 86400 * 30,
        startDate: now,
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateSubscriptionResponse;
    expect(body.subscription).toBeDefined();
    expect(body.subscription.serviceName).toBe('Netflix');
    expect(body.subscription.cost).toBe(15.99);
    expect(body.subscription.currency).toBe('USD');
    expect(body.subscription.billingCycle).toBe('monthly');
    expect(body.subscription.id).toBeDefined();
    expect(body.subscription.isTrial).toBe(false);
  });

  it('should create subscription with trial information', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const trialEnd = now + 86400 * 14;
    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceName: 'Spotify',
        cost: 9.99,
        currency: 'CAD',
        billingCycle: 'monthly',
        nextRenewal: now + 86400 * 30,
        startDate: now,
        isTrial: true,
        trialEndDate: trialEnd,
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateSubscriptionResponse;
    expect(body.subscription.isTrial).toBe(true);
    expect(body.subscription.trialEndDate).toBe(trialEnd);
  });

  it('should create subscription with custom billing cycle', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceName: 'Custom Service',
        cost: 50.00,
        currency: 'EUR',
        billingCycle: 'custom',
        billingCycleDays: 90,
        nextRenewal: now + 86400 * 90,
        startDate: now,
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(201);
    const body = await res.json() as CreateSubscriptionResponse;
    expect(body.subscription.billingCycle).toBe('custom');
    expect(body.subscription.billingCycleDays).toBe(90);
  });

  it('should return 500 when database insert fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDB(false);

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const res = await app.request('/api/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceName: 'Netflix',
        cost: 15.99,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewal: now + 86400 * 30,
        startDate: now,
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });
});


describe('PUT /api/subscriptions/:id', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testSubscriptionId = 'sub-123';

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  function createMockDBForUpdate(options: {
    subscriptionExists?: boolean;
    subscriptionUserId?: string;
    isDeleted?: number;
    runSuccess?: boolean;
  } = {}) {
    const {
      subscriptionExists = true,
      subscriptionUserId = testUserId,
      isDeleted = 0,
      runSuccess = true,
    } = options;

    const now = Math.floor(Date.now() / 1000);
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!subscriptionExists) return null;
            return {
              id: testSubscriptionId,
              user_id: subscriptionUserId,
              service_name: 'Netflix',
              cost: 15.99,
              currency: 'USD',
              billing_cycle: 'monthly',
              billing_cycle_days: null,
              next_renewal: now + 86400 * 30,
              payment_method: 'Credit Card',
              start_date: now - 86400 * 30,
              tier: 'Premium',
              is_trial: 0,
              trial_end_date: null,
              is_deleted: isDeleted,
              created_at: now - 86400 * 30,
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
    const mockDB = createMockDBForUpdate();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost: 19.99 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(401);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('should return 404 when subscription does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate({ subscriptionExists: false });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cost: 19.99 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when subscription belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate({ subscriptionUserId: 'different-user-456' });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cost: 19.99 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 404 when subscription is deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate({ isDeleted: 1 });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cost: 19.99 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(404);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('should return 400 when no fields are provided for update', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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
  });

  it('should successfully update subscription cost', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cost: 19.99 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as UpdateSubscriptionResponse;
    expect(body.subscription).toBeDefined();
    expect(body.subscription.cost).toBe(19.99);
    expect(body.subscription.serviceName).toBe('Netflix');
  });

  it('should successfully update multiple fields', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const now = Math.floor(Date.now() / 1000);
    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceName: 'Netflix Premium',
        cost: 22.99,
        tier: 'Ultra HD',
        nextRenewal: now + 86400 * 60,
      }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(200);
    const body = await res.json() as UpdateSubscriptionResponse;
    expect(body.subscription.serviceName).toBe('Netflix Premium');
    expect(body.subscription.cost).toBe(22.99);
    expect(body.subscription.tier).toBe('Ultra HD');
  });

  it('should return 500 when database update fails', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForUpdate({ runSuccess: false });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cost: 19.99 }),
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    expect(res.status).toBe(500);
    const body = await res.json() as ErrorResponse;
    expect(body.code).toBe('DATABASE_ERROR');
  });
});

describe('DELETE /api/subscriptions/:id', () => {
  const testUserId = 'test-user-123';
  const validSessionToken = 'valid-session-token';
  const testSubscriptionId = 'sub-123';

  function createMockKV(sessionData: Record<string, string> = {}) {
    return {
      get: vi.fn(async (key: string) => sessionData[key] || null),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
  }

  function createMockDBForDelete(options: {
    subscriptionExists?: boolean;
    subscriptionUserId?: string;
    isDeleted?: number;
    runSuccess?: boolean;
  } = {}) {
    const {
      subscriptionExists = true,
      subscriptionUserId = testUserId,
      isDeleted = 0,
      runSuccess = true,
    } = options;

    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!subscriptionExists) return null;
            return {
              id: testSubscriptionId,
              user_id: subscriptionUserId,
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
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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

  it('should return 404 when subscription does not exist', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ subscriptionExists: false });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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

  it('should return 404 when subscription belongs to different user', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ subscriptionUserId: 'different-user-456' });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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

  it('should return 410 when subscription is already deleted', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete({ isDeleted: 1 });

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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

  it('should successfully soft delete subscription', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });
    const mockDB = createMockDBForDelete();

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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
    app.route('/api/subscriptions', subscriptionsRouter);

    const res = await app.request(`/api/subscriptions/${testSubscriptionId}`, {
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

  it('should verify correct SQL query is executed for soft delete', async () => {
    const mockKV = createMockKV({
      [`session:${validSessionToken}`]: createSessionData(testUserId),
    });

    const prepareMock = vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => ({
          id: testSubscriptionId,
          user_id: testUserId,
          is_deleted: 0,
        })),
        run: vi.fn(async () => ({ success: true })),
        all: vi.fn(async () => ({ success: true, results: [] })),
      })),
    }));

    const mockDB = { prepare: prepareMock };

    const app = new Hono();
    app.route('/api/subscriptions', subscriptionsRouter);

    await app.request(`/api/subscriptions/${testSubscriptionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${validSessionToken}`,
      },
    }, {
      DB: mockDB,
      RATE_LIMIT: mockKV,
      PEPPER: 'test-pepper',
    });

    const calls = prepareMock.mock.calls as unknown[][];
    const sqlQueries = calls.map(call => call[0] as string);

    // Should have SELECT query to verify ownership
    expect(sqlQueries.some(sql => sql.includes('SELECT') && sql.includes('subscriptions'))).toBe(true);

    // Should have UPDATE query for soft delete
    expect(sqlQueries.some(sql => sql.includes('UPDATE subscriptions') && sql.includes('is_deleted = 1'))).toBe(true);
  });
});
