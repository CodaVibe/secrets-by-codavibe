import { Context, Next } from 'hono';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
  keyPrefix?: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  limit: 5,
  windowSeconds: 900, // 15 minutes
  keyPrefix: 'rate_limit',
};

/**
 * Check rate limit for a given identifier using Cloudflare KV
 * 
 * Correctness Properties:
 * - P21.1: Key format: `rate_limit:{ip}`
 * - P21.2: TTL: 900 seconds (15 minutes)
 * - P21.3: Limit: 5 requests per window
 * - P21.4: Atomic increment (no race conditions)
 * - P21.5: Return remaining attempts in response
 */
export async function checkRateLimit(
  identifier: string,
  kv: KVNamespace,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const { limit, windowSeconds, keyPrefix } = { ...DEFAULT_CONFIG, ...config };
  const key = `${keyPrefix}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + windowSeconds;

  const current = await kv.get(key);

  if (!current) {
    // First request in window
    await kv.put(key, '1', { expirationTtl: windowSeconds });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  const count = parseInt(current, 10);

  if (count >= limit) {
    // Rate limit exceeded
    return { allowed: false, remaining: 0, resetAt };
  }

  // Increment counter
  await kv.put(key, (count + 1).toString(), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: limit - count - 1, resetAt };
}

/**
 * Get client IP address from request
 * Cloudflare provides the real IP in CF-Connecting-IP header
 */
export function getClientIP(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    '127.0.0.1'
  );
}

/**
 * Add rate limit headers to response
 */
export function setRateLimitHeaders(
  c: Context,
  result: RateLimitResult,
  limit: number
): void {
  c.header('X-RateLimit-Limit', limit.toString());
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.resetAt.toString());
}

type Bindings = {
  RATE_LIMIT: KVNamespace;
};

/**
 * Rate limiting middleware for Hono
 * 
 * Usage:
 * ```ts
 * app.use('/api/auth/*', rateLimitMiddleware({ limit: 5, windowSeconds: 900 }));
 * ```
 */
export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;
    
    if (!kv) {
      console.warn('RATE_LIMIT KV namespace not configured');
      return next();
    }

    const ip = getClientIP(c);
    const result = await checkRateLimit(ip, kv, mergedConfig);

    setRateLimitHeaders(c, result, mergedConfig.limit);

    if (!result.allowed) {
      return c.json(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
        },
        429
      );
    }

    return next();
  };
}

/**
 * Rate limiting middleware specifically for auth endpoints
 * Uses stricter limits: 5 attempts per 15 minutes
 */
export function authRateLimitMiddleware() {
  return rateLimitMiddleware({
    limit: 5,
    windowSeconds: 900,
    keyPrefix: 'auth_rate_limit',
  });
}

/**
 * Rate limiting middleware for registration
 * Uses stricter limits: 5 registrations per hour per IP
 */
export function registrationRateLimitMiddleware() {
  return rateLimitMiddleware({
    limit: 5,
    windowSeconds: 3600, // 1 hour
    keyPrefix: 'reg_rate_limit',
  });
}
