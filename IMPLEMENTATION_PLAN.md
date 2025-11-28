# Implementation Plan v2 - Zero-Knowledge Password & Subscription Manager

## Goal Description

Create a secure, zero-knowledge password manager and subscription dashboard. The application will store passwords and API keys, and provide a dashboard for tracking subscriptions (renewals, spending). It will be built on the Cloudflare ecosystem (Workers, D1, Pages) using Svelte 5 (Runes) and Tailwind CSS 4 (Oxide Engine).

**Version 2 Updates (November 2025):**
- Migrated to Svelte 5 runes-based reactivity system
- Updated to Tailwind CSS 4 with CSS-first configuration
- Leveraged latest Cloudflare D1 features (read replication, batch operations)
- Modernized cryptography stack with @noble libraries
- Enhanced offline-first architecture with improved conflict resolution
- Updated performance targets to 2025 standards

---

## AI IDE Development Guidelines

> [!IMPORTANT]
> **Critical Development Rules**
> 
> When developing this project, the AI IDE **MUST** adhere to the following guidelines:

### Package Management & Dependencies

1. **No Deprecated Packages**: Avoid using any deprecated packages or libraries unless absolutely necessary and unsolvable by other means. Always verify package status before installation.

2. **Latest Versions**: Use the most up-to-date stable versions of all dependencies as of **November 22, 2025**. Check npm/pnpm for latest versions and ensure compatibility.

3. **Package Manager**: Use **pnpm** exclusively for all package management operations:
   - `pnpm install` - Install dependencies
   - `pnpm add <package>` - Add new dependencies
   - `pnpm remove <package>` - Remove dependencies
   - `pnpm update` - Update dependencies

### Documentation Standards

4. **Maintain Documentation Folder**: Create and actively maintain a `docs/` folder with comprehensive documentation:
   - Architecture diagrams
   - API documentation
   - Security model explanations
   - Setup and deployment guides
   - Code examples and tutorials
   - Changelog and version history

### Autonomous Operations

5. **Execute, Don't Instruct**: The AI IDE should **execute operations directly** rather than creating guides for manual execution:
   - ✅ **DO**: Run `wrangler d1 create <db-name>` directly
   - ✅ **DO**: Execute migrations, run tests, start dev servers
   - ✅ **DO**: Configure environment variables and secrets
   - ❌ **DON'T**: Create step-by-step guides for operations the AI can perform
   - ❌ **DON'T**: Ask the user to manually run commands that can be automated

6. **Testing Ownership**: The AI IDE is responsible for **all testing activities**:
   - Write and execute unit tests (Vitest)
   - Write and execute E2E tests (Playwright)
   - Run performance benchmarks
   - Execute security audits
   - Validate test coverage
   - Fix failing tests autonomously

### Implementation Philosophy

- **Proactive, not reactive**: Anticipate issues and handle them before they become problems
- **Complete solutions**: Deliver fully functional, tested features, not partial implementations
- **Self-validation**: Verify work through automated tests and checks
- **Documentation first**: Document as you build, not as an afterthought

---

## Architecture Overview

### Zero-Knowledge Security Model (Key Wrapping Architecture)

**Master Password:** Never leaves the client.

**Key Derivation:**
- **Auth Hash**: `Argon2id(MasterPassword, AuthSalt)` → Sent to server for login
- **Key Encryption Key (KEK)**: `Argon2id(MasterPassword, KEKSalt)` → Used to encrypt/decrypt the DEK

**Argon2id Parameters (Adaptive - 2025):**
- Memory: 64 MB (65536 KiB) - adjustable based on device capabilities
- Iterations: 3-4 - dynamically adjusted for 300-500ms target
- Parallelism: 4
- Target: ~300-500ms on average devices (adaptive to hardware)
- **Progressive Enhancement:** Parameters auto-adjust based on device memory/CPU detection
- **Per-User Configuration:** Stored in DB with telemetry for continuous optimization
- **Implementation:** Using @noble/hashes library (audited, maintained, no WASM overhead)

**Data Encryption Key (DEK):**
- A random 32-byte key generated on the client
- Stored in the database as `WrappedKey` (encrypted with KEK)
- Decrypted in browser memory to encrypt/decrypt vault items
- **Benefit:** Changing Master Password only requires re-encrypting the DEK, not the entire vault

**Data Encryption:**
- Vault items encrypted with DEK using AES-256-GCM
- Server stores `AuthSalt`, `KEKSalt`, and `WrappedKey`
- Additional HMAC authentication: `HMAC(user_id || item_id || encrypted_data)` using key derived from DEK (prevents server-side tampering)

**Server-Side Security:**
- **Pepper:** Server adds a secret "Pepper" to AuthHash before verification (defense in depth). Stored in Cloudflare Worker Secrets
- **Constant-time comparison** for Pepper+AuthHash verification to prevent timing attacks

**Session & Access Control:**
- **Session Timeout:** Auto-lock vault after configurable inactivity period (default 15 mins)
- **Rate Limiting:** 5 failed login attempts per 15 minutes per IP (using Cloudflare KV)
- **Progressive delays** after failed login attempts (1s, 2s, 5s, 10s)
- **Account Lockout:** Temporary lockout after excessive failed attempts
- **CAPTCHA:** Optional CAPTCHA after N failed attempts
- **WebAuthn/Passkeys:** Optional biometric authentication (Phase 4)
- **Trusted Types API:** Prevent DOM-based XSS attacks

**Key Rotation:**
- `dek_version` tracked in users table
- When DEK is rotated, old DEK kept temporarily to re-encrypt vault items in background
- `encrypted_with_version` field in `vault_items` for tracking

---

## Tech Stack (Optimized for Speed & Security - 2025)

- **Frontend:** Svelte 5 with Runes (`$state`, `$derived`, `$effect`) - compiled, reactive, minimal runtime
- **Styling:** Tailwind CSS 4 (Oxide Engine) - zero-runtime CSS with CSS-first configuration
- **Backend:** Cloudflare Workers (Smart Placement enabled by default)
- **Database:** Cloudflare D1 (SQLite) with global read replication
- **Client Storage:** IndexedDB (offline-first architecture with quota management)
- **Storage (Optional):** Cloudflare R2 (for future receipt attachments)
- **Crypto:** @noble/hashes (Argon2id) + @noble/ciphers (AES-256-GCM) - audited libraries
- **Security:** Content Security Policy (CSP) with Trusted Types API
- **Build Tool:** Vite with @tailwindcss/vite plugin
- **Testing:** Vitest (unit) + Playwright (E2E + component testing)

---

## Proposed Changes

### Database Schema (D1)

#### `users` Table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,  -- UUID
  email TEXT UNIQUE NOT NULL,
  auth_verifier TEXT NOT NULL,  -- Hash of (AuthHash + Pepper)
  auth_salt TEXT NOT NULL,  -- For AuthHash derivation
  kek_salt TEXT NOT NULL,  -- For KEK derivation
  wrapped_key TEXT NOT NULL,  -- DEK encrypted with KEK
  dek_version INTEGER DEFAULT 1,  -- For key rotation
  argon2_memory INTEGER DEFAULT 65536,  -- KiB
  argon2_iterations INTEGER DEFAULT 3,
  argon2_parallelism INTEGER DEFAULT 4,
  created_at INTEGER NOT NULL,  -- Unix timestamp
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'free',  -- 'free', 'pro', 'canceled'
  subscription_end_date INTEGER,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until INTEGER,  -- Unix timestamp
  totp_secret_encrypted TEXT,  -- For future MFA
  backup_codes_encrypted TEXT  -- For future MFA
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe ON users(stripe_customer_id);
```

#### `vault_items` Table

```sql
CREATE TABLE vault_items (
  id TEXT PRIMARY KEY,  -- UUID
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'password', 'api_key'
  encrypted_data TEXT NOT NULL,  -- AES-GCM ciphertext
  iv TEXT NOT NULL,  -- Initialization Vector (12 bytes, base64)
  auth_tag TEXT NOT NULL,  -- HMAC for additional authentication
  encrypted_with_version INTEGER DEFAULT 1,  -- DEK version used
  title_hash TEXT,  -- SHA-256 hash for client-side search
  website_domain TEXT,  -- Extracted domain for autofill
  favorite INTEGER DEFAULT 0,  -- Boolean
  updated_at INTEGER NOT NULL,  -- Unix timestamp for sync
  is_deleted INTEGER DEFAULT 0,  -- Boolean - soft delete for sync
  version INTEGER DEFAULT 1,  -- Conflict resolution
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Composite indexes for optimal query performance (2025 best practices)
CREATE INDEX idx_vault_items_user ON vault_items(user_id);
CREATE INDEX idx_vault_items_user_updated ON vault_items(user_id, updated_at DESC) WHERE is_deleted = 0;
CREATE INDEX idx_vault_items_domain ON vault_items(website_domain) WHERE is_deleted = 0;
CREATE INDEX idx_vault_items_favorite ON vault_items(user_id, favorite DESC, updated_at DESC) WHERE is_deleted = 0;
```

#### `subscriptions` Table

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,  -- UUID
  user_id TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,  -- JSON: name, cost, currency, renew_date, card_info
  iv TEXT NOT NULL,
  next_renewal INTEGER,  -- Unix timestamp (consider: unencrypted for server notifications)
  updated_at INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_user_renewal ON subscriptions(user_id, next_renewal);
```

#### `devices` Table (Device Management)

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,  -- UUID
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,  -- Encrypted
  device_fingerprint TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  public_key TEXT,  -- For future E2EE between devices
  trusted INTEGER DEFAULT 1,  -- Boolean
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_devices_user ON devices(user_id);
```

#### `vault_item_events` Table (Event Sourcing for Conflicts)

```sql
CREATE TABLE vault_item_events (
  id TEXT PRIMARY KEY,  -- UUID
  vault_item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'create', 'update', 'delete'
  encrypted_data TEXT,
  client_timestamp INTEGER NOT NULL,
  server_timestamp INTEGER NOT NULL,
  device_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX idx_events_item ON vault_item_events(vault_item_id, server_timestamp);
CREATE INDEX idx_events_user ON vault_item_events(user_id, server_timestamp);
```

---

### Frontend Components (Svelte 5)

#### Core Architecture (Svelte 5 Runes-Based)

**Offline-First with IndexedDB (Enhanced):**
- Store encrypted vault items locally in IndexedDB with structured cloning
- Sync delta changes with server using incremental timestamps
- Instant unlock experience (decrypt from local cache)
- Track `last_synced_at` client-side with conflict detection
- **Quota Management:** Monitor `navigator.storage.estimate()` and warn at 80% usage
- **Batched Cursor Reads:** Load large datasets efficiently without memory overflow

**CryptoWorker (Web Worker - Optimized):**
- Heavy KDF operations (Argon2id) run in Web Worker using @noble/hashes
- Pre-warm worker on app load for instant availability
- Cache KEK in memory during session (clear on lock/timeout with memory sanitization)
- Use SharedArrayBuffer when available (requires `crossOriginIsolated`)
- **Memory Sanitization:** Overwrite sensitive data with random values before garbage collection

**VaultStore (Svelte 5 Runes):**
```javascript
// Modern Svelte 5 reactive state management
let vaultItems = $state([]);
let isLoading = $state(false);
let syncStatus = $state('idle');

// Derived computed values
let favoriteItems = $derived(vaultItems.filter(item => item.favorite));
let itemCount = $derived(vaultItems.length);

// Side effects for sync
$effect(() => {
  if (syncStatus === 'pending') {
    syncToServer(vaultItems);
  }
});
```

- **Optimistic UI:** Updates state immediately with `$state()`, rolls back on error
- **Progressive Loading:** Load & decrypt items in batches (20 at a time) using batched cursors
- **On-Demand Decryption:** Decrypt only for search results or viewed items
- **LRU Cache:** Keep decrypted items in memory with least-recently-used eviction

**Sync Engine (D1 Batch-Optimized):**
- **Delta Sync:** Track `last_synced_at`, request only items with `updated_at > last_synced_at`
- **Write Optimization:**
  - **Debouncing:** Wait 5s before syncing edits to coalesce rapid changes
  - **Deduplication:** If user edits item 3 times in 5s, only send final state
  - **Batching:** Use D1 batch API (50-100 statements per transaction)
  ```javascript
  await env.DB.batch([
    env.DB.prepare('INSERT INTO vault_items VALUES (?, ?)').bind(id1, data1),
    env.DB.prepare('INSERT INTO vault_items VALUES (?, ?)').bind(id2, data2),
    // ... up to 100 statements
  ]);
  ```
- **Conflict Resolution (CRDT-Inspired):**
  - Event sourcing with vector clocks for ordering
  - Show both versions to user for manual resolution
  - Track operation history in `vault_item_events` table
  - Fallback: Last-write-wins based on `updated_at + version`

#### Feature Components

**PasswordGenerator:**
- Configurable (length, charset, passphrase/diceware)
- Strength estimation using zxcvbn
- Real-time feedback

**SubscriptionDashboard:**
- Spending analytics & charts
- Renewal calendar view
- Client-side or server-side notifications (depending on `next_renewal` encryption choice)
- Future: Competitor alerts, receipt attachments (R2)

**DeviceManagement:**
- List authenticated devices
- Remote logout capability
- Notify on new device login

**SearchInterface:**
- Client-side linear search (<1000 items)
- Hash-based filtering using `title_hash`
- Domain matching for autofill
- Future: Encrypted search (blind indexing, SSE)

---

### Backend (Cloudflare Workers)

#### Security Headers & CSP (2025 Enhanced)

```javascript
// Content Security Policy with Trusted Types
const cspHeader = [
  "default-src 'self'",
  "script-src 'self'",  // No 'wasm-unsafe-eval' needed with @noble libraries
  "style-src 'self'",  // Tailwind 4 doesn't require 'unsafe-inline'
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "require-trusted-types-for 'script'",  // NEW: Prevent DOM XSS
  "trusted-types default"  // NEW: Trusted Types policy
].join('; ');

// Additional security headers
const securityHeaders = {
  'Content-Security-Policy': cspHeader,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};
```

**Subresource Integrity:**
```html
<!-- Verify integrity of external resources -->
<script src="crypto-lib.js" 
        integrity="sha384-..." 
        crossorigin="anonymous"></script>
```

#### Rate Limiting Strategy

**Two-Tier Approach:**

1. **KV for Fast Rate Limiting** (recommended for high-frequency checks):
   - Per-IP request throttling (5 requests per 15 min)
   - Built-in TTL for automatic cleanup
   - <1ms latency globally
   - Eventually consistent (acceptable for rate limiting)

```javascript
// Fast rate limiting with KV
const checkRateLimit = async (ip, kv) => {
  const key = `rate_limit:${ip}`;
  const current = await kv.get(key);
  
  if (!current) {
    await kv.put(key, "1", { expirationTtl: 900 }); // 15 min window
    return { allowed: true, remaining: 4 };
  }
  
  const count = parseInt(current, 10);
  const limit = 5;
  
  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  
  await kv.put(key, (count + 1).toString(), { expirationTtl: 900 });
  return { allowed: true, remaining: limit - count - 1 };
};
```

2. **D1 for Account Lockout** (persistent, strongly consistent):
   - Track failed login attempts per user account
   - Permanent lockout records
   - Audit trail for security events

```javascript
// Persistent account lockout with D1
const checkAccountLockout = async (userId, db) => {
  const user = await db.prepare(
    'SELECT failed_login_attempts, locked_until FROM users WHERE id = ?'
  ).bind(userId).first();
  
  if (user.locked_until && Date.now() < user.locked_until) {
    return { locked: true, until: user.locked_until };
  }
  
  return { locked: false, attempts: user.failed_login_attempts };
};
```

**Why This Hybrid Approach:**
- KV: Fast, distributed, automatic cleanup (for IP-based throttling)
- D1: Persistent, auditable, strongly consistent (for account security)
- Best of both worlds without unnecessary complexity

**Alternative (D1-Only):**
If you want to avoid KV entirely, you CAN use D1 for rate limiting, but you'll need:
- Manual cleanup of old rate limit records (scheduled worker)
- Slightly higher latency (~10-50ms vs <1ms)
- More complex queries and indexing

**Recommendation:** Use the hybrid approach - it's the industry standard for a reason.

#### API Endpoints

**Authentication:**
- `POST /api/auth/register` - Rate limited (5/hour per IP)
- `POST /api/auth/login` - Rate limited (5/15min per IP)
- `POST /api/auth/logout`
- `POST /api/auth/reset-password` - Rate limited
- `POST /api/auth/change-password`

**Vault:**
- `GET /api/vault/sync?since=<timestamp>` - Delta sync
- `POST /api/vault/batch` - Batch write (50-100 items)
- `POST /api/vault/item` - Single item write
- `DELETE /api/vault/item/:id` - Soft delete

**Subscriptions:**
- `GET /api/subscriptions`
- `POST /api/subscriptions`
- `PUT /api/subscriptions/:id`
- `DELETE /api/subscriptions/:id`

**Devices:**
- `GET /api/devices`
- `POST /api/devices/trust`
- `POST /api/devices/revoke`

**Future (Browser Extension):**
- `GET /api/extension/autofill?domain=<domain>` - Authenticated API

---

### Error Recovery & Data Integrity

**Checksum Validation:**
- Add checksum/hash of plaintext before encryption
- On decryption failure, flag item as corrupted (preserve ciphertext)
- Alert user and provide recovery options

**Backup & Export:**
- Export encrypted JSON (entire vault)
- User can download and store securely
- Import functionality for recovery

**Logging & Sanitization:**
- Never log decrypted data
- Scrub sensitive fields from error logs
- Implement log sanitization layer

---

## Performance Optimizations (2025 Standards)

### Frontend (Svelte 5 + Tailwind 4)

1. **Progressive Vault Loading:** Batched cursor reads (20 items at a time)
2. **Lazy Loading:** Code-split routes with dynamic imports
3. **Preload Critical Assets:** Pre-warm crypto worker on app initialization
4. **IndexedDB Caching:** Structured cloning for large objects
5. **Svelte 5 Runes:** Fine-grained reactivity reduces unnecessary re-renders
6. **Tailwind 4 Oxide Engine:** 5-10x faster builds, zero-runtime CSS

### Backend (Cloudflare Workers + D1)

1. **Smart Placement:** Enabled by default for optimal latency
2. **D1 Batch Operations:** Up to 100 statements per transaction
3. **Global Read Replication:** Auto mode for distributed reads
4. **Edge Caching:** Cache public assets with long TTL
5. **Connection Pooling:** Singleton pattern for D1 connections

### Benchmarks (Updated for 2025)

- **Vault unlock time:** <300ms (target: 200ms on modern devices)
- **Decrypt 100 items:** <100ms (batched decryption)
- **Sync 50 changes:** <500ms (D1 batch operations)
- **Time to interactive:** <1.5s (Svelte 5 + Tailwind 4 optimization)
- **Argon2 computation:** 300-500ms (adaptive to device)
- **Build time:** 5-10x faster than v3 (Tailwind Oxide + Vite)

### Performance Monitoring

```javascript
// Privacy-preserving telemetry
export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    
    try {
      const response = await handleRequest(request, env);
      
      // Log performance metrics (no PII)
      ctx.waitUntil(
        env.ANALYTICS.writeDataPoint({
          blobs: ['vault_unlock'],
          doubles: [Date.now() - start],
          indexes: [env.ENVIRONMENT]
        })
      );
      
      return response;
    } catch (error) {
      ctx.waitUntil(logSanitizedError(error, env));
      throw error;
    }
  }
};
```

---

## Verification Plan

### Security Audit

**Network Inspection:**
- Verify no plaintext passwords or keys in network requests
- Use Burp Suite/Wireshark for deep inspection
- Verify all traffic is encrypted (HTTPS only)

**Cryptographic Validation:**
- Validate AES-256-GCM implementation against NIST test vectors
- Verify Argon2id parameters are sufficient (>500ms on average device)
- Test on range of devices (mobile, desktop, low-end)

**Side-Channel Testing:**
- Verify no plaintext in browser DevTools memory dumps
- Test for timing attacks on authentication
- Verify constant-time comparison for hash verification

**Penetration Testing:**
- Test rate limiting bypass attempts
- Test CAPTCHA implementation
- Test session hijacking scenarios
- Test XSS/CSP bypass attempts

### E2E Testing (Playwright)

**Authentication Flows:**
- Registration with zero-knowledge setup
- Login and vault unlock
- Password reset flow
- Password change (DEK re-encryption)
- Account lockout after failed attempts

**Encryption/Decryption:**
- Create vault item, verify encrypted in D1
- Unlock vault, verify decryption works
- Multi-device sync scenario
- Offline mode with IndexedDB

**Conflict Resolution:**
- Concurrent edits from multiple devices
- Network failure during sync
- Verify event sourcing/conflict UI

### Unit Tests (Vitest)

**Crypto Utilities:**
- Key derivation (AuthHash, KEK)
- DEK generation and wrapping
- AES-256-GCM encryption/decryption
- HMAC authentication tag generation

**Sync Engine:**
- Delta sync logic
- Debouncing and deduplication
- Batch preparation

### Performance Testing

**Benchmarks:**
- Vault unlock time with varying item counts (10, 100, 1000)
- Argon2 computation time across devices
- IndexedDB read/write performance
- D1 batch operation latency

**Chaos Testing:**
- Simulate network failures during sync
- Simulate Worker restart (D1 connection drops)
- Verify data integrity after failures
- Test concurrent access patterns

### Load Testing

- Simulate 100+ concurrent users
- Verify rate limiting works under load
- Test D1 connection pool limits
- Monitor Worker CPU/memory usage

---

## Implementation Phases

### Phase 1: Core Zero-Knowledge Auth & Vault (MVP)

**Must-Have:**
- [ ] Zero-knowledge registration/login with @noble/hashes
- [ ] Argon2id key derivation (client-side, adaptive parameters)
- [ ] AES-256-GCM encryption using @noble/ciphers
- [ ] Basic vault CRUD operations with Svelte 5 runes
- [ ] Rate limiting on auth endpoints (Cloudflare KV)
- [ ] Content Security Policy with Trusted Types
- [ ] IndexedDB offline storage with quota management
- [ ] Progressive vault loading (batched cursors)
- [ ] Composite database indexes for D1
- [ ] Tailwind CSS 4 with CSS-first configuration
- [ ] Vite build setup with @tailwindcss/vite plugin

**Deliverables:**
- Working auth system with zero-knowledge model
- Vault with password/API key storage
- D1 database with optimized schema and indexes
- Svelte 5 frontend with runes-based reactivity
- Tailwind 4 styling with @theme configuration
- Crypto worker for background key derivation

### Phase 2: Sync & Multi-Device

**Features:**
- [ ] Delta sync engine with D1 batch operations
- [ ] Device management and fingerprinting
- [ ] Conflict resolution (event sourcing with vector clocks)
- [ ] Optimistic UI updates with Svelte 5 runes
- [ ] Write batching and deduplication (5s debounce)
- [ ] Global read replication for D1
- [ ] Background sync with `waitUntil()`

**Deliverables:**
- Reliable multi-device sync with <500ms latency
- Conflict resolution UI with side-by-side comparison
- Device trust management dashboard
- Event sourcing audit trail

### Phase 3: Subscription Dashboard

**Features:**
- [ ] Subscription tracking (encrypted)
- [ ] Spending analytics & charts
- [ ] Renewal calendar view
- [ ] Notification system (client or server-side)

**Deliverables:**
- Full subscription management dashboard
- Analytics visualizations
- Renewal reminders

### Phase 4: Advanced Features

**Features:**
- [ ] Browser extension with autofill (Manifest V3)
- [ ] Encrypted search (blind indexing)
- [ ] Key rotation UI with background re-encryption
- [ ] Multi-factor authentication (TOTP + WebAuthn/Passkeys)
- [ ] Receipt attachments (R2 storage)
- [ ] Backup/export functionality (encrypted JSON)
- [ ] Emergency access with time-delayed key escrow
- [ ] Shared vaults with separate encryption keys

**Deliverables:**
- Browser extension (Chrome, Firefox, Edge) - Manifest V3
- Advanced search with client-side indexing
- MFA support (TOTP + biometric)
- Comprehensive backup/restore system
- Emergency access mechanism

---

## Security Best Practices

### Critical Rules

1. ✅ **Never log decrypted data** - Always sanitize logs
2. ✅ **Use different salts for AuthHash and KEK** - Prevents cryptographic reuse
3. ✅ **Constant-time comparisons** - Prevent timing attacks
4. ✅ **Clear sensitive data from memory** - Minimize plaintext lifetime
5. ✅ **Validate all inputs** - Both client and server-side
6. ✅ **Use CSP headers** - Prevent XSS attacks
7. ✅ **Implement rate limiting** - Prevent brute force
8. ✅ **Audit dependencies** - Regular security updates

### Monitoring & Telemetry (Privacy-Preserving)

**Anonymous Metrics:**
- Vault unlock time (percentiles)
- Number of items (bucketed: <10, 10-50, 50-100, 100+)
- Sync failures (count only)
- Error rates by endpoint

**Implementation:**
- Cloudflare Analytics Workers
- No PII collection
- Aggregate metrics only

---

## Future Enhancements

### Research Areas

1. **Encrypted Search:** Searchable Symmetric Encryption (SSE)
2. **Biometric Unlock:** WebAuthn integration
3. **Secure Sharing:** Shared vaults with separate encryption keys
4. **Emergency Access:** Time-delayed key escrow
5. **Audit Logs:** Encrypted access logs for security monitoring

### Scalability

1. **Durable Objects:** For real-time collaboration features
2. **R2 Storage:** For large attachments (receipts, documents)
3. **Queue System:** For background jobs (email reminders, analytics)

---

## Dependencies & Third-Party Libraries (2025 Updated)

### Frontend

```json
{
  "dependencies": {
    "svelte": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@noble/hashes": "^1.5.0",
    "@noble/ciphers": "^1.0.0",
    "idb": "^8.0.0",
    "zxcvbn-ts": "^3.0.0",
    "date-fns": "^3.0.0"
  }
}
```

- `svelte@5.x` - Framework with runes
- `tailwindcss@4.x` - Styling with Oxide engine
- `@noble/hashes` - Argon2id (audited, no WASM)
- `@noble/ciphers` - AES-256-GCM encryption
- `idb@8.x` - Modern IndexedDB wrapper
- `zxcvbn-ts@3.x` - Password strength (TypeScript)
- `date-fns@3.x` - Date utilities

### Backend

```json
{
  "dependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "hono": "^4.0.0"
  }
}
```

- `@cloudflare/workers-types@4.x` - TypeScript types
- `hono@4.x` - Lightweight router for Workers (recommended)

### Development

```json
{
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^5.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.48.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.6.0",
    "wrangler": "^3.80.0"
  }
}
```

- `@tailwindcss/vite@4.x` - Vite plugin for Tailwind 4
- `vite@5.x` - Build tool
- `vitest@2.x` - Unit testing
- `@playwright/test@1.48.x` - E2E + component testing
- `wrangler@3.80.x` - Cloudflare CLI

---

## Deployment Strategy (2025)

### Cloudflare Pages (Frontend)

```bash
# Build with Vite + Tailwind 4
npm run build

# Deploy via Git integration (automatic)
# Or manual deploy
wrangler pages deploy dist
```

- **Build:** Vite + @tailwindcss/vite plugin
- **Deploy:** Automatic via Git integration
- **Environment:** Production, Staging, Preview branches
- **Edge Rendering:** SSR with SvelteKit adapter

### Cloudflare Workers (Backend)

```bash
# Deploy to production
wrangler deploy

# Set secrets
wrangler secret put PEPPER
wrangler secret put D1_API_TOKEN

# Environment variables in wrangler.toml
[env.production]
vars = { ENVIRONMENT = "production" }

[env.staging]
vars = { ENVIRONMENT = "staging" }
```

- **Smart Placement:** Enabled by default
- **Durable Objects:** For real-time features (Phase 4)
- **KV Namespaces:** For rate limiting

### Cloudflare D1 (Database)

```bash
# Create database
wrangler d1 create password-manager-db

# Run migrations
wrangler d1 migrations apply password-manager-db --remote

# Enable read replication
# In wrangler.toml:
[[d1_databases]]
binding = "DB"
database_id = "..."
read_replication = { mode = "auto" }
```

- **Migrations:** Version-controlled SQL files in `drizzle/migrations`
- **Backup:** Automated D1 exports to R2 (daily)
- **Testing:** Local D1 instance with `wrangler dev --local`
- **Read Replication:** Auto mode for global distribution

---

## Cost Estimation (Cloudflare)

### Free Tier Limits

- **Workers:** 100k requests/day
- **D1:** 5 GB storage, 5M reads/day, 100k writes/day
- **Pages:** Unlimited requests, 500 builds/month

### Paid Tier (for scale)

- **Workers:** $5/month (10M requests)
- **D1:** $5/month (additional usage)
- **R2:** $0.015/GB storage

**Expected Costs (1000 users):**
- ~$10-20/month (Workers + D1)
- R2: Minimal unless heavy attachment usage

---

## Success Metrics (2025 Standards)

### Security

- [ ] Zero plaintext data in network logs (verified via Burp Suite)
- [ ] Zero cryptographic vulnerabilities (third-party audit passed)
- [ ] 100% CSP compliance with Trusted Types
- [ ] Constant-time comparison for all authentication operations
- [ ] Memory sanitization for all sensitive data
- [ ] Subresource integrity for all external resources

### Performance

- [ ] <300ms vault unlock time (target: 200ms on modern devices)
- [ ] <1.5s time to interactive (Lighthouse score >90)
- [ ] <500ms sync latency for 50 items
- [ ] <100ms to decrypt 100 items (batched)
- [ ] 5-10x faster builds than previous versions

### User Experience

- [ ] Offline mode works seamlessly with quota warnings
- [ ] Zero data loss during conflicts (event sourcing)
- [ ] Intuitive conflict resolution UI with side-by-side comparison
- [ ] Progressive loading with smooth scrolling
- [ ] Instant feedback with optimistic UI updates

### Reliability

- [ ] 99.9% uptime (Cloudflare SLA)
- [ ] Zero data corruption incidents
- [ ] Successful recovery from failures (automated rollback)
- [ ] Graceful degradation when features unavailable
- [ ] Automated daily backups to R2

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Browser crypto API unavailable** | Graceful degradation, error message |
| **IndexedDB quota exceeded** | Warn user, offer export/cleanup |
| **D1 write limits exceeded** | Implement write queue, retry logic |
| **Key derivation too slow on mobile** | Adjustable Argon2 parameters per device |
| **Sync conflict data loss** | Event sourcing, never delete events |
| **Master password forgotten** | Recovery codes (encrypted with separate key) |

---

## Conclusion

This comprehensive plan combines zero-knowledge security with modern web performance best practices. The architecture is designed for:

- **Maximum Security:** Client-side encryption, zero-knowledge model
- **High Performance:** Progressive loading, IndexedDB caching, edge computing
- **Excellent UX:** Offline-first, optimistic UI, fast sync
- **Scalability:** Cloudflare's global network, efficient database design

**Next Steps:**
1. Set up project structure (Svelte 5 + Vite)
2. Implement crypto utilities and test with vectors
3. Build authentication flow with zero-knowledge model
4. Create vault storage with D1 + IndexedDB
5. Implement sync engine and conflict resolution
6. Security audit and performance testing
7. Launch MVP (Phase 1)
