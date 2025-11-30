import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings } from '../index';
import { sessionMiddleware, type AuthVariables } from '../middleware/auth';

// ============================================================================
// Zod Schemas
// ============================================================================

// Credential type enum
const credentialTypeSchema = z.enum([
  'password',
  'api_key',
  'secret_key',
  'public_key',
  'access_token',
  'private_key',
  'custom',
]);

// Base64 string validation (standard and URL-safe)
const base64Schema = z.string().min(1).regex(/^[A-Za-z0-9+/\-_]+=*$/, 'Must be valid base64');

// Create service schema
const createServiceSchema = z.object({
  name: z.string()
    .min(1, 'Service name is required')
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Service name cannot be empty')
    .refine((v) => v.length <= 255, 'Service name must be 255 characters or less'),
  icon: z.string().max(500, 'Icon must be 500 characters or less').nullable().optional(),
});

// Create credential schema
const createCredentialSchema = z.object({
  serviceId: z.string()
    .min(1, 'Service ID is required')
    .transform((v) => v.trim()),
  type: credentialTypeSchema,
  label: z.string()
    .min(1, 'Credential label is required')
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Credential label cannot be empty')
    .refine((v) => v.length <= 255, 'Credential label must be 255 characters or less'),
  encryptedValue: base64Schema,
  iv: base64Schema,
  authTag: base64Schema,
  displayOrder: z.number().int().nonnegative('Display order must be a non-negative integer').optional().default(0),
});

// Update credential schema - all fields optional except at least one must be provided
const updateCredentialSchema = z.object({
  label: z.string()
    .min(1, 'Credential label is required')
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, 'Credential label cannot be empty')
    .refine((v) => v.length <= 255, 'Credential label must be 255 characters or less')
    .optional(),
  encryptedValue: base64Schema.optional(),
  iv: base64Schema.optional(),
  authTag: base64Schema.optional(),
  displayOrder: z.number().int().nonnegative('Display order must be a non-negative integer').optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
).refine(
  (data) => {
    // If any encryption field is provided, all must be provided
    const hasEncryptedValue = data.encryptedValue !== undefined;
    const hasIv = data.iv !== undefined;
    const hasAuthTag = data.authTag !== undefined;
    const encryptionFieldCount = [hasEncryptedValue, hasIv, hasAuthTag].filter(Boolean).length;
    return encryptionFieldCount === 0 || encryptionFieldCount === 3;
  },
  { message: 'When updating encrypted value, encryptedValue, iv, and authTag must all be provided' }
);

// ============================================================================
// Types
// ============================================================================

type CredentialType = z.infer<typeof credentialTypeSchema>;

interface Service {
  id: string;
  name: string;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Credential {
  id: string;
  serviceId: string;
  type: CredentialType;
  label: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface ServicesResponse {
  services: Service[];
}

interface CredentialsResponse {
  credentials: Credential[];
}

interface CreateServiceRequest {
  name: string;
  icon: string | null;
}

interface CreateServiceResponse {
  service: Service;
}

interface CreateCredentialRequest {
  serviceId: string;
  type: CredentialType;
  label: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  displayOrder?: number;
}

interface CreateCredentialResponse {
  credential: Credential;
}

interface UpdateCredentialRequest {
  label?: string;
  encryptedValue?: string;
  iv?: string;
  authTag?: string;
  displayOrder?: number;
}

interface UpdateCredentialResponse {
  credential: Credential;
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
    // Zod 4 uses .issues
    const issues = result.error.issues || [];
    const firstError = issues[0];
    const response: ErrorResponse = { error: firstError?.message || 'Validation failed', code: 'VALIDATION_ERROR' };
    return c.json(response, 400);
  }
}

// ============================================================================
// Router
// ============================================================================

const vaultRouter = new Hono<{ Bindings: Bindings; Variables: AuthVariables }>();

// Apply session middleware to all vault routes
vaultRouter.use('*', sessionMiddleware());

// GET /api/vault/services - List all services for authenticated user
vaultRouter.get('/services', async (c) => {
  try {
    const userId = c.get('userId');

    const result = await c.env.DB.prepare(`
      SELECT id, name, icon, created_at, updated_at
      FROM services
      WHERE user_id = ? AND is_deleted = 0
      ORDER BY updated_at DESC
    `).bind(userId).all<{
      id: string;
      name: string;
      icon: string | null;
      created_at: number;
      updated_at: number;
    }>();

    if (!result.success) {
      console.error('Database query failed:', result.error);
      return c.json<ErrorResponse>({ error: 'Failed to fetch services', code: 'DATABASE_ERROR' }, 500);
    }

    const services: Service[] = (result.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json<ServicesResponse>({ services }, 200);
  } catch (error) {
    console.error('Get services error:', error);
    return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  }
});

// POST /api/vault/services - Create a new service
vaultRouter.post(
  '/services',
  zValidator('json', createServiceSchema, zodErrorHandler),
  async (c) => {
    try {
      const userId = c.get('userId');
      const { name, icon } = c.req.valid('json');

      const serviceId = generateUUID();
      const now = Math.floor(Date.now() / 1000);

      const result = await c.env.DB.prepare(`
        INSERT INTO services (id, user_id, name, icon, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).bind(serviceId, userId, name, icon ?? null, now, now).run();

      if (!result.success) {
        console.error('Database insert failed:', result.error);
        return c.json<ErrorResponse>({ error: 'Failed to create service', code: 'DATABASE_ERROR' }, 500);
      }

      const service: Service = {
        id: serviceId,
        name,
        icon: icon ?? null,
        createdAt: now,
        updatedAt: now,
      };

      return c.json<CreateServiceResponse>({ service }, 201);
    } catch (error) {
      console.error('Create service error:', error);
      return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  }
);

// DELETE /api/vault/services/:id - Soft delete a service and cascade to credentials
vaultRouter.delete('/services/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const serviceId = c.req.param('id');

    if (!serviceId || serviceId.length === 0) {
      return c.json<ErrorResponse>({ error: 'Service ID is required', code: 'VALIDATION_ERROR' }, 400);
    }

    const service = await c.env.DB.prepare(`
      SELECT id, user_id, is_deleted
      FROM services
      WHERE id = ?
    `).bind(serviceId).first<{ id: string; user_id: string; is_deleted: number }>();

    if (!service) {
      return c.json<ErrorResponse>({ error: 'Service not found', code: 'NOT_FOUND' }, 404);
    }

    if (service.user_id !== userId) {
      return c.json<ErrorResponse>({ error: 'Service not found', code: 'NOT_FOUND' }, 404);
    }

    if (service.is_deleted === 1) {
      return c.json<ErrorResponse>({ error: 'Service already deleted', code: 'ALREADY_DELETED' }, 410);
    }

    const now = Math.floor(Date.now() / 1000);

    const serviceResult = await c.env.DB.prepare(`
      UPDATE services SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(now, serviceId, userId).run();

    if (!serviceResult.success) {
      console.error('Failed to delete service:', serviceResult.error);
      return c.json<ErrorResponse>({ error: 'Failed to delete service', code: 'DATABASE_ERROR' }, 500);
    }

    const credentialsResult = await c.env.DB.prepare(`
      UPDATE credentials SET is_deleted = 1, updated_at = ? WHERE service_id = ? AND user_id = ? AND is_deleted = 0
    `).bind(now, serviceId, userId).run();

    if (!credentialsResult.success) {
      console.error('Failed to cascade delete credentials:', credentialsResult.error);
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error('Delete service error:', error);
    return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  }
});

// GET /api/vault/credentials - Get credentials for a service
vaultRouter.get('/credentials', async (c) => {
  try {
    const userId = c.get('userId');
    const serviceId = c.req.query('serviceId');

    if (!serviceId || serviceId.trim().length === 0) {
      return c.json<ErrorResponse>({ error: 'Service ID is required', code: 'VALIDATION_ERROR' }, 400);
    }

    const service = await c.env.DB.prepare(`
      SELECT id, user_id, is_deleted FROM services WHERE id = ? AND user_id = ?
    `).bind(serviceId, userId).first<{ id: string; user_id: string; is_deleted: number }>();

    if (!service) {
      return c.json<ErrorResponse>({ error: 'Service not found', code: 'NOT_FOUND' }, 404);
    }

    if (service.is_deleted === 1) {
      return c.json<ErrorResponse>({ error: 'Service not found', code: 'NOT_FOUND' }, 404);
    }

    const result = await c.env.DB.prepare(`
      SELECT id, service_id, type, label, encrypted_value, iv, auth_tag, display_order, created_at, updated_at
      FROM credentials
      WHERE service_id = ? AND user_id = ? AND is_deleted = 0
      ORDER BY display_order ASC
    `).bind(serviceId, userId).all<{
      id: string;
      service_id: string;
      type: CredentialType;
      label: string;
      encrypted_value: string;
      iv: string;
      auth_tag: string;
      display_order: number;
      created_at: number;
      updated_at: number;
    }>();

    if (!result.success) {
      console.error('Database query failed:', result.error);
      return c.json<ErrorResponse>({ error: 'Failed to fetch credentials', code: 'DATABASE_ERROR' }, 500);
    }

    const credentials: Credential[] = (result.results || []).map((row) => ({
      id: row.id,
      serviceId: row.service_id,
      type: row.type,
      label: row.label,
      encryptedValue: row.encrypted_value,
      iv: row.iv,
      authTag: row.auth_tag,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json<CredentialsResponse>({ credentials }, 200);
  } catch (error) {
    console.error('Get credentials error:', error);
    return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  }
});

// POST /api/vault/credentials - Create a new credential
vaultRouter.post(
  '/credentials',
  zValidator('json', createCredentialSchema, zodErrorHandler),
  async (c) => {
    try {
      const userId = c.get('userId');
      const { serviceId, type, label, encryptedValue, iv, authTag, displayOrder } = c.req.valid('json');

      const service = await c.env.DB.prepare(`
        SELECT id, user_id, is_deleted FROM services WHERE id = ? AND user_id = ?
      `).bind(serviceId, userId).first<{ id: string; user_id: string; is_deleted: number }>();

      if (!service) {
        return c.json<ErrorResponse>({ error: 'Service not found', code: 'NOT_FOUND' }, 404);
      }

      if (service.is_deleted === 1) {
        return c.json<ErrorResponse>({ error: 'Service not found', code: 'NOT_FOUND' }, 404);
      }

      const credentialId = generateUUID();
      const now = Math.floor(Date.now() / 1000);

      const result = await c.env.DB.prepare(`
        INSERT INTO credentials (id, service_id, user_id, type, label, encrypted_value, iv, auth_tag, display_order, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).bind(credentialId, serviceId, userId, type, label, encryptedValue, iv, authTag, displayOrder, now, now).run();

      if (!result.success) {
        console.error('Database insert failed:', result.error);
        return c.json<ErrorResponse>({ error: 'Failed to create credential', code: 'DATABASE_ERROR' }, 500);
      }

      const credential: Credential = {
        id: credentialId,
        serviceId,
        type,
        label,
        encryptedValue,
        iv,
        authTag,
        displayOrder,
        createdAt: now,
        updatedAt: now,
      };

      return c.json<CreateCredentialResponse>({ credential }, 201);
    } catch (error) {
      console.error('Create credential error:', error);
      return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  }
);

// PUT /api/vault/credentials/:id - Update a credential
vaultRouter.put(
  '/credentials/:id',
  zValidator('json', updateCredentialSchema, zodErrorHandler),
  async (c) => {
    try {
      const userId = c.get('userId');
      const credentialId = c.req.param('id');

      if (!credentialId || credentialId.length === 0) {
        return c.json<ErrorResponse>({ error: 'Credential ID is required', code: 'VALIDATION_ERROR' }, 400);
      }

      // Verify credential exists and belongs to user
      const existingCredential = await c.env.DB.prepare(`
        SELECT id, service_id, user_id, type, label, encrypted_value, iv, auth_tag, display_order, is_deleted, created_at
        FROM credentials
        WHERE id = ?
      `).bind(credentialId).first<{
        id: string;
        service_id: string;
        user_id: string;
        type: CredentialType;
        label: string;
        encrypted_value: string;
        iv: string;
        auth_tag: string;
        display_order: number;
        is_deleted: number;
        created_at: number;
      }>();

      if (!existingCredential) {
        return c.json<ErrorResponse>({ error: 'Credential not found', code: 'NOT_FOUND' }, 404);
      }

      if (existingCredential.user_id !== userId) {
        return c.json<ErrorResponse>({ error: 'Credential not found', code: 'NOT_FOUND' }, 404);
      }

      if (existingCredential.is_deleted === 1) {
        return c.json<ErrorResponse>({ error: 'Credential not found', code: 'NOT_FOUND' }, 404);
      }

      const updateData = c.req.valid('json');
      const now = Math.floor(Date.now() / 1000);

      // Build dynamic update query
      const updates: string[] = [];
      const values: (string | number)[] = [];

      if (updateData.label !== undefined) {
        updates.push('label = ?');
        values.push(updateData.label);
      }

      if (updateData.encryptedValue !== undefined) {
        updates.push('encrypted_value = ?');
        values.push(updateData.encryptedValue);
      }

      if (updateData.iv !== undefined) {
        updates.push('iv = ?');
        values.push(updateData.iv);
      }

      if (updateData.authTag !== undefined) {
        updates.push('auth_tag = ?');
        values.push(updateData.authTag);
      }

      if (updateData.displayOrder !== undefined) {
        updates.push('display_order = ?');
        values.push(updateData.displayOrder);
      }

      // Always update updated_at
      updates.push('updated_at = ?');
      values.push(now);

      // Add WHERE clause values
      values.push(credentialId);
      values.push(userId);

      const sql = `UPDATE credentials SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
      const result = await c.env.DB.prepare(sql).bind(...values).run();

      if (!result.success) {
        console.error('Database update failed:', result.error);
        return c.json<ErrorResponse>({ error: 'Failed to update credential', code: 'DATABASE_ERROR' }, 500);
      }

      // Build updated credential response
      const credential: Credential = {
        id: existingCredential.id,
        serviceId: existingCredential.service_id,
        type: existingCredential.type,
        label: updateData.label ?? existingCredential.label,
        encryptedValue: updateData.encryptedValue ?? existingCredential.encrypted_value,
        iv: updateData.iv ?? existingCredential.iv,
        authTag: updateData.authTag ?? existingCredential.auth_tag,
        displayOrder: updateData.displayOrder ?? existingCredential.display_order,
        createdAt: existingCredential.created_at,
        updatedAt: now,
      };

      return c.json<UpdateCredentialResponse>({ credential }, 200);
    } catch (error) {
      console.error('Update credential error:', error);
      return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  }
);

// DELETE /api/vault/credentials/:id - Soft delete a credential
vaultRouter.delete('/credentials/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const credentialId = c.req.param('id');

    if (!credentialId || credentialId.length === 0) {
      return c.json<ErrorResponse>({ error: 'Credential ID is required', code: 'VALIDATION_ERROR' }, 400);
    }

    // Verify credential exists and belongs to user
    const credential = await c.env.DB.prepare(`
      SELECT id, user_id, is_deleted
      FROM credentials
      WHERE id = ?
    `).bind(credentialId).first<{ id: string; user_id: string; is_deleted: number }>();

    if (!credential) {
      return c.json<ErrorResponse>({ error: 'Credential not found', code: 'NOT_FOUND' }, 404);
    }

    if (credential.user_id !== userId) {
      return c.json<ErrorResponse>({ error: 'Credential not found', code: 'NOT_FOUND' }, 404);
    }

    if (credential.is_deleted === 1) {
      return c.json<ErrorResponse>({ error: 'Credential already deleted', code: 'ALREADY_DELETED' }, 410);
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await c.env.DB.prepare(`
      UPDATE credentials SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?
    `).bind(now, credentialId, userId).run();

    if (!result.success) {
      console.error('Failed to delete credential:', result.error);
      return c.json<ErrorResponse>({ error: 'Failed to delete credential', code: 'DATABASE_ERROR' }, 500);
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error('Delete credential error:', error);
    return c.json<ErrorResponse>({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
  }
});

export { vaultRouter };
export type {
  Service,
  ServicesResponse,
  CreateServiceRequest,
  CreateServiceResponse,
  ErrorResponse,
  Credential,
  CredentialsResponse,
  CredentialType,
  CreateCredentialRequest,
  CreateCredentialResponse,
  UpdateCredentialRequest,
  UpdateCredentialResponse,
};
