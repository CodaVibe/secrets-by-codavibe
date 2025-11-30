import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { sessionMiddleware, type AuthVariables } from '../middleware/auth';

// ============================================================================
// Zod Schemas
// ============================================================================

// Currency enum
const currencySchema = z.enum(['USD', 'CAD', 'EUR']);

// Billing cycle enum
const billingCycleSchema = z.enum(['monthly', 'yearly', 'custom']);

// Create subscription schema
// Using Zod 4 patterns: .trim() is now a built-in method using .overwrite()
const createSubscriptionSchema = z.object({
  serviceName: z.string()
    .min(1, 'Service name is required')
    .trim()
    .refine((v) => v.length > 0, 'Service name cannot be empty')
    .refine((v) => v.length <= 255, 'Service name must be 255 characters or less'),
  cost: z.number()
    .positive('Cost must be greater than 0'),
  currency: currencySchema,
  billingCycle: billingCycleSchema,
  billingCycleDays: z.number().int().positive().nullable().optional(),
  nextRenewal: z.number().int().positive('Next renewal must be a valid timestamp'),
  paymentMethod: z.string().max(255).nullable().optional(),
  startDate: z.number().int().positive('Start date must be a valid timestamp'),
  tier: z.string().max(100).nullable().optional(),
  isTrial: z.boolean().optional().default(false),
  trialEndDate: z.number().int().positive().nullable().optional(),
}).refine(
  (data) => {
    // If billing cycle is custom, billingCycleDays must be provided
    if (data.billingCycle === 'custom' && !data.billingCycleDays) {
      return false;
    }
    return true;
  },
  { 
    message: 'billingCycleDays is required when billingCycle is custom',
    path: ['billingCycleDays'] // Zod 4: specify error path for better form validation
  }
).refine(
  (data) => {
    // If isTrial is true, trialEndDate should be provided
    if (data.isTrial && !data.trialEndDate) {
      return false;
    }
    return true;
  },
  { 
    message: 'trialEndDate is required when isTrial is true',
    path: ['trialEndDate'] // Zod 4: specify error path for better form validation
  }
);

// Update subscription schema - all fields optional except at least one must be provided
// Using Zod 4 patterns: .trim() is now a built-in method using .overwrite()
const updateSubscriptionSchema = z.object({
  serviceName: z.string()
    .min(1, 'Service name is required')
    .trim()
    .refine((v) => v.length > 0, 'Service name cannot be empty')
    .refine((v) => v.length <= 255, 'Service name must be 255 characters or less')
    .optional(),
  cost: z.number().positive('Cost must be greater than 0').optional(),
  currency: currencySchema.optional(),
  billingCycle: billingCycleSchema.optional(),
  billingCycleDays: z.number().int().positive().nullable().optional(),
  nextRenewal: z.number().int().positive('Next renewal must be a valid timestamp').optional(),
  paymentMethod: z.string().max(255).nullable().optional(),
  tier: z.string().max(100).nullable().optional(),
  isTrial: z.boolean().optional(),
  trialEndDate: z.number().int().positive().nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

// ============================================================================
// Types
// ============================================================================

type Currency = z.infer<typeof currencySchema>;
type BillingCycle = z.infer<typeof billingCycleSchema>;

interface Subscription {
  id: string;
  serviceName: string;
  cost: number;
  currency: Currency;
  billingCycle: BillingCycle;
  billingCycleDays: number | null;
  nextRenewal: number;
  paymentMethod: string | null;
  startDate: number;
  tier: string | null;
  isTrial: boolean;
  trialEndDate: number | null;
  createdAt: number;
  updatedAt: number;
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
}

interface CreateSubscriptionResponse {
  subscription: Subscription;
}

interface UpdateSubscriptionResponse {
  subscription: Subscription;
}

interface ErrorResponse {
  error: string;
  code: string;
}

// ============================================================================
// Utilities
// ============================================================================

function generateUUID(): string {
  return crypto.randomUUID();
}

// Custom Zod validation error handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function zodErrorHandler(result: any, c: any) {
  if (!result.success && result.error) {
    const issues = result.error.issues || [];
    const firstError = issues[0];
    const response: ErrorResponse = { error: firstError?.message || 'Validation failed', code: 'VALIDATION_ERROR' };
    return c.json(response, 400);
  }
}

// ============================================================================
// Router
// ============================================================================

const subscriptionsRouter = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

// Apply session middleware to all subscription routes
subscriptionsRouter.use('*', sessionMiddleware());

// GET /api/subscriptions - List all subscriptions for authenticated user
subscriptionsRouter.get('/', async (c) => {
  try {
    const userId = c.get('userId');

    const result = await c.env.DB.prepare(`
      SELECT id, service_name, cost, currency, billing_cycle, billing_cycle_days,
             next_renewal, payment_method, start_date, tier, is_trial, trial_end_date,
             created_at, updated_at
      FROM subscriptions
      WHERE user_id = ? AND is_deleted = 0
      ORDER BY next_renewal ASC
    `).bind(userId).all<{
      id: string;
      service_name: string;
      cost: number;
      currency: Currency;
      billing_cycle: BillingCycle;
      billing_cycle_days: number | null;
      next_renewal: number;
      payment_method: string | null;
      start_date: number;
      tier: string | null;
      is_trial: number;
      trial_end_date: number | null;
      created_at: number;
      updated_at: number;
    }>();

    if (!result.success) {
      console.error('Database query failed:', result.error);
      return c.json<ErrorResponse>({ error: 'Failed to fetch subscriptions', code: 'DATABASE_ERROR' }, 500);
    }

    const subscriptions: Subscription[] = (result.results || []).map((row) => ({
      id: row.id,
      serviceName: row.service_name,
      cost: row.cost,
      currency: row.currency,
      billingCycle: row.billing_cycle,
      billingCycleDays: row.billing_cycle_days,
      nextRenewal: row.next_renewal,
      paymentMethod: row.payment_method,
      startDate: row.start_date,
      tier: row.tier,
      isTrial: row.is_trial === 1,
      trialEndDate: row.trial_end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json<SubscriptionsResponse>({ subscriptions }, 200);
  } catch (error) {
    console.error('Get subscriptions error:', error);
    return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  }
});


// POST /api/subscriptions - Create a new subscription
subscriptionsRouter.post(
  '/',
  zValidator('json', createSubscriptionSchema, zodErrorHandler),
  async (c) => {
    try {
      const userId = c.get('userId');
      const data = c.req.valid('json');

      const subscriptionId = generateUUID();
      const now = Math.floor(Date.now() / 1000);

      const result = await c.env.DB.prepare(`
        INSERT INTO subscriptions (
          id, user_id, service_name, cost, currency, billing_cycle, billing_cycle_days,
          next_renewal, payment_method, start_date, tier, is_trial, trial_end_date,
          is_deleted, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).bind(
        subscriptionId,
        userId,
        data.serviceName,
        data.cost,
        data.currency,
        data.billingCycle,
        data.billingCycleDays ?? null,
        data.nextRenewal,
        data.paymentMethod ?? null,
        data.startDate,
        data.tier ?? null,
        data.isTrial ? 1 : 0,
        data.trialEndDate ?? null,
        now,
        now
      ).run();

      if (!result.success) {
        console.error('Database insert failed:', result.error);
        return c.json<ErrorResponse>({ error: 'Failed to create subscription', code: 'DATABASE_ERROR' }, 500);
      }

      const subscription: Subscription = {
        id: subscriptionId,
        serviceName: data.serviceName,
        cost: data.cost,
        currency: data.currency,
        billingCycle: data.billingCycle,
        billingCycleDays: data.billingCycleDays ?? null,
        nextRenewal: data.nextRenewal,
        paymentMethod: data.paymentMethod ?? null,
        startDate: data.startDate,
        tier: data.tier ?? null,
        isTrial: data.isTrial,
        trialEndDate: data.trialEndDate ?? null,
        createdAt: now,
        updatedAt: now,
      };

      return c.json<CreateSubscriptionResponse>({ subscription }, 201);
    } catch (error) {
      console.error('Create subscription error:', error);
      return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  }
);

// PUT /api/subscriptions/:id - Update a subscription
subscriptionsRouter.put(
  '/:id',
  zValidator('json', updateSubscriptionSchema, zodErrorHandler),
  async (c) => {
    try {
      const userId = c.get('userId');
      const subscriptionId = c.req.param('id');

      if (!subscriptionId || subscriptionId.length === 0) {
        return c.json<ErrorResponse>({ error: 'Subscription ID is required', code: 'VALIDATION_ERROR' }, 400);
      }

      // Verify subscription exists and belongs to user
      const existingSubscription = await c.env.DB.prepare(`
        SELECT id, user_id, service_name, cost, currency, billing_cycle, billing_cycle_days,
               next_renewal, payment_method, start_date, tier, is_trial, trial_end_date,
               is_deleted, created_at
        FROM subscriptions
        WHERE id = ?
      `).bind(subscriptionId).first<{
        id: string;
        user_id: string;
        service_name: string;
        cost: number;
        currency: Currency;
        billing_cycle: BillingCycle;
        billing_cycle_days: number | null;
        next_renewal: number;
        payment_method: string | null;
        start_date: number;
        tier: string | null;
        is_trial: number;
        trial_end_date: number | null;
        is_deleted: number;
        created_at: number;
      }>();

      if (!existingSubscription) {
        return c.json<ErrorResponse>({ error: 'Subscription not found', code: 'NOT_FOUND' }, 404);
      }

      if (existingSubscription.user_id !== userId) {
        return c.json<ErrorResponse>({ error: 'Subscription not found', code: 'NOT_FOUND' }, 404);
      }

      if (existingSubscription.is_deleted === 1) {
        return c.json<ErrorResponse>({ error: 'Subscription not found', code: 'NOT_FOUND' }, 404);
      }

      const updateData = c.req.valid('json');
      const now = Math.floor(Date.now() / 1000);

      // Build dynamic update query
      const updates: string[] = [];
      const values: (string | number | null)[] = [];

      if (updateData.serviceName !== undefined) {
        updates.push('service_name = ?');
        values.push(updateData.serviceName);
      }

      if (updateData.cost !== undefined) {
        updates.push('cost = ?');
        values.push(updateData.cost);
      }

      if (updateData.currency !== undefined) {
        updates.push('currency = ?');
        values.push(updateData.currency);
      }

      if (updateData.billingCycle !== undefined) {
        updates.push('billing_cycle = ?');
        values.push(updateData.billingCycle);
      }

      if (updateData.billingCycleDays !== undefined) {
        updates.push('billing_cycle_days = ?');
        values.push(updateData.billingCycleDays);
      }

      if (updateData.nextRenewal !== undefined) {
        updates.push('next_renewal = ?');
        values.push(updateData.nextRenewal);
      }

      if (updateData.paymentMethod !== undefined) {
        updates.push('payment_method = ?');
        values.push(updateData.paymentMethod);
      }

      if (updateData.tier !== undefined) {
        updates.push('tier = ?');
        values.push(updateData.tier);
      }

      if (updateData.isTrial !== undefined) {
        updates.push('is_trial = ?');
        values.push(updateData.isTrial ? 1 : 0);
      }

      if (updateData.trialEndDate !== undefined) {
        updates.push('trial_end_date = ?');
        values.push(updateData.trialEndDate);
      }

      // Always update updated_at
      updates.push('updated_at = ?');
      values.push(now);

      // Add WHERE clause values
      values.push(subscriptionId);
      values.push(userId);

      const sql = `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
      const result = await c.env.DB.prepare(sql).bind(...values).run();

      if (!result.success) {
        console.error('Database update failed:', result.error);
        return c.json<ErrorResponse>({ error: 'Failed to update subscription', code: 'DATABASE_ERROR' }, 500);
      }

      // Build updated subscription response
      const subscription: Subscription = {
        id: existingSubscription.id,
        serviceName: updateData.serviceName ?? existingSubscription.service_name,
        cost: updateData.cost ?? existingSubscription.cost,
        currency: updateData.currency ?? existingSubscription.currency,
        billingCycle: updateData.billingCycle ?? existingSubscription.billing_cycle,
        billingCycleDays: updateData.billingCycleDays !== undefined ? updateData.billingCycleDays : existingSubscription.billing_cycle_days,
        nextRenewal: updateData.nextRenewal ?? existingSubscription.next_renewal,
        paymentMethod: updateData.paymentMethod !== undefined ? updateData.paymentMethod : existingSubscription.payment_method,
        startDate: existingSubscription.start_date,
        tier: updateData.tier !== undefined ? updateData.tier : existingSubscription.tier,
        isTrial: updateData.isTrial !== undefined ? updateData.isTrial : existingSubscription.is_trial === 1,
        trialEndDate: updateData.trialEndDate !== undefined ? updateData.trialEndDate : existingSubscription.trial_end_date,
        createdAt: existingSubscription.created_at,
        updatedAt: now,
      };

      return c.json<UpdateSubscriptionResponse>({ subscription }, 200);
    } catch (error) {
      console.error('Update subscription error:', error);
      return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  }
);

// DELETE /api/subscriptions/:id - Soft delete a subscription
subscriptionsRouter.delete('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const subscriptionId = c.req.param('id');

    if (!subscriptionId || subscriptionId.length === 0) {
      return c.json<ErrorResponse>({ error: 'Subscription ID is required', code: 'VALIDATION_ERROR' }, 400);
    }

    // Verify subscription exists and belongs to user
    const subscription = await c.env.DB.prepare(`
      SELECT id, user_id, is_deleted
      FROM subscriptions
      WHERE id = ?
    `).bind(subscriptionId).first<{ id: string; user_id: string; is_deleted: number }>();

    if (!subscription) {
      return c.json<ErrorResponse>({ error: 'Subscription not found', code: 'NOT_FOUND' }, 404);
    }

    if (subscription.user_id !== userId) {
      return c.json<ErrorResponse>({ error: 'Subscription not found', code: 'NOT_FOUND' }, 404);
    }

    if (subscription.is_deleted === 1) {
      return c.json<ErrorResponse>({ error: 'Subscription already deleted', code: 'ALREADY_DELETED' }, 410);
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await c.env.DB.prepare(`
      UPDATE subscriptions SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(now, subscriptionId, userId).run();

    if (!result.success) {
      console.error('Failed to delete subscription:', result.error);
      return c.json<ErrorResponse>({ error: 'Failed to delete subscription', code: 'DATABASE_ERROR' }, 500);
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error('Delete subscription error:', error);
    return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  }
});

export { subscriptionsRouter };
export type {
  Subscription,
  SubscriptionsResponse,
  CreateSubscriptionResponse,
  UpdateSubscriptionResponse,
  ErrorResponse,
  Currency,
  BillingCycle,
};
