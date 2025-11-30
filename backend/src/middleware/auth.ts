import { Context, Next } from 'hono';

// Session data stored in KV
export interface SessionData {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

// Extended context variables for authenticated requests
export interface AuthVariables {
  userId: string;
  sessionToken: string;
}

// Session configuration
export interface SessionConfig {
  sessionDurationSeconds: number;
  keyPrefix: string;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionDurationSeconds: 24 * 60 * 60, // 24 hours
  keyPrefix: 'session',
};

type Bindings = {
  RATE_LIMIT: KVNamespace; // Reusing RATE_LIMIT KV for sessions
};

/**
 * Create a new session in KV store
 */
export async function createSession(
  kv: KVNamespace,
  sessionToken: string,
  userId: string,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): Promise<SessionData> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + config.sessionDurationSeconds;

  const sessionData: SessionData = {
    userId,
    createdAt: now,
    expiresAt,
  };

  const key = `${config.keyPrefix}:${sessionToken}`;
  await kv.put(key, JSON.stringify(sessionData), {
    expirationTtl: config.sessionDurationSeconds,
  });

  return sessionData;
}

/**
 * Get session from KV store
 */
export async function getSession(
  kv: KVNamespace,
  sessionToken: string,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): Promise<SessionData | null> {
  const key = `${config.keyPrefix}:${sessionToken}`;
  const data = await kv.get(key);

  if (!data) {
    return null;
  }

  try {
    const session = JSON.parse(data) as SessionData;
    const now = Math.floor(Date.now() / 1000);

    // Check if session has expired
    if (session.expiresAt < now) {
      // Clean up expired session
      await kv.delete(key);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Delete session from KV store (for logout)
 */
export async function deleteSession(
  kv: KVNamespace,
  sessionToken: string,
  config: SessionConfig = DEFAULT_SESSION_CONFIG
): Promise<void> {
  const key = `${config.keyPrefix}:${sessionToken}`;
  await kv.delete(key);
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  return token.length > 0 ? token : null;
}

/**
 * Session authentication middleware for Hono
 * 
 * Verifies the session token from Authorization header and attaches
 * userId to the request context for use in route handlers.
 * 
 * Usage:
 * ```ts
 * app.use('/api/vault/*', sessionMiddleware());
 * 
 * app.get('/api/vault/services', (c) => {
 *   const userId = c.get('userId');
 *   // ... fetch user's services
 * });
 * ```
 */
export function sessionMiddleware(config: Partial<SessionConfig> = {}) {
  const mergedConfig = { ...DEFAULT_SESSION_CONFIG, ...config };

  return async (
    c: Context<{ Bindings: Bindings; Variables: AuthVariables }>,
    next: Next
  ) => {
    const kv = c.env.RATE_LIMIT;

    if (!kv) {
      console.error('KV namespace not configured for session storage');
      return c.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        500
      );
    }

    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization');
    const sessionToken = extractBearerToken(authHeader);

    if (!sessionToken) {
      return c.json(
        { error: 'Authorization required', code: 'UNAUTHORIZED' },
        401
      );
    }

    // Validate session
    const session = await getSession(kv, sessionToken, mergedConfig);

    if (!session) {
      return c.json(
        { error: 'Invalid or expired session', code: 'INVALID_SESSION' },
        401
      );
    }

    // Attach user info to context
    c.set('userId', session.userId);
    c.set('sessionToken', sessionToken);

    return next();
  };
}
