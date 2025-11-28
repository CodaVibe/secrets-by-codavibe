import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  PEPPER: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware
app.use('*', cors({
  origin: ['https://secrets.codavibe.dev', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// API routes placeholder
app.get('/api', (c) => c.json({ message: 'Secrets API v1' }));

export default app;
