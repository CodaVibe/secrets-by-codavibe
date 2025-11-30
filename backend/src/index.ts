import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  rateLimitMiddleware,
  authRateLimitMiddleware,
  registrationRateLimitMiddleware,
} from './middleware/rateLimit';
import { securityHeadersMiddleware } from './middleware/securityHeaders';
import { authRouter } from './routes/auth';
import { vaultRouter } from './routes/vault';
import { subscriptionsRouter } from './routes/subscriptions';

type Bindings = {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  PEPPER: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Security headers middleware (applied to all responses)
app.use('*', securityHeadersMiddleware());

// CORS middleware
app.use('*', cors({
  origin: ['https://secrets.codavibe.dev', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check (no rate limiting)
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));

// Apply rate limiting to auth endpoints
app.use('/api/auth/login', authRateLimitMiddleware());
app.use('/api/auth/register', registrationRateLimitMiddleware());

// General rate limiting for other API endpoints (more lenient)
app.use('/api/*', rateLimitMiddleware({ limit: 100, windowSeconds: 60 }));

// API routes placeholder
app.get('/api', (c) => c.json({ message: 'Secrets API v1' }));

// Mount auth routes
app.route('/api/auth', authRouter);

// Mount vault routes
app.route('/api/vault', vaultRouter);

// Mount subscriptions routes
app.route('/api/subscriptions', subscriptionsRouter);

export default app;

// Export types for use in other modules
export type { Bindings };
