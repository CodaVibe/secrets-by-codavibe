import { Hono } from 'hono';
import type { Bindings } from '../index';
import { createSession, deleteSession, extractBearerToken } from '../middleware/auth';

// Types for auth requests/responses
interface RegisterRequest {
  email: string;
  authHash: string;
  authSalt: string;
  kekSalt: string;
  wrappedKey: string;
  argon2Params: {
    memory: number;
    iterations: number;
    parallelism: number;
  };
}

interface RegisterResponse {
  userId: string;
  sessionToken: string;
}

interface ErrorResponse {
  error: string;
  code: string;
}

// Utility: Generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID();
}

// Utility: Generate session token (32 bytes, base64 encoded)
async function generateSessionToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Utility: Create AuthVerifier by hashing AuthHash with Pepper using HMAC-SHA256
async function createAuthVerifier(authHash: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(pepper);
  const messageData = encoder.encode(authHash);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hashArray = new Uint8Array(signature);
  return btoa(String.fromCharCode(...hashArray));
}


// Validation helpers
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
}

function validateRegisterRequest(body: unknown): { valid: true; data: RegisterRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  // Validate email
  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  if (!isValidEmail(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Validate authHash (base64 encoded)
  if (!data.authHash || typeof data.authHash !== 'string') {
    return { valid: false, error: 'AuthHash is required' };
  }
  if (!isValidBase64(data.authHash)) {
    return { valid: false, error: 'AuthHash must be valid base64' };
  }

  // Validate authSalt (base64 encoded)
  if (!data.authSalt || typeof data.authSalt !== 'string') {
    return { valid: false, error: 'AuthSalt is required' };
  }
  if (!isValidBase64(data.authSalt)) {
    return { valid: false, error: 'AuthSalt must be valid base64' };
  }

  // Validate kekSalt (base64 encoded)
  if (!data.kekSalt || typeof data.kekSalt !== 'string') {
    return { valid: false, error: 'KEKSalt is required' };
  }
  if (!isValidBase64(data.kekSalt)) {
    return { valid: false, error: 'KEKSalt must be valid base64' };
  }

  // Validate wrappedKey (base64 encoded)
  if (!data.wrappedKey || typeof data.wrappedKey !== 'string') {
    return { valid: false, error: 'WrappedKey is required' };
  }
  if (!isValidBase64(data.wrappedKey)) {
    return { valid: false, error: 'WrappedKey must be valid base64' };
  }

  // Validate argon2Params
  if (!data.argon2Params || typeof data.argon2Params !== 'object') {
    return { valid: false, error: 'Argon2 parameters are required' };
  }

  const params = data.argon2Params as Record<string, unknown>;
  if (typeof params.memory !== 'number' || params.memory < 1024 || params.memory > 1048576) {
    return { valid: false, error: 'Invalid Argon2 memory parameter (must be 1024-1048576 KiB)' };
  }
  if (typeof params.iterations !== 'number' || params.iterations < 1 || params.iterations > 10) {
    return { valid: false, error: 'Invalid Argon2 iterations parameter (must be 1-10)' };
  }
  if (typeof params.parallelism !== 'number' || params.parallelism < 1 || params.parallelism > 16) {
    return { valid: false, error: 'Invalid Argon2 parallelism parameter (must be 1-16)' };
  }

  return {
    valid: true,
    data: {
      email: data.email as string,
      authHash: data.authHash as string,
      authSalt: data.authSalt as string,
      kekSalt: data.kekSalt as string,
      wrappedKey: data.wrappedKey as string,
      argon2Params: {
        memory: params.memory as number,
        iterations: params.iterations as number,
        parallelism: params.parallelism as number,
      },
    },
  };
}


// Create auth router
const authRouter = new Hono<{ Bindings: Bindings }>();

// GET /api/auth/salts/:email - Get user's salts for login
authRouter.get('/salts/:email', async (c) => {
  try {
    const email = c.req.param('email');

    if (!email || !isValidEmail(email)) {
      return c.json<ErrorResponse>(
        { error: 'Invalid email format', code: 'VALIDATION_ERROR' },
        400
      );
    }

    // Fetch user's salts by email
    const user = await c.env.DB.prepare(`
      SELECT auth_salt, kek_salt
      FROM users WHERE email = ?
    `).bind(email.toLowerCase()).first<{
      auth_salt: string;
      kek_salt: string;
    }>();

    if (!user) {
      return c.json<ErrorResponse>(
        { error: 'Account not found', code: 'USER_NOT_FOUND' },
        404
      );
    }

    return c.json({
      authSalt: user.auth_salt,
      kekSalt: user.kek_salt,
    }, 200);

  } catch (error) {
    console.error('Fetch salts error:', error);
    return c.json<ErrorResponse>(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    );
  }
});

// POST /api/auth/register
authRouter.post('/register', async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validation = validateRegisterRequest(body);

    if (!validation.valid) {
      return c.json<ErrorResponse>(
        { error: validation.error, code: 'VALIDATION_ERROR' },
        400
      );
    }

    const { email, authHash, authSalt, kekSalt, wrappedKey, argon2Params } = validation.data;

    // Check if email already exists
    const existingUser = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existingUser) {
      return c.json<ErrorResponse>(
        { error: 'Email already registered', code: 'EMAIL_EXISTS' },
        409
      );
    }

    // Generate user ID
    const userId = generateUUID();

    // Create AuthVerifier by hashing AuthHash with Pepper
    const authVerifier = await createAuthVerifier(authHash, c.env.PEPPER);

    // Generate session token
    const sessionToken = await generateSessionToken();

    // Store argon2Params as JSON string
    const argon2ParamsJson = JSON.stringify({
      m: argon2Params.memory,
      t: argon2Params.iterations,
      p: argon2Params.parallelism,
    });

    // Insert user into database
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`
      INSERT INTO users (
        id, email, auth_verifier, auth_salt, kek_salt, wrapped_key, 
        argon2_params, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      email.toLowerCase(),
      authVerifier,
      authSalt,
      kekSalt,
      wrappedKey,
      argon2ParamsJson,
      now,
      now
    ).run();

    // Store session in KV
    if (c.env.RATE_LIMIT) {
      await createSession(c.env.RATE_LIMIT, sessionToken, userId);
    }

    return c.json<RegisterResponse>({
      userId,
      sessionToken,
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    
    // Check for unique constraint violation (race condition)
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json<ErrorResponse>(
        { error: 'Email already registered', code: 'EMAIL_EXISTS' },
        409
      );
    }

    return c.json<ErrorResponse>(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    );
  }
});

// Types for login requests/responses
interface LoginRequest {
  email: string;
  authHash: string;
}

interface LoginResponse {
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

// Constant-time comparison to prevent timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Lockout constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes

function validateLoginRequest(body: unknown): { valid: true; data: LoginRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  // Validate email
  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  if (!isValidEmail(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Validate authHash (base64 encoded)
  if (!data.authHash || typeof data.authHash !== 'string') {
    return { valid: false, error: 'AuthHash is required' };
  }
  if (!isValidBase64(data.authHash)) {
    return { valid: false, error: 'AuthHash must be valid base64' };
  }

  return {
    valid: true,
    data: {
      email: data.email as string,
      authHash: data.authHash as string,
    },
  };
}

// POST /api/auth/login
authRouter.post('/login', async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validation = validateLoginRequest(body);

    if (!validation.valid) {
      return c.json<ErrorResponse>(
        { error: validation.error, code: 'VALIDATION_ERROR' },
        400
      );
    }

    const { email, authHash } = validation.data;
    const normalizedEmail = email.toLowerCase();

    // Fetch user by email
    const user = await c.env.DB.prepare(`
      SELECT id, email, auth_verifier, auth_salt, kek_salt, wrapped_key, 
             argon2_params, failed_login_attempts, locked_until
      FROM users WHERE email = ?
    `).bind(normalizedEmail).first<{
      id: string;
      email: string;
      auth_verifier: string;
      auth_salt: string;
      kek_salt: string;
      wrapped_key: string;
      argon2_params: string;
      failed_login_attempts: number;
      locked_until: number | null;
    }>();

    if (!user) {
      // Return generic error to prevent email enumeration
      return c.json<ErrorResponse>(
        { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
        401
      );
    }

    const now = Math.floor(Date.now() / 1000);

    // Check account lockout
    if (user.locked_until && user.locked_until > now) {
      const remainingSeconds = user.locked_until - now;
      return c.json<ErrorResponse>(
        { error: `Account locked. Try again in ${Math.ceil(remainingSeconds / 60)} minutes`, code: 'ACCOUNT_LOCKED' },
        423
      );
    }

    // Create AuthVerifier from provided AuthHash
    const providedVerifier = await createAuthVerifier(authHash, c.env.PEPPER);

    // Constant-time comparison to prevent timing attacks
    const isValid = constantTimeCompare(providedVerifier, user.auth_verifier);

    if (!isValid) {
      // Increment failed login attempts
      const newFailedAttempts = user.failed_login_attempts + 1;
      
      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        // Lock account
        const lockUntil = now + LOCKOUT_DURATION_SECONDS;
        await c.env.DB.prepare(`
          UPDATE users 
          SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
          WHERE id = ?
        `).bind(newFailedAttempts, lockUntil, now, user.id).run();

        return c.json<ErrorResponse>(
          { error: 'Account locked due to too many failed attempts. Try again in 15 minutes', code: 'ACCOUNT_LOCKED' },
          423
        );
      } else {
        // Just increment counter
        await c.env.DB.prepare(`
          UPDATE users 
          SET failed_login_attempts = ?, updated_at = ?
          WHERE id = ?
        `).bind(newFailedAttempts, now, user.id).run();

        return c.json<ErrorResponse>(
          { error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
          401
        );
      }
    }

    // Successful login - reset failed attempts and clear lockout
    await c.env.DB.prepare(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?
    `).bind(now, user.id).run();

    // Generate session token
    const sessionToken = await generateSessionToken();

    // Parse argon2Params
    const argon2ParamsRaw = JSON.parse(user.argon2_params) as { m: number; t: number; p: number };

    // Store session in KV
    if (c.env.RATE_LIMIT) {
      await createSession(c.env.RATE_LIMIT, sessionToken, user.id);
    }

    return c.json<LoginResponse>({
      userId: user.id,
      sessionToken,
      wrappedKey: user.wrapped_key,
      kekSalt: user.kek_salt,
      authSalt: user.auth_salt,
      argon2Params: {
        memory: argon2ParamsRaw.m,
        iterations: argon2ParamsRaw.t,
        parallelism: argon2ParamsRaw.p,
      },
    }, 200);

  } catch (error) {
    console.error('Login error:', error);
    return c.json<ErrorResponse>(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    );
  }
});

// Types for logout response
interface LogoutResponse {
  success: boolean;
  message: string;
}

// POST /api/auth/logout
authRouter.post('/logout', async (c) => {
  try {
    // Get session token from Authorization header
    const authHeader = c.req.header('Authorization');
    const sessionToken = extractBearerToken(authHeader);

    if (!sessionToken) {
      return c.json<ErrorResponse>(
        { error: 'Authorization header required', code: 'UNAUTHORIZED' },
        401
      );
    }

    // Invalidate session in KV
    if (c.env.RATE_LIMIT) {
      await deleteSession(c.env.RATE_LIMIT, sessionToken);
    }

    return c.json<LogoutResponse>({
      success: true,
      message: 'Logged out successfully',
    }, 200);

  } catch (error) {
    console.error('Logout error:', error);
    return c.json<ErrorResponse>(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    );
  }
});

// Types for account recovery
interface RecoverRequest {
  email: string;
  authHash: string;
  authSalt: string;
  kekSalt: string;
  wrappedKey: string;
}

interface RecoverResponse {
  userId: string;
  sessionToken: string;
}

function validateRecoverRequest(body: unknown): { valid: true; data: RecoverRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const data = body as Record<string, unknown>;

  // Validate email
  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  if (!isValidEmail(data.email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Validate authHash (base64 encoded)
  if (!data.authHash || typeof data.authHash !== 'string') {
    return { valid: false, error: 'AuthHash is required' };
  }
  if (!isValidBase64(data.authHash)) {
    return { valid: false, error: 'AuthHash must be valid base64' };
  }

  // Validate authSalt (base64 encoded)
  if (!data.authSalt || typeof data.authSalt !== 'string') {
    return { valid: false, error: 'AuthSalt is required' };
  }
  if (!isValidBase64(data.authSalt)) {
    return { valid: false, error: 'AuthSalt must be valid base64' };
  }

  // Validate kekSalt (base64 encoded)
  if (!data.kekSalt || typeof data.kekSalt !== 'string') {
    return { valid: false, error: 'KEKSalt is required' };
  }
  if (!isValidBase64(data.kekSalt)) {
    return { valid: false, error: 'KEKSalt must be valid base64' };
  }

  // Validate wrappedKey (base64 encoded)
  if (!data.wrappedKey || typeof data.wrappedKey !== 'string') {
    return { valid: false, error: 'WrappedKey is required' };
  }
  if (!isValidBase64(data.wrappedKey)) {
    return { valid: false, error: 'WrappedKey must be valid base64' };
  }

  return {
    valid: true,
    data: {
      email: data.email as string,
      authHash: data.authHash as string,
      authSalt: data.authSalt as string,
      kekSalt: data.kekSalt as string,
      wrappedKey: data.wrappedKey as string,
    },
  };
}

// POST /api/auth/recover - Account recovery with seed phrase
authRouter.post('/recover', async (c) => {
  try {
    // Parse and validate request body
    const body = await c.req.json();
    const validation = validateRecoverRequest(body);

    if (!validation.valid) {
      return c.json<ErrorResponse>(
        { error: validation.error, code: 'VALIDATION_ERROR' },
        400
      );
    }

    const { email, authHash, authSalt, kekSalt, wrappedKey } = validation.data;
    const normalizedEmail = email.toLowerCase();

    // Fetch user by email
    const user = await c.env.DB.prepare(`
      SELECT id, email
      FROM users WHERE email = ?
    `).bind(normalizedEmail).first<{
      id: string;
      email: string;
    }>();

    if (!user) {
      return c.json<ErrorResponse>(
        { error: 'Account not found', code: 'USER_NOT_FOUND' },
        404
      );
    }

    // Create new AuthVerifier from new AuthHash
    const authVerifier = await createAuthVerifier(authHash, c.env.PEPPER);

    // Update user credentials with new password-derived values
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`
      UPDATE users 
      SET auth_verifier = ?, auth_salt = ?, kek_salt = ?, wrapped_key = ?,
          failed_login_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?
    `).bind(
      authVerifier,
      authSalt,
      kekSalt,
      wrappedKey,
      now,
      user.id
    ).run();

    // Generate new session token
    const sessionToken = await generateSessionToken();

    // Store session in KV
    if (c.env.RATE_LIMIT) {
      await createSession(c.env.RATE_LIMIT, sessionToken, user.id);
    }

    return c.json<RecoverResponse>({
      userId: user.id,
      sessionToken,
    }, 200);

  } catch (error) {
    console.error('Account recovery error:', error);
    return c.json<ErrorResponse>(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    );
  }
});

export { authRouter, constantTimeCompare };
export type { RegisterRequest, RegisterResponse, LoginRequest, LoginResponse, LogoutResponse, RecoverRequest, RecoverResponse, ErrorResponse };
