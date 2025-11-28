# Design: Secrets by Codavibe - Zero-Knowledge Password Manager

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Svelte 5 Frontend (secrets.codavibe.dev)             │ │
│  │  - Crypto Worker (Argon2id, AES-256-GCM)              │ │
│  │  - IndexedDB (Encrypted Cache)                        │ │
│  │  - Vault Store (Runes: $state, $derived, $effect)    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Edge                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Workers (API)                                         │ │
│  │  - Auth endpoints                                      │ │
│  │  - Vault CRUD                                          │ │
│  │  - Subscription CRUD                                   │ │
│  │  - Rate limiting (KV)                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  D1 Database (SQLite)                                  │ │
│  │  - users, services, credentials, subscriptions         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      GitHub                                  │
│  - Push to main → GitHub Actions → Deploy                   │
│  - Frontend → Cloudflare Pages                               │
│  - Backend → Cloudflare Workers                              │
└─────────────────────────────────────────────────────────────┘
```

## Zero-Knowledge Cryptography Design

### Key Derivation Flow

**Registration:**
```
Master Password (user input)
    ↓
Generate random AuthSalt (32 bytes)
Generate random KEKSalt (32 bytes)
    ↓
AuthHash = Argon2id(MasterPassword, AuthSalt, params)
KEK = Argon2id(MasterPassword, KEKSalt, params)
    ↓
Generate random DEK (32 bytes)
WrappedKey = AES-256-GCM.encrypt(DEK, KEK)
    ↓
Server: AuthVerifier = Hash(AuthHash + Pepper)
Store: AuthVerifier, AuthSalt, KEKSalt, WrappedKey
```

**Login:**
```
Master Password (user input)
    ↓
Fetch AuthSalt, KEKSalt from server
    ↓
AuthHash = Argon2id(MasterPassword, AuthSalt, params)
KEK = Argon2id(MasterPassword, KEKSalt, params)
    ↓
Send AuthHash to server
Server verifies: Hash(AuthHash + Pepper) === AuthVerifier
    ↓
If valid, return WrappedKey
    ↓
DEK = AES-256-GCM.decrypt(WrappedKey, KEK)
    ↓
Use DEK to encrypt/decrypt vault items
```

**Correctness Properties:**
- P1.1: Master password never transmitted to server
- P1.2: Server cannot derive DEK (missing KEKSalt knowledge)
- P1.3: AuthHash and KEK use different salts (no key reuse)
- P1.4: Changing master password only re-encrypts DEK, not entire vault
- P1.5: Pepper stored in Worker Secrets, never exposed to client

### Vault Item Encryption

**Encryption:**
```
Plaintext credential value
    ↓
Generate random IV (12 bytes)
    ↓
Ciphertext = AES-256-GCM.encrypt(Plaintext, DEK, IV)
AuthTag = HMAC(user_id || credential_id || Ciphertext, DEK-derived-key)
    ↓
Store: { encrypted_value, iv, auth_tag }
```

**Correctness Properties:**
- P2.1: Each credential uses unique IV (no IV reuse)
- P2.2: AuthTag prevents server-side tampering
- P2.3: AES-256-GCM provides authenticated encryption
- P2.4: Server stores only ciphertext, never plaintext

### Seed Phrase Recovery

**Generation:**
```
Registration
    ↓
Generate 256-bit entropy
    ↓
Convert to 24-word BIP39 mnemonic
    ↓
Display once, user must save
    ↓
Confirm by entering 3 random words
```

**Recovery:**
```
User enters 24-word seed phrase
    ↓
Derive recovery key from seed phrase
    ↓
Fetch WrappedKey from server
    ↓
Decrypt WrappedKey with recovery key → DEK
    ↓
User sets new master password
    ↓
Re-encrypt DEK with new KEK
```

**Correctness Properties:**
- P3.1: Seed phrase never stored on server
- P3.2: Seed phrase can recover DEK without master password
- P3.3: Recovery process re-encrypts DEK with new master password
- P3.4: User responsibility to save seed phrase (accept data loss)

## Database Schema Design

### Entity Relationship

```
users (1) ──────< (N) services (1) ──────< (N) credentials
  │
  └──────< (N) subscriptions
```

### Table: users

**Purpose:** Store user authentication data and encrypted DEK

**Correctness Properties:**
- P4.1: auth_verifier is Hash(AuthHash + Pepper), not AuthHash directly
- P4.2: auth_salt and kek_salt are different (no salt reuse)
- P4.3: wrapped_key is DEK encrypted with KEK
- P4.4: argon2_* params stored per-user for adaptive performance
- P4.5: failed_login_attempts and locked_until for account lockout

### Table: services

**Purpose:** Parent entity for hierarchical credential storage

**Correctness Properties:**
- P5.1: Service names not encrypted (searchable)
- P5.2: Soft delete with is_deleted flag (sync support)
- P5.3: Foreign key cascade deletes credentials when service deleted

### Table: credentials

**Purpose:** Store encrypted credential values under services

**Correctness Properties:**
- P6.1: encrypted_value is AES-256-GCM ciphertext
- P6.2: iv is unique per credential (12 bytes)
- P6.3: auth_tag is HMAC for tamper detection
- P6.4: display_order for user-defined sorting
- P6.5: type field supports multiple credential types
- P6.6: label field for user-friendly names (e.g., "Domains API")

### Table: subscriptions

**Purpose:** Track subscription data for analytics

**Correctness Properties:**
- P7.1: All fields stored in plaintext (not sensitive)
- P7.2: next_renewal as Unix timestamp for sorting
- P7.3: Support multiple currencies (USD, CAD, EUR)
- P7.4: Support custom billing cycles (days)
- P7.5: Trial status tracked separately

## API Design

### Authentication Endpoints

**POST /api/auth/register**

**Correctness Properties:**
- P8.1: Validate email format and uniqueness
- P8.2: Validate authHash length (32 bytes base64)
- P8.3: Store AuthVerifier = Hash(authHash + Pepper)
- P8.4: Generate session token (JWT or random)
- P8.5: Rate limit: 5 registrations per hour per IP

**POST /api/auth/login**

**Correctness Properties:**
- P9.1: Fetch user by email
- P9.2: Check account lockout (locked_until)
- P9.3: Verify AuthHash using constant-time comparison
- P9.4: Increment failed_login_attempts on failure
- P9.5: Lock account after 5 failed attempts (15 min lockout)
- P9.6: Return wrappedKey, kekSalt, argon2Params on success
- P9.7: Rate limit: 5 attempts per 15 min per IP

### Vault Endpoints

**GET /api/vault/services**

**Correctness Properties:**
- P10.1: Require valid session token
- P10.2: Return only user's services (user_id filter)
- P10.3: Exclude soft-deleted services (is_deleted = 0)
- P10.4: Order by updated_at DESC

**GET /api/vault/credentials?serviceId=<id>**

**Correctness Properties:**
- P11.1: Require valid session token
- P11.2: Verify service belongs to user
- P11.3: Return credentials ordered by display_order
- P11.4: Include encrypted_value, iv, auth_tag for client-side decryption

**POST /api/vault/credentials**

**Correctness Properties:**
- P12.1: Require valid session token
- P12.2: Verify service belongs to user
- P12.3: Validate credential type (enum)
- P12.4: Validate encrypted_value, iv, auth_tag presence
- P12.5: Set updated_at to current timestamp

### Subscription Endpoints

**GET /api/subscriptions**

**Correctness Properties:**
- P13.1: Require valid session token
- P13.2: Return only user's subscriptions
- P13.3: Exclude soft-deleted subscriptions
- P13.4: Order by next_renewal ASC

**POST /api/subscriptions**

**Correctness Properties:**
- P14.1: Require valid session token
- P14.2: Validate cost > 0
- P14.3: Validate currency (USD, CAD, EUR)
- P14.4: Validate billing_cycle (monthly, yearly, custom)
- P14.5: If custom, require custom_cycle_days > 0

## Frontend Design (Svelte 5)

### State Management (Runes)

**auth.svelte.ts:**

**Correctness Properties:**
- P15.1: isAuthenticated derived from sessionToken presence
- P15.2: dek cleared on logout or timeout
- P15.3: Auto-lock after 15 min inactivity ($effect cleanup)
- P15.4: Session token stored in memory only (not localStorage)

**vault.svelte.ts:**

**Correctness Properties:**
- P16.1: services and credentials loaded from IndexedDB on mount
- P16.2: Optimistic updates with rollback on API error
- P16.3: Decryption happens on-demand (not all at once)
- P16.4: LRU cache for decrypted values (max 50 items)

**subscriptions.svelte.ts:**

**Correctness Properties:**
- P17.1: Calculate monthly spending from all subscriptions
- P17.2: Calculate yearly spending (monthly * 12 + yearly)
- P17.3: Filter upcoming renewals (next 30 days)
- P17.4: Sort by next_renewal for calendar view

### Crypto Worker Design

**Purpose:** Offload heavy Argon2id computation to prevent UI blocking

**Correctness Properties:**
- P18.1: Worker pre-warmed on app load
- P18.2: Argon2id params adaptive (300-500ms target)
- P18.3: KEK cached in worker memory during session
- P18.4: Memory sanitization on lock (overwrite with random data)
- P18.5: Use SharedArrayBuffer if available (crossOriginIsolated)

### IndexedDB Design

**Stores:**
- `services` - Cached services (plaintext names)
- `credentials` - Cached encrypted credentials
- `subscriptions` - Cached subscriptions
- `metadata` - Last sync timestamp, preferences

**Correctness Properties:**
- P19.1: Credentials stored encrypted (same as server)
- P19.2: Quota monitoring (warn at 80% usage)
- P19.3: Structured cloning for large objects
- P19.4: Batched cursor reads (20 items at a time)

## Security Design

### Content Security Policy

**Correctness Properties:**
- P20.1: script-src 'self' (no inline scripts)
- P20.2: style-src 'self' (Tailwind 4 no unsafe-inline needed)
- P20.3: connect-src 'self' (API calls only to own domain)
- P20.4: require-trusted-types-for 'script' (prevent DOM XSS)
- P20.5: frame-ancestors 'none' (prevent clickjacking)

### Rate Limiting (Cloudflare KV)

**Correctness Properties:**
- P21.1: Key format: `rate_limit:{ip}`
- P21.2: TTL: 900 seconds (15 minutes)
- P21.3: Limit: 5 requests per window
- P21.4: Atomic increment (no race conditions)
- P21.5: Return remaining attempts in response

### Account Lockout (D1)

**Correctness Properties:**
- P22.1: Increment failed_login_attempts on each failure
- P22.2: Set locked_until = now + 15 min after 5 failures
- P22.3: Reset failed_login_attempts on successful login
- P22.4: Check locked_until before auth verification

## UI/UX Design

### Color Palette (Tailwind CSS 4)

**Dark Theme:**
- Background: `#1b1b1b` (soft dark gray)
- Surface: `#2d2d2d` (cards, panels)
- Border: `#3a3a3a` (subtle borders)
- Text Primary: `rgba(255, 255, 255, 0.87)`
- Text Secondary: `rgba(255, 255, 255, 0.60)`
- Accent Primary: `#BB86FC` (purple - buttons, links)
- Accent Secondary: `#00FFFF` (cyan - highlights, charts)

**Correctness Properties:**
- P23.1: Avoid pure black (#000000) - use soft grays
- P23.2: Desaturated accent colors (reduce eye strain)
- P23.3: 87%/60%/38% white opacity for text hierarchy
- P23.4: WCAG AA contrast ratio compliance

### Component Hierarchy

```
App
├── Auth
│   ├── Register (with seed phrase display)
│   ├── Login
│   └── Recovery (seed phrase input)
├── Vault
│   ├── ServiceList
│   ├── ServiceDetail
│   │   ├── CredentialList
│   │   └── AddCredential
│   └── Search
└── Dashboard
    ├── SpendingOverview
    ├── UpcomingRenewals
    ├── SpendingTrends (line chart)
    └── CostBreakdown (pie chart)
```

## Deployment Design

### GitHub Actions Workflow

**Frontend Deploy:**

**Correctness Properties:**
- P24.1: Trigger on push to main (paths: frontend/**)
- P24.2: Install dependencies with pnpm
- P24.3: Build with Vite
- P24.4: Deploy to Cloudflare Pages
- P24.5: Preview deployments for PRs

**Backend Deploy:**

**Correctness Properties:**
- P25.1: Trigger on push to main (paths: backend/**, migrations/**)
- P25.2: Run D1 migrations before Worker deploy
- P25.3: Deploy Worker with wrangler
- P25.4: Set environment variables from GitHub Secrets

### Cloudflare Configuration

**wrangler.toml:**

**Correctness Properties:**
- P26.1: D1 binding configured with database_id
- P26.2: KV binding configured for rate limiting
- P26.3: Secrets configured (PEPPER)
- P26.4: Smart Placement enabled (default)
- P26.5: Compatibility date set to 2025-11-22

## Performance Design

### Optimization Strategies

**Frontend:**
- Progressive vault loading (20 items at a time)
- Lazy route loading (dynamic imports)
- Crypto worker pre-warming
- IndexedDB caching
- Svelte 5 fine-grained reactivity

**Backend:**
- D1 batch operations (up to 100 statements)
- Global read replication (auto mode)
- Edge caching for static assets
- Connection pooling (singleton pattern)

**Correctness Properties:**
- P27.1: Vault unlock <300ms (target: 200ms)
- P27.2: Time to interactive <1.5s
- P27.3: Argon2 computation 300-500ms (adaptive)
- P27.4: API response <100ms (Workers + D1)

## Testing Design

### Unit Tests (Vitest)

**Crypto utilities:**
- Test Argon2id with known test vectors
- Test AES-256-GCM encryption/decryption
- Test seed phrase generation (24 words)
- Test HMAC authentication

**API handlers:**
- Test auth endpoints (register, login, logout)
- Test vault CRUD operations
- Test subscription CRUD operations
- Test rate limiting logic

### E2E Tests (Playwright)

**Critical flows:**
1. Registration with seed phrase backup
2. Login and vault unlock
3. Add service with multiple credentials
4. Add subscription and view dashboard
5. Lock/unlock vault
6. Account recovery with seed phrase

**Correctness Properties:**
- P28.1: No plaintext in network requests (verified)
- P28.2: Encrypted data in D1 (verified)
- P28.3: Session timeout works (verified)
- P28.4: Rate limiting works (verified)

## References

- Full implementation details: #[[file:ALLTOGETHER.md]]
- Requirements: #[[file:requirements.md]]
