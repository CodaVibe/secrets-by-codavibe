# Secrets by Codavibe - Complete Development Guide

**Product:** Zero-Knowledge Password Manager & Subscription Dashboard  
**Domain:** secrets.codavibe.dev  
**Target Users:** Solo developers, individual developers  
**Market:** Canada & USA  
**Pricing:** $5/month (single tier)  
**Last Updated:** November 22, 2025

---

## Product Overview

### Core Features (MVP - Phase 1)

**1. Hierarchical Credential Storage**
```
Service (e.g., Cloudflare)
├── Password (optional)
├── API Key: "Domains API" → encrypted value
├── API Key: "DNS API" → encrypted value
├── Secret Key: "Workers Secret" → encrypted value
└── ... (unlimited keys of any type)
```

**Supported Key Types:**
- Password, API Key, Secret Key, Public Key, Access Token, Private Key, Custom

**2. Zero-Knowledge Authentication**
- Registration with username + master password
- Seed phrase recovery (24 words, shown once during registration)
- Client-side encryption only (server never sees plaintext)
- Accept data loss if user loses both password and seed phrase

**3. Subscription Dashboard**

**Tracked per subscription:**
- Service name, Cost + Currency, Billing cycle (monthly/yearly/custom)
- Next renewal date, Payment method (last 4 digits or nickname)
- Start date, Tier/plan name, Trial status + end date

**Analytics:**
- Total monthly/yearly spending
- Spending trends (line chart)
- Cost breakdown by service (pie chart)
- Upcoming renewals calendar
- Trial expiration warnings

**4. View-Only Mode**
- Show service names and credential labels without values
- Require master password to reveal actual credentials

**5. Security Features**
- Session timeout (15 min inactivity auto-lock)
- Rate limiting on auth endpoints
- Content Security Policy with Trusted Types
- No audit logs, zero retention policy

---

## Tech Stack (2025)

**Frontend:**
- Svelte 5 (Runes: `$state`, `$derived`, `$effect`)
- Tailwind CSS 4 (Oxide Engine, CSS-first config)
- Vite + @tailwindcss/vite plugin

**Backend:**
- Cloudflare Workers (Smart Placement)
- Cloudflare D1 (SQLite with global read replication)
- Cloudflare KV (rate limiting)

**Crypto:**
- @noble/hashes (Argon2id for key derivation)
- @noble/ciphers (AES-256-GCM encryption)

**Storage:**
- IndexedDB (offline-first, encrypted vault cache)

**Testing:**
- Vitest (unit tests)
- Playwright (E2E tests)

**Deployment:**
- GitHub → Cloudflare Pages (frontend)
- GitHub → Cloudflare Workers (backend)
- Wrangler CLI for D1 migrations

---

## Zero-Knowledge Security Architecture

### Key Derivation (Client-Side Only)

**Master Password:** Never leaves the client

**Two Derived Keys:**
1. **Auth Hash:** `Argon2id(MasterPassword, AuthSalt)` → Sent to server for login verification
2. **Key Encryption Key (KEK):** `Argon2id(MasterPassword, KEKSalt)` → Used to decrypt DEK locally

**Argon2id Parameters (Adaptive):**
- Memory: 64 MB (65536 KiB)
- Iterations: 3-4 (adjusted for 300-500ms target)
- Parallelism: 4
- Implementation: @noble/hashes (no WASM, audited)

### Data Encryption Key (DEK)

**DEK Generation:**
- Random 32-byte key generated on client during registration
- Encrypted with KEK → stored as `wrapped_key` in database
- Decrypted in browser memory to encrypt/decrypt vault items

**Benefit:** Changing master password only re-encrypts DEK, not entire vault

### Encryption Flow

**Registration:**
1. User enters master password
2. Generate random `AuthSalt` and `KEKSalt`
3. Derive `AuthHash` and `KEK` using Argon2id
4. Generate random 32-byte `DEK`
5. Encrypt DEK with KEK → `WrappedKey`
6. Add server-side `Pepper` to `AuthHash` → `AuthVerifier`
7. Store in DB: `AuthVerifier`, `AuthSalt`, `KEKSalt`, `WrappedKey`

**Login:**
1. User enters master password
2. Fetch `AuthSalt` and `KEKSalt` from server
3. Derive `AuthHash` and `KEK` locally
4. Send `AuthHash` to server
5. Server adds `Pepper` and compares with `AuthVerifier` (constant-time)
6. If valid, return `WrappedKey`
7. Decrypt `WrappedKey` with `KEK` → get `DEK`
8. Use `DEK` to encrypt/decrypt vault items

**Vault Item Encryption:**
- Algorithm: AES-256-GCM
- Each item: `{ encrypted_data, iv (12 bytes), auth_tag }`
- Additional HMAC: `HMAC(user_id || item_id || encrypted_data)` using DEK-derived key

### Server-Side Security

**Pepper:** Secret value stored in Cloudflare Worker Secrets, added to AuthHash before verification
**Rate Limiting:** 5 failed login attempts per 15 minutes per IP (Cloudflare KV)
**Account Lockout:** Temporary lockout after excessive failed attempts
**Constant-Time Comparison:** Prevent timing attacks on auth verification

### Seed Phrase Recovery

**Implementation:**
- Generate 24-word BIP39 mnemonic during registration
- Show once, user must save (not stored on server)
- Recovery: Derive new master password from seed phrase
- Re-encrypt DEK with new KEK

---

## Database Schema (Cloudflare D1)

### `users` Table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,  -- UUID
  email TEXT UNIQUE NOT NULL,
  auth_verifier TEXT NOT NULL,  -- Hash of (AuthHash + Pepper)
  auth_salt TEXT NOT NULL,
  kek_salt TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,  -- DEK encrypted with KEK
  dek_version INTEGER DEFAULT 1,
  argon2_memory INTEGER DEFAULT 65536,  -- KiB
  argon2_iterations INTEGER DEFAULT 3,
  argon2_parallelism INTEGER DEFAULT 4,
  created_at INTEGER NOT NULL,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'active',  -- 'active', 'canceled'
  subscription_end_date INTEGER,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until INTEGER
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe ON users(stripe_customer_id);
```

### `services` Table (Parent for credentials)

```sql
CREATE TABLE services (
  id TEXT PRIMARY KEY,  -- UUID
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,  -- e.g., "Cloudflare"
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_services_user ON services(user_id) WHERE is_deleted = 0;
```

### `credentials` Table (Children of services)

```sql
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,  -- UUID
  service_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'password', 'api_key', 'secret_key', 'public_key', 'access_token', 'private_key', 'custom'
  label TEXT NOT NULL,  -- e.g., "Domains API", "Account Password"
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,  -- For sorting within service
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_credentials_service ON credentials(service_id, display_order) WHERE is_deleted = 0;
CREATE INDEX idx_credentials_user ON credentials(user_id) WHERE is_deleted = 0;
```

### `subscriptions` Table

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,  -- UUID
  user_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  cost REAL NOT NULL,
  currency TEXT NOT NULL,  -- 'USD', 'CAD', 'EUR'
  billing_cycle TEXT NOT NULL,  -- 'monthly', 'yearly', 'custom'
  custom_cycle_days INTEGER,
  next_renewal INTEGER NOT NULL,  -- Unix timestamp
  payment_method TEXT NOT NULL,  -- "•••• 1234" or "Personal Visa"
  start_date INTEGER NOT NULL,
  tier TEXT NOT NULL,  -- "Pro", "Enterprise"
  is_trial INTEGER DEFAULT 0,
  trial_end_date INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id) WHERE is_deleted = 0;
CREATE INDEX idx_subscriptions_renewal ON subscriptions(user_id, next_renewal) WHERE is_deleted = 0;
```

---

## API Endpoints (Cloudflare Workers)

### Authentication

**POST /api/auth/register**
```typescript
Request: {
  email: string;
  authHash: string;
  authSalt: string;
  kekSalt: string;
  wrappedKey: string;
  argon2Params: { memory: number; iterations: number; parallelism: number; };
}
Response: { userId: string; sessionToken: string; }
```

**POST /api/auth/login**
```typescript
Request: { email: string; authHash: string; }
Response: { 
  userId: string; 
  sessionToken: string; 
  wrappedKey: string;
  kekSalt: string;
  argon2Params: { memory: number; iterations: number; parallelism: number; };
}
```

**POST /api/auth/logout**
```typescript
Request: { sessionToken: string; }
Response: { success: boolean; }
```

### Vault - Services

**GET /api/vault/services**
```typescript
Response: {
  services: Array<{
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
  }>;
}
```

**POST /api/vault/services**
```typescript
Request: {
  name: string;
}
Response: { serviceId: string; }
```

**DELETE /api/vault/services/:id**
```typescript
Response: { success: boolean; }
```

### Vault - Credentials

**GET /api/vault/credentials?serviceId=<id>**
```typescript
Response: {
  credentials: Array<{
    id: string;
    serviceId: string;
    type: string;
    label: string;
    encryptedValue: string;
    iv: string;
    authTag: string;
    displayOrder: number;
  }>;
}
```

**POST /api/vault/credentials**
```typescript
Request: {
  serviceId: string;
  type: string;
  label: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  displayOrder: number;
}
Response: { credentialId: string; }
```

**PUT /api/vault/credentials/:id**
```typescript
Request: {
  label?: string;
  encryptedValue?: string;
  iv?: string;
  authTag?: string;
  displayOrder?: number;
}
Response: { success: boolean; }
```

**DELETE /api/vault/credentials/:id**
```typescript
Response: { success: boolean; }
```

### Subscriptions

**GET /api/subscriptions**
```typescript
Response: {
  subscriptions: Array<{
    id: string;
    serviceName: string;
    cost: number;
    currency: string;
    billingCycle: string;
    customCycleDays?: number;
    nextRenewal: number;
    paymentMethod: string;
    startDate: number;
    tier: string;
    isTrial: boolean;
    trialEndDate?: number;
  }>;
}
```

**POST /api/subscriptions**
```typescript
Request: {
  serviceName: string;
  cost: number;
  currency: string;
  billingCycle: string;
  customCycleDays?: number;
  nextRenewal: number;
  paymentMethod: string;
  startDate: number;
  tier: string;
  isTrial: boolean;
  trialEndDate?: number;
}
Response: { subscriptionId: string; }
```

**PUT /api/subscriptions/:id**
```typescript
Request: { /* any subscription fields to update */ }
Response: { success: boolean; }
```

**DELETE /api/subscriptions/:id**
```typescript
Response: { success: boolean; }
```

---

## Frontend Architecture (Svelte 5)

### Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── crypto/
│   │   │   ├── argon2.ts          # Argon2id key derivation
│   │   │   ├── aes.ts             # AES-256-GCM encryption
│   │   │   ├── seed-phrase.ts     # BIP39 mnemonic generation
│   │   │   └── worker.ts          # Web Worker for heavy crypto
│   │   ├── stores/
│   │   │   ├── auth.svelte.ts     # Auth state (Svelte 5 runes)
│   │   │   ├── vault.svelte.ts    # Vault state
│   │   │   └── subscriptions.svelte.ts
│   │   ├── api/
│   │   │   ├── auth.ts
│   │   │   ├── vault.ts
│   │   │   └── subscriptions.ts
│   │   └── db/
│   │       └── indexeddb.ts       # Offline storage
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte           # Landing/login
│   │   ├── register/+page.svelte
│   │   ├── vault/+page.svelte
│   │   └── dashboard/+page.svelte
│   └── app.html
├── static/
├── vite.config.ts
├── svelte.config.js
└── package.json
```

### Svelte 5 Runes State Management

**auth.svelte.ts:**
```typescript
let isAuthenticated = $state(false);
let userId = $state<string | null>(null);
let sessionToken = $state<string | null>(null);
let dek = $state<Uint8Array | null>(null);  // Data Encryption Key

// Derived state
let isLocked = $derived(!dek);

// Auto-lock after 15 min inactivity
$effect(() => {
  if (isAuthenticated && dek) {
    const timeout = setTimeout(() => {
      dek = null;  // Lock vault
    }, 15 * 60 * 1000);
    
    return () => clearTimeout(timeout);
  }
});
```

**vault.svelte.ts:**
```typescript
let services = $state<Service[]>([]);
let credentials = $state<Credential[]>([]);
let isLoading = $state(false);

// Derived
let serviceCount = $derived(services.length);
let credentialCount = $derived(credentials.length);

// Load from IndexedDB on mount
$effect(() => {
  loadFromIndexedDB();
});
```

### Crypto Worker (Web Worker)

**Purpose:** Offload heavy Argon2id computation to prevent UI blocking

**worker.ts:**
```typescript
import { argon2id } from '@noble/hashes/argon2';

self.onmessage = async (e) => {
  const { type, password, salt, params } = e.data;
  
  if (type === 'deriveKey') {
    const hash = argon2id(password, salt, {
      m: params.memory,
      t: params.iterations,
      p: params.parallelism,
      dkLen: 32
    });
    
    self.postMessage({ type: 'keyDerived', hash });
  }
};
```

### IndexedDB Schema

**Stores:**
- `services` - Cached services
- `credentials` - Cached encrypted credentials
- `subscriptions` - Cached subscriptions
- `metadata` - Last sync timestamp, user preferences

---

## Design System (Tailwind CSS 4)

### Color Palette

**CSS Variables (app.css):**
```css
@theme {
  --color-background: #1b1b1b;
  --color-surface: #2d2d2d;
  --color-border: #3a3a3a;
  
  --color-text-primary: rgba(255, 255, 255, 0.87);
  --color-text-secondary: rgba(255, 255, 255, 0.60);
  --color-text-disabled: rgba(255, 255, 255, 0.38);
  
  --color-accent-primary: #BB86FC;
  --color-accent-secondary: #00FFFF;
  
  --color-error: #CF6679;
  --color-warning: #FFB74D;
  --color-success: #81C784;
}
```

### Component Examples

**Button:**
```svelte
<button class="bg-accent-primary text-text-primary px-4 py-2 rounded-lg hover:opacity-90 transition">
  Unlock Vault
</button>
```

**Card:**
```svelte
<div class="bg-surface border border-border rounded-lg p-6">
  <h2 class="text-text-primary text-xl mb-4">Service Name</h2>
  <p class="text-text-secondary">Credentials</p>
</div>
```

---

## Security Headers (Cloudflare Workers)

```typescript
const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    "require-trusted-types-for 'script'",
    "trusted-types default"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};
```

---

## Rate Limiting (Cloudflare KV)

```typescript
async function checkRateLimit(ip: string, kv: KVNamespace): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate_limit:${ip}`;
  const current = await kv.get(key);
  
  if (!current) {
    await kv.put(key, "1", { expirationTtl: 900 }); // 15 min
    return { allowed: true, remaining: 4 };
  }
  
  const count = parseInt(current, 10);
  const limit = 5;
  
  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  
  await kv.put(key, (count + 1).toString(), { expirationTtl: 900 });
  return { allowed: true, remaining: limit - count - 1 };
}
```

---

## GitHub → Cloudflare Deployment

### Repository Structure

```
secrets-by-codavibe/
├── frontend/              # Svelte 5 app
│   ├── src/
│   ├── static/
│   ├── package.json
│   └── vite.config.ts
├── backend/               # Cloudflare Workers
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   └── middleware/
│   ├── wrangler.toml
│   └── package.json
├── migrations/            # D1 SQL migrations
│   ├── 0001_initial.sql
│   └── 0002_add_services.sql
└── .github/
    └── workflows/
        ├── deploy-frontend.yml
        └── deploy-backend.yml
```

### GitHub Actions - Frontend Deploy

**.github/workflows/deploy-frontend.yml:**
```yaml
name: Deploy Frontend to Cloudflare Pages

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          cache-dependency-path: frontend/pnpm-lock.yaml
      
      - name: Install dependencies
        run: cd frontend && pnpm install
      
      - name: Build
        run: cd frontend && pnpm run build
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy frontend/build --project-name=secrets-codavibe
```

### GitHub Actions - Backend Deploy

**.github/workflows/deploy-backend.yml:**
```yaml
name: Deploy Backend to Cloudflare Workers

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'migrations/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          cache-dependency-path: backend/pnpm-lock.yaml
      
      - name: Install dependencies
        run: cd backend && pnpm install
      
      - name: Run D1 Migrations
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: d1 migrations apply secrets-db --remote
          workingDirectory: backend
      
      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
          workingDirectory: backend
```

### Cloudflare Configuration

**wrangler.toml (backend):**
```toml
name = "secrets-api"
main = "src/index.ts"
compatibility_date = "2025-11-22"

[env.production]
vars = { ENVIRONMENT = "production" }

[[d1_databases]]
binding = "DB"
database_name = "secrets-db"
database_id = "<YOUR_D1_DATABASE_ID>"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<YOUR_KV_NAMESPACE_ID>"

[secrets]
# Set via: wrangler secret put PEPPER
# PEPPER = "..."
```

### Domain Setup

1. **Cloudflare Pages:** Connect `secrets.codavibe.dev` to Pages project
2. **Custom Domain:** Add CNAME record pointing to Cloudflare Pages
3. **SSL:** Automatic via Cloudflare (Full Strict mode)

---

## Dependencies (package.json)

### Frontend

```json
{
  "name": "secrets-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "svelte": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@noble/hashes": "^1.5.0",
    "@noble/ciphers": "^1.0.0",
    "idb": "^8.0.0",
    "date-fns": "^3.0.0"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.48.0",
    "typescript": "^5.6.0"
  }
}
```

### Backend

```json
{
  "name": "secrets-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.80.0",
    "vitest": "^2.0.0",
    "typescript": "^5.6.0"
  }
}
```

---

## Performance Targets

- **Vault unlock:** <300ms (target: 200ms)
- **Time to interactive:** <1.5s
- **Argon2 computation:** 300-500ms (adaptive)
- **API response:** <100ms (Workers + D1)
- **Build time:** <30s (Vite + Tailwind 4 Oxide)

---

## Testing Strategy

### Unit Tests (Vitest)

**Crypto utilities:**
- Argon2id key derivation
- AES-256-GCM encryption/decryption
- Seed phrase generation/validation
- HMAC authentication

**API handlers:**
- Auth endpoints (register, login, logout)
- Vault CRUD operations
- Subscription CRUD operations
- Rate limiting logic

### E2E Tests (Playwright)

**Critical flows:**
1. Registration with seed phrase backup
2. Login and vault unlock
3. Add service with multiple credentials
4. Add subscription and view dashboard
5. Lock/unlock vault
6. Account recovery with seed phrase

---

## Out of Scope (MVP)

- ❌ Multi-device sync (Phase 2)
- ❌ Browser extension
- ❌ Stripe payment integration (post-MVP)
- ❌ Email notifications
- ❌ Two-factor authentication
- ❌ Password sharing
- ❌ Mobile apps

---

## Development Workflow (GitHub → Cloudflare)

### Initial Setup

1. **Create GitHub repository:** `secrets-by-codavibe`
2. **Create Cloudflare D1 database:** `wrangler d1 create secrets-db`
3. **Create Cloudflare KV namespace:** `wrangler kv:namespace create RATE_LIMIT`
4. **Set GitHub Secrets:**
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. **Set Cloudflare Worker Secrets:** `wrangler secret put PEPPER`
6. **Connect domain:** `secrets.codavibe.dev` to Cloudflare Pages

### Development Cycle

1. **Push to GitHub:** Commit changes to `main` branch
2. **GitHub Actions:** Automatically build and deploy
3. **View live:** Visit `secrets.codavibe.dev`
4. **Iterate:** Make changes, push, see updates in real-time

### No Local Development

- All changes deployed directly to Cloudflare
- Use Cloudflare Pages preview deployments for testing
- GitHub Actions handle all builds and deployments
- View logs in Cloudflare Dashboard

---

## AI IDE Development Guidelines

### Critical Rules

1. **Use pnpm exclusively** for package management
2. **Execute operations directly** (don't create guides)
3. **Use latest stable versions** as of November 22, 2025
4. **Avoid deprecated packages**
5. **Write and execute all tests** autonomously
6. **Document in `docs/` folder** as you build
7. **Proactive, not reactive** - anticipate issues
8. **Complete solutions** - fully functional, tested features

### Operations to Execute

✅ Run `wrangler d1 create secrets-db`  
✅ Run `wrangler kv:namespace create RATE_LIMIT`  
✅ Execute D1 migrations  
✅ Run unit tests (Vitest)  
✅ Run E2E tests (Playwright)  
✅ Configure GitHub Actions  
✅ Set Cloudflare secrets  

❌ Don't create step-by-step guides  
❌ Don't ask user to run commands manually  

---

## Next Steps

1. Initialize GitHub repository structure
2. Set up Cloudflare D1 database and KV namespace
3. Create D1 migrations (users, services, credentials, subscriptions)
4. Scaffold Svelte 5 frontend with Tailwind 4
5. Implement crypto utilities (@noble libraries)
6. Build authentication flow (register, login, seed phrase)
7. Create vault UI (services + credentials hierarchy)
8. Build subscription dashboard with analytics
9. Configure GitHub Actions for deployment
10. Test end-to-end on secrets.codavibe.dev
