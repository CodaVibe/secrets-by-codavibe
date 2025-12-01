# Tasks: Secrets by Codavibe - Zero-Knowledge Password Manager

## 🤖 Autonomous Development Mode

**This project is designed for 95% autonomous execution by AI agents.**

### Required Credentials (stored in SOCRAM.md)

All API keys and tokens required for autonomous development are stored in `SOCRAM.md` at the project root. Any Kiro instance working on this project should read credentials from that file.

**Required credentials:**
1. **GITHUB_TOKEN** - GitHub Personal Access Token with `repo` scope
2. **CLOUDFLARE_API_TOKEN** - Cloudflare API Token with D1, KV, Workers, Pages edit permissions
3. **CLOUDFLARE_ACCOUNT_ID** - Cloudflare Account ID

### Autonomous Capabilities

**✅ Fully Autonomous (95% of tasks):**
- GitHub repository creation and management (`gh` CLI)
- Cloudflare D1 database creation and migrations (`wrangler` CLI)
- Cloudflare KV namespace creation (`wrangler` CLI)
- Secret management (GitHub Secrets, Cloudflare Worker Secrets)
- Complete backend implementation (TypeScript, Hono, D1)
- Complete frontend implementation (Svelte 5, Tailwind CSS 4)
- Crypto utilities (@noble/hashes, @noble/ciphers)
- Unit testing (Vitest)
- E2E testing (Playwright, headless)
- Deployment via GitHub Actions
- Documentation generation

**⚠️ Requires Manual Intervention (5% of tasks):**
- DNS CNAME record configuration (Cloudflare Dashboard)
- Manual user acceptance testing
- Burp Suite GUI testing (can do programmatic security checks instead)

### CLI Tools Available

```bash
# GitHub CLI (authenticated via GITHUB_TOKEN)
gh auth login --with-token < SOCRAM.md
gh repo create secrets-by-codavibe --public --source=. --push
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID

# Wrangler CLI (authenticated via CLOUDFLARE_API_TOKEN)
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
wrangler d1 create secrets-db
wrangler d1 migrations apply secrets-db --remote
wrangler kv:namespace create RATE_LIMIT
wrangler secret put PEPPER
wrangler deploy

# Package Manager
pnpm install
pnpm add <package>
pnpm test
pnpm build
```

### Execution Instructions for AI Agents

1. **Read credentials from SOCRAM.md** at project root
2. **Authenticate CLI tools** using credentials
3. **Execute tasks sequentially** following the phase order
4. **Validate each task** using acceptance criteria
5. **Run tests** after each implementation phase
6. **Document progress** in task checkboxes
7. **Flag manual steps** for human intervention

### Task Status Tracking

Each task below has:
- [ ] Checkbox for completion tracking
- **Acceptance criteria** for validation
- **Validates:** Links to correctness properties (P#.#) and acceptance criteria (AC#.#)
- **Autonomous:** Yes/No indicator

---

## Phase 1: Project Setup & Infrastructure

### T1.1: Initialize GitHub Repository
- [ ] Complete task




**Autonomous:** ✅ Yes

**Steps:**
1. Read GITHUB_TOKEN from SOCRAM.md
2. Authenticate: `echo $GITHUB_TOKEN | gh auth login --with-token`
3. Create directory structure: frontend/, backend/, migrations/, .github/workflows/
4. Create README.md with project overview
5. Create .gitignore (node_modules, .env, dist, build, wrangler.toml secrets)
6. Initialize git: `git init && git add . && git commit -m "Initial commit"`
7. Create GitHub repo: `gh repo create secrets-by-codavibe --public --source=. --push`
8. Verify: `gh repo view secrets-by-codavibe`

**Acceptance:** Repository created at github.com/codavibe/secrets-by-codavibe with proper structure

**CLI Commands:**
```bash
# Read token from SOCRAM.md and authenticate
export GITHUB_TOKEN=$(grep "GITHUB_TOKEN" SOCRAM.md | cut -d'=' -f2)
echo $GITHUB_TOKEN | gh auth login --with-token

# Create and push repository
gh repo create secrets-by-codavibe --public --source=. --push
```

---

### T1.2: Set Up Cloudflare D1 Database
- [x] Complete task

**Autonomous:** ✅ Yes

**Steps:**
1. Read CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from SOCRAM.md
2. Set environment variables for wrangler
3. Create D1 database: `wrangler d1 create secrets-db`
4. Extract database_id from output
5. Create backend/wrangler.toml with D1 binding
6. Create migrations/0001_initial.sql (users table with indexes)
7. Create migrations/0002_vault.sql (services, credentials tables with indexes)
8. Create migrations/0003_subscriptions.sql (subscriptions table with indexes)
9. Apply migrations: `wrangler d1 migrations apply secrets-db --remote`
10. Verify: `wrangler d1 execute secrets-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`

**Acceptance:** D1 database created with all tables and indexes, migrations applied successfully

**Validates:** P4.1-P4.5, P5.1-P5.3, P6.1-P6.6, P7.1-P7.5

**CLI Commands:**
```bash
# Authenticate wrangler
export CLOUDFLARE_API_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" SOCRAM.md | cut -d'=' -f2)
export CLOUDFLARE_ACCOUNT_ID=$(grep "CLOUDFLARE_ACCOUNT_ID" SOCRAM.md | cut -d'=' -f2)

# Create D1 database
wrangler d1 create secrets-db

# Apply migrations
cd backend
wrangler d1 migrations apply secrets-db --remote
```

---

### T1.3: Set Up Cloudflare KV Namespace
- [x] Complete task

**Autonomous:** ✅ Yes

**Steps:**
1. Create KV namespace: `wrangler kv:namespace create RATE_LIMIT`
2. Extract namespace_id from output
3. Add KV binding to backend/wrangler.toml
4. Verify: `wrangler kv:namespace list`

**Acceptance:** KV namespace created and configured in wrangler.toml

**Validates:** P21.1-P21.5

**CLI Commands:**
```bash
# Create KV namespace
cd backend
wrangler kv:namespace create RATE_LIMIT

# Output will show:
# Add the following to your wrangler.toml:
# [[kv_namespaces]]
# binding = "RATE_LIMIT"
# id = "xxxxx"
```

---

### T1.4: Configure Cloudflare Secrets
- [x] Complete task

**Autonomous:** ✅ Yes

**Steps:**
1. Generate random Pepper value: `openssl rand -base64 32`
2. Set secret: `echo "<pepper-value>" | wrangler secret put PEPPER`
3. Create docs/secrets.md documenting secret management
4. Verify: Secret stored in Cloudflare Worker

**Acceptance:** Pepper secret configured in Worker, documented

**Validates:** P1.5

**CLI Commands:**
```bash
# Generate and set Pepper secret
cd backend
PEPPER=$(openssl rand -base64 32)
echo $PEPPER | wrangler secret put PEPPER

# Verify (will show secret exists but not value)
wrangler secret list
```

---

### T1.5: Set Up GitHub Secrets
- [x] Complete task

**Autonomous:** ✅ Yes

**Steps:**
1. Read credentials from SOCRAM.md
2. Set GitHub secret: `gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN"`
3. Set GitHub secret: `gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID"`
4. Verify: `gh secret list`
5. Create docs/deployment.md documenting CI/CD setup

**Acceptance:** GitHub Secrets configured for CI/CD, documented

**CLI Commands:**
```bash
# Read from SOCRAM.md and set GitHub secrets
export CLOUDFLARE_API_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" SOCRAM.md | cut -d'=' -f2)
export CLOUDFLARE_ACCOUNT_ID=$(grep "CLOUDFLARE_ACCOUNT_ID" SOCRAM.md | cut -d'=' -f2)

gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID"

# Verify
gh secret list
```

---

### T1.6: Create GitHub Actions Workflows
- [x] Complete task

**Autonomous:** ✅ Yes

**Steps:**
1. Create .github/workflows/deploy-frontend.yml (from ALLTOGETHER.md spec)
2. Create .github/workflows/deploy-backend.yml (from ALLTOGETHER.md spec)
3. Configure triggers: push to main, paths filter (frontend/**, backend/**)
4. Commit and push workflows
5. Monitor first workflow run: `gh run watch`
6. Verify deployment success

**Acceptance:** Workflows created, committed, and successfully deploy on push to main

**Validates:** P24.1-P24.5, P25.1-P25.4

**CLI Commands:**
```bash
# Create workflow files (content from ALLTOGETHER.md)
mkdir -p .github/workflows
# (Create deploy-frontend.yml and deploy-backend.yml)

# Commit and push
git add .github/workflows/
git commit -m "Add GitHub Actions workflows"
git push origin main

# Watch workflow execution
gh run watch
```

---

## Phase 2: Backend - Authentication System

### T2.1: Set Up Backend Project
- [x] Complete task

**Steps:**
1. Initialize backend/ with pnpm
2. Install dependencies: hono, @cloudflare/workers-types
3. Install dev dependencies: wrangler, vitest, typescript
4. Create tsconfig.json
5. Create wrangler.toml with D1 and KV bindings
6. Set up basic Hono app structure

**Acceptance:** Backend project initialized with dependencies

---

### T2.2: Implement Rate Limiting Middleware
- [x] Complete task

**Steps:**
1. Create src/middleware/rateLimit.ts
2. Implement checkRateLimit function using KV
3. Add rate limit headers to response
4. Write unit tests for rate limiting logic

**Acceptance:** Rate limiting middleware functional and tested

**Validates:** P21.1-P21.5, AC1.7

---

### T2.3: Implement Security Headers Middleware
- [x] Complete task

**Steps:**
1. Create src/middleware/securityHeaders.ts
2. Add CSP header with Trusted Types
3. Add X-Frame-Options, X-Content-Type-Options, etc.
4. Write unit tests

**Acceptance:** Security headers applied to all responses

**Validates:** P20.1-P20.5, AC6.1, AC6.2

---

### T2.4: Implement POST /api/auth/register
- [x] Complete task

**Steps:**
1. Create src/routes/auth.ts
2. Validate request body (email, authHash, authSalt, kekSalt, wrappedKey)
3. Check email uniqueness
4. Generate userId (UUID)
5. Hash AuthHash with Pepper → AuthVerifier
6. Insert user into D1
7. Generate session token
8. Write unit tests

**Acceptance:** Registration endpoint functional and tested

**Validates:** P8.1-P8.5, AC1.1, AC1.2

---

### T2.5: Implement POST /api/auth/login
- [x] Complete task

**Steps:**
1. Fetch user by email
2. Check account lockout (locked_until)
3. Verify AuthHash with constant-time comparison
4. Increment failed_login_attempts on failure
5. Lock account after 5 failures
6. Reset failed_login_attempts on success
7. Return wrappedKey, kekSalt, argon2Params, sessionToken
8. Write unit tests

**Acceptance:** Login endpoint functional and tested

**Validates:** P9.1-P9.7, AC1.4, AC1.7

---

### T2.6: Implement POST /api/auth/logout
- [x] Complete task

**Steps:**
1. Invalidate session token
2. Write unit tests

**Acceptance:** Logout endpoint functional and tested

---

### T2.7: Implement Session Middleware
- [x] Complete task

**Steps:**
1. Create src/middleware/auth.ts
2. Verify session token
3. Attach userId to request context
4. Return 401 if invalid
5. Write unit tests

**Acceptance:** Session middleware protects authenticated routes

---

## Phase 3: Backend - Vault API

### T3.1: Implement GET /api/vault/services
- [x] Complete task

**Steps:**
1. Require authentication
2. Query services by user_id where is_deleted = 0
3. Order by updated_at DESC
4. Write unit tests

**Acceptance:** Services endpoint functional and tested

**Validates:** P10.1-P10.4, AC2.1

---

### T3.2: Implement POST /api/vault/services
- [x] Complete task

**Steps:**
1. Require authentication
2. Validate service name
3. Generate serviceId (UUID)
4. Insert into D1
5. Write unit tests

**Acceptance:** Create service endpoint functional and tested

**Validates:** AC2.1

---

### T3.3: Implement DELETE /api/vault/services/:id
- [x] Complete task

**Steps:**
1. Require authentication
2. Verify service belongs to user
3. Soft delete (set is_deleted = 1)
4. Cascade soft delete credentials
5. Write unit tests

**Acceptance:** Delete service endpoint functional and tested

**Validates:** AC2.9, P5.2

---

### T3.4: Implement GET /api/vault/credentials
- [x] Complete task

**Steps:**
1. Require authentication
2. Query by serviceId
3. Verify service belongs to user
4. Order by display_order
5. Write unit tests

**Acceptance:** Get credentials endpoint functional and tested

**Validates:** P11.1-P11.4, AC2.3

---

### T3.5: Implement POST /api/vault/credentials
- [x] Complete task

**Steps:**
1. Require authentication
2. Validate request body
3. Verify service belongs to user
4. Generate credentialId (UUID)
5. Insert into D1
6. Write unit tests

**Acceptance:** Create credential endpoint functional and tested

**Validates:** P12.1-P12.5, AC2.3, AC2.4

---

### T3.6: Implement PUT /api/vault/credentials/:id
- [x] Complete task

**Steps:**
1. Require authentication
2. Verify credential belongs to user
3. Update fields (label, encryptedValue, iv, authTag, displayOrder)
4. Set updated_at
5. Write unit tests

**Acceptance:** Update credential endpoint functional and tested

**Validates:** AC2.5

---

### T3.7: Implement DELETE /api/vault/credentials/:id
- [x] Complete task

**Steps:**
1. Require authentication
2. Verify credential belongs to user
3. Soft delete (set is_deleted = 1)
4. Write unit tests

**Acceptance:** Delete credential endpoint functional and tested

**Validates:** AC2.9

---

## Phase 4: Backend - Subscriptions API

### T4.1: Implement GET /api/subscriptions
- [x] Complete task

**Steps:**
1. Require authentication
2. Query by user_id where is_deleted = 0
3. Order by next_renewal ASC
4. Write unit tests

**Acceptance:** Get subscriptions endpoint functional and tested

**Validates:** P13.1-P13.4, AC3.1

---

### T4.2: Implement POST /api/subscriptions
- [x] Complete task

**Steps:**
1. Require authentication
2. Validate request body
3. Validate cost > 0
4. Validate currency (USD, CAD, EUR)
5. Validate billing_cycle
6. Generate subscriptionId (UUID)
7. Insert into D1
8. Write unit tests

**Acceptance:** Create subscription endpoint functional and tested

**Validates:** P14.1-P14.5, AC3.1, AC3.2, AC3.3

---

### T4.3: Implement PUT /api/subscriptions/:id
- [x] Complete task

**Steps:**
1. Require authentication
2. Verify subscription belongs to user
3. Update fields
4. Set updated_at
5. Write unit tests

**Acceptance:** Update subscription endpoint functional and tested

---

### T4.4: Implement DELETE /api/subscriptions/:id
- [x] Complete task

**Steps:**
1. Require authentication
2. Verify subscription belongs to user
3. Soft delete (set is_deleted = 1)
4. Write unit tests

**Acceptance:** Delete subscription endpoint functional and tested

---

## Phase 5: Frontend - Project Setup

### T5.1: Initialize Frontend Project
- [x] Complete task

**Steps:**
1. Initialize frontend/ with pnpm
2. Install Svelte 5, Vite, @sveltejs/vite-plugin-svelte
3. Install Tailwind CSS 4, @tailwindcss/vite
4. Install @noble/hashes, @noble/ciphers, idb, date-fns
5. Install dev dependencies: vitest, @playwright/test, typescript
6. Create vite.config.ts
7. Create svelte.config.js
8. Create tsconfig.json

**Acceptance:** Frontend project initialized with dependencies

**Implementation Notes (November 2025):**
- Svelte 5.45.2 with runes mode enabled ($state, $props, $derived)
- Vite 6.4.1 with @sveltejs/vite-plugin-svelte 5.1.1
- Tailwind CSS 4.1.17 with @tailwindcss/vite plugin (CSS-first config via @theme)
- @noble/ciphers 2.0.1, @noble/hashes 2.0.1 (audited crypto libraries)
- idb 8.0.3 (IndexedDB wrapper)
- date-fns 4.1.0 (with timezone support)
- Vitest 4.0.14, Playwright 1.57.0, TypeScript 5.9.3

---

### T5.2: Configure Tailwind CSS 4
- [x] Complete task

**Steps:**
1. Create app.css with @theme variables
2. Define color palette (background, surface, border, text, accents)
3. Import in +layout.svelte
4. Test dark theme rendering

**Acceptance:** Tailwind CSS 4 configured with dark theme

**Validates:** P23.1-P23.4

**Implementation Notes (November 2025):**
- Used Tailwind CSS 4's CSS-first configuration with `@theme inline` directive
- Implemented `@custom-variant dark (&:where(.dark, .dark *))` for class-based dark mode toggling
- Used modern `oklch()` color format for perceptually uniform colors
- CSS variables in `:root` and `.dark` selectors enable runtime theme switching
- Added theme toggle demo in App.svelte with localStorage persistence
- Build verified successful with Vite 6.4.1

---

### T5.3: Set Up Routing Structure
- [x] Complete task

**Steps:**
1. Create src/routes/+layout.svelte
2. Create src/routes/+page.svelte (landing/login)
3. Create src/routes/register/+page.svelte
4. Create src/routes/vault/+page.svelte
5. Create src/routes/dashboard/+page.svelte
6. Test navigation

**Acceptance:** Routing structure functional

**Implementation Notes (November 2025):**
- Migrated from plain Vite + Svelte to SvelteKit 2.49.0 for file-based routing
- Using @sveltejs/adapter-static 3.0.10 with SPA mode (fallback: 'index.html')
- Created +layout.svelte with global navigation, dark mode toggle, and CSS import
- Created +layout.ts with `prerender = true` and `ssr = false` for SPA mode
- Created +page.svelte (login), register/+page.svelte, vault/+page.svelte, dashboard/+page.svelte
- All pages use Svelte 5 runes ($state, $derived, $effect, $props)
- Build output to `build/` directory for Cloudflare Pages deployment

---

## Phase 6: Frontend - Crypto Utilities

### T6.1: Implement Argon2id Key Derivation
- [x] Complete task

**Steps:**
1. Create src/lib/crypto/argon2.ts
2. Implement deriveAuthHash function
3. Implement deriveKEK function
4. Use @noble/hashes/argon2
5. Write unit tests with known test vectors

**Acceptance:** Argon2id key derivation functional and tested

**Validates:** P1.1-P1.5, AC1.4

**Implementation Notes (November 2025):**
- Using @noble/hashes 2.0.0 (audited, minimal crypto library)
- Implemented deriveAuthHash (t:2, m:64MB) and deriveKEK (t:3, m:128MB)
- Both sync and async versions with progress callbacks
- Separate salts for AuthHash and KEK (domain separation)
- OWASP-compliant parameters for password hashing
- 20 unit tests passing (using reduced params for test speed)

---

### T6.2: Implement AES-256-GCM Encryption
- [x] Complete task

**Steps:**
1. Create src/lib/crypto/aes.ts
2. Implement encrypt function (plaintext, key) → { ciphertext, iv }
3. Implement decrypt function (ciphertext, key, iv) → plaintext
4. Use @noble/ciphers
5. Write unit tests with known test vectors

**Acceptance:** AES-256-GCM encryption functional and tested

**Validates:** P2.1-P2.4, AC2.8

**Implementation Notes (November 2025):**
- Using @noble/ciphers 2.0.0 (audited, minimal crypto library)
- AES-256-GCM with 12-byte nonce (96-bit, recommended for GCM)
- 128-bit authentication tag included in ciphertext
- Implemented encrypt/decrypt with string and binary support
- Hex encoding/decoding utilities for storage
- Key wrapping functions (wrapKey/unwrapKey) for KEK→DEK hierarchy
- Additional Authenticated Data (AAD) support
- NIST test vectors validated
- 29 unit tests passing

---

### T6.3: Implement Seed Phrase Generation
- [x] Complete task

**Steps:**
1. Create src/lib/crypto/seed-phrase.ts
2. Implement generateSeedPhrase function (24 words)
3. Implement validateSeedPhrase function
4. Implement deriveDEKFromSeedPhrase function
5. Use BIP39 wordlist
6. Write unit tests

**Acceptance:** Seed phrase generation functional and tested

**Validates:** P3.1-P3.4, AC1.2, AC1.3

**Implementation Notes (November 2025):**
- Using @scure/bip39 2.0.1 (audited, minimal BIP39 implementation from Paul Miller)
- Same author as @noble/hashes and @noble/ciphers - consistent security standards
- 256-bit entropy for 24-word phrases (maximum security)
- BIP39 standard English wordlist (2048 words)
- PBKDF2-HMAC-SHA512 for seed derivation (2048 iterations per BIP39 spec)
- HKDF with SHA-256 for domain-separated key derivation
- Includes: generateSeedPhrase, validateSeedPhrase, validateSeedPhraseStrict, deriveDEKFromSeedPhrase
- Helper functions: getConfirmationIndices, verifyConfirmation, getWordSuggestions
- 56 unit tests passing

---

### T6.4: Implement Crypto Worker
- [x] Complete task

**Steps:**
1. Create src/lib/crypto/worker.ts
2. Offload Argon2id computation to Web Worker
3. Implement pre-warming on app load
4. Cache KEK in worker memory
5. Implement memory sanitization on lock
6. Write unit tests

**Acceptance:** Crypto worker functional and tested

**Validates:** P18.1-P18.5, AC6.5

**Implementation Notes (November 2025):**
- Using Vite's `?worker` import syntax for Web Worker bundling
- CryptoWorkerManager class provides promise-based API for worker communication
- Worker script (crypto.worker.ts) handles Argon2id derivation off main thread
- P18.1: preWarmCryptoWorker() function for early initialization
- P18.2: Argon2id params configurable (AUTH: t:2/m:64MB, KEK: t:3/m:128MB)
- P18.3: KEK cached in worker memory via cacheKEK(), never returned to main thread
- P18.4: sanitizeMemory() overwrites cached keys with random data 3x then zeros
- P18.5: SharedArrayBuffer detection via crossOriginIsolated check
- Key wrapping/unwrapping using AES-256-GCM in worker
- Singleton pattern with getCryptoWorker() for app-wide use
- lockVault() sanitizes memory and terminates worker for complete cleanup
- 20 unit tests passing (mocked worker for jsdom environment)

---

### T6.5: Implement HMAC Authentication
- [x] Complete task

**Steps:**
1. Create src/lib/crypto/hmac.ts
2. Implement generateAuthTag function
3. Implement verifyAuthTag function
4. Use @noble/hashes
5. Write unit tests

**Acceptance:** HMAC authentication functional and tested

**Validates:** P2.2

**Implementation Notes (November 2025):**
- Using @noble/hashes 2.0.0 (audited, minimal crypto library)
- HMAC-SHA256 with 256-bit output (32 bytes)
- Constant-time comparison (constantTimeEqual) prevents timing attacks
- Streaming API support via createHmac() for large messages
- Domain separation with signWithContext/verifyWithContext
- Timestamped auth tags with expiration checking
- RFC 4231 test vectors validated
- 53 unit tests passing

---

## Phase 7: Frontend - State Management

### T7.1: Implement Auth Store (Svelte 5 Runes)
- [x] Complete task

**Steps:**
1. Create src/lib/stores/auth.svelte.ts
2. Define $state: isAuthenticated, userId, sessionToken, dek
3. Define $derived: isLocked
4. Implement auto-lock after 15 min ($effect)
5. Implement login, logout, lock functions
6. Write unit tests

**Acceptance:** Auth store functional and tested

**Validates:** P15.1-P15.4, AC1.6

**Implementation Notes (November 2025):**
- Using Svelte 5.37.0 with class-based $state runes pattern
- AuthStore class with reactive $state fields for isAuthenticated, userId, sessionToken, dek, email, lastActivityAt
- Getter-based derived state (isLocked, hasSession, canDecrypt) for test compatibility
- Auto-lock timer (15 minutes) with resetAutoLockTimer() on activity
- login(), logout(), lock(), unlock() methods for state transitions
- getDEK(), getSessionToken() with validation and activity recording
- Memory sanitization via lockVault() on logout/lock
- 28 unit tests passing

---

### T7.2: Implement Vault Store (Svelte 5 Runes)
- [x] Complete task

**Steps:**
1. Create src/lib/stores/vault.svelte.ts
2. Define $state: services, credentials, isLoading
3. Define $derived: serviceCount, credentialCount
4. Implement CRUD functions
5. Implement optimistic updates with rollback
6. Write unit tests

**Acceptance:** Vault store functional and tested

**Validates:** P16.1-P16.4

**Implementation Notes (November 2025):**
- Using Svelte 5.37.0 with class-based $state runes pattern
- VaultStore class with reactive $state fields for services, credentials, isLoading, error, selectedServiceId
- Getter-based derived state (serviceCount, credentialCount, selectedService, selectedServiceCredentials)
- Full CRUD operations for services and credentials
- Optimistic updates with saveSnapshot(), rollback(), commit() pattern
- Credential reordering with reorderCredentials()
- Search functionality with searchServices()
- 46 unit tests passing

---

### T7.3: Implement Subscriptions Store (Svelte 5 Runes)
- [x] Complete task

**Steps:**
1. Create src/lib/stores/subscriptions.svelte.ts
2. Define $state: subscriptions, isLoading
3. Define $derived: monthlySpending, yearlySpending, upcomingRenewals
4. Implement CRUD functions
5. Write unit tests

**Acceptance:** Subscriptions store functional and tested

**Validates:** P17.1-P17.4, AC3.5, AC3.6, AC3.7

**Implementation Notes (November 2025):**
- Using Svelte 5.37.0 with class-based $state runes pattern
- SubscriptionsStore class with reactive $state fields for subscriptions, isLoading, error
- Getter-based derived state (subscriptionCount, totalMonthlySpending, totalYearlySpending, upcomingRenewals, subscriptionsByRenewal, trialSubscriptions, expiringTrials, monthlySpendingByCurrency)
- P17.1: Monthly spending calculation (monthly: cost, yearly: cost/12, custom: cost/days*30)
- P17.2: Yearly spending calculation (monthly: cost*12, yearly: cost, custom: cost/days*365)
- P17.3: Upcoming renewals filter (next 30 days, sorted by date)
- P17.4: Subscriptions sorted by next_renewal for calendar view
- Full CRUD operations with optimistic updates (saveSnapshot, rollback, commit)
- Search by service name, filter by billing cycle and currency
- Trial subscription tracking with expiring trials detection (within 7 days)
- Helper methods: getDaysUntilRenewal, getDaysUntilTrialEnds
- 45 unit tests passing

---

## Phase 8: Frontend - IndexedDB

### T8.1: Implement IndexedDB Schema
- [x] Complete task

**Steps:**
1. Create src/lib/db/indexeddb.ts
2. Define stores: services, credentials, subscriptions, metadata
3. Implement openDB function
4. Implement quota monitoring
5. Write unit tests

**Acceptance:** IndexedDB schema functional and tested

**Validates:** P19.1-P19.4, AC5.1, AC5.4

**Implementation Notes (November 2025):**
- Using idb 8.0.3 (Jake Archibald's IndexedDB wrapper with Promise API)
- Type-safe schema with DBSchema interface for compile-time checking
- 4 object stores: services, credentials, subscriptions, metadata
- Services store indexes: by-userId, by-updatedAt, by-pendingSync
- Credentials store indexes: by-serviceId, by-updatedAt, by-pendingSync
- Subscriptions store indexes: by-userId, by-nextRenewal, by-updatedAt, by-pendingSync
- Metadata store: key-value for sync state (lastSyncedAt, userId, syncInProgress)
- P19.1: Schema with proper indexes for efficient queries
- P19.3: requestPersistentStorage() to prevent browser eviction
- P19.4: getStorageQuota() for monitoring storage usage
- Local-only fields (_pendingSync, _lastSyncedAt) for offline sync support
- Utility functions: toService, toCredential, toSubscription strip local fields
- fake-indexeddb for testing in Node.js environment
- 34 unit tests passing

---

### T8.2: Implement IndexedDB CRUD Operations
- [x] Complete task

**Steps:**
1. Implement saveService, getServices, deleteService
2. Implement saveCredential, getCredentials, deleteCredential
3. Implement saveSubscription, getSubscriptions, deleteSubscription
4. Implement batched cursor reads (20 items at a time)
5. Write unit tests

**Acceptance:** IndexedDB CRUD operations functional and tested

**Validates:** AC5.2, AC5.5

**Implementation Notes (November 2025):**
- Created `frontend/src/lib/db/crud.ts` with full CRUD operations for all stores
- Services: saveService, saveServices, getService, getServices, getAllServices, deleteService, softDeleteService
- Credentials: saveCredential, saveCredentials, getCredential, getCredentials, getAllCredentials, deleteCredential, softDeleteCredential, deleteCredentialsByService
- Subscriptions: saveSubscription, saveSubscriptions, getSubscription, getSubscriptions, getAllSubscriptions, deleteSubscription, softDeleteSubscription, getUpcomingRenewals
- Batched cursor reads: getServicesBatched, getCredentialsBatched, getSubscriptionsBatched (default 20 items per batch)
- Pending sync tracking: getServicesPendingSync, getCredentialsPendingSync, getSubscriptionsPendingSync, clearServicePendingSync, clearCredentialPendingSync, clearSubscriptionPendingSync
- Bulk operations: getAllPendingSync, clearAllPendingSync, deleteServiceWithCredentials, loadVaultData, saveVaultData
- 38 unit tests passing covering all CRUD operations, batched reads, edge cases, and bulk operations

---

### T8.3: Implement Sync Logic
- [x] Complete task

**Steps:**
1. Track last_synced_at in metadata store
2. Implement syncToServer function (queue changes)
3. Implement syncFromServer function (fetch updates)
4. Handle offline mode (queue changes)
5. Write unit tests

**Acceptance:** Sync logic functional and tested

**Validates:** AC5.3

**Implementation Notes (November 2025):**
- Created `frontend/src/lib/db/sync.ts` with full sync logic
- Sync status management: getSyncStatus, subscribeSyncStatus, setSyncStatus (idle, syncing, error, offline)
- Offline detection: isOnline(), setupOnlineListeners() for automatic status updates
- Sync queue: getSyncQueue(), hasPendingChanges(), getPendingChangesCount()
- Push sync: syncToServer() pushes pending changes, clears sync flags on success
- Pull sync: syncFromServer() fetches updates, applies changes, handles deletions
- Full sync: fullSync() performs bidirectional sync (push then pull)
- Debounced sync: scheduleDebouncedSync(), cancelDebouncedSync() (2s default delay)
- Helpers: getLastSyncedAt(), needsInitialSync(), resetSyncState(), forceUnlockSync()
- SyncApiClient interface for server communication abstraction
- Mock API client for testing: createMockApiClient() with offline/error simulation
- Concurrent sync prevention via syncInProgress metadata flag
- 33 unit tests passing covering all sync operations, offline handling, and edge cases

---

## Phase 9: Frontend - Authentication UI

### T9.1: Implement Registration Page
- [x] Complete task

**Steps:**
1. Create register/+page.svelte ✅
2. Form: email, master password, confirm password ✅
3. Validate password strength (zxcvbn) ✅
4. Generate seed phrase on submit ✅
5. Display seed phrase (24 words, show once) ✅
6. Confirm seed phrase (enter 3 random words) ✅
7. Call API /api/auth/register ✅
8. Redirect to vault on success ✅

**Acceptance:** Registration page functional ✅

**Validates:** AC1.1, AC1.2, AC1.3

**Implementation Notes (November 2025):**
- Using @zxcvbn-ts/core 3.0.4 for password strength estimation (TypeScript rewrite, actively maintained)
- ZxcvbnFactory with English and common dictionaries for accurate strength scoring
- Real-time password strength feedback with score (0-4), label, crack time estimate, and suggestions
- Minimum password score of 2 (Fair) required for registration
- 24-word BIP39 seed phrase generation using @scure/bip39 2.0.1
- Seed phrase confirmation requires entering 3 random words (cryptographically random selection)
- Download seed phrase feature for user convenience
- Full crypto workflow: generate DEK → derive AuthHash/KEK → wrap DEK with KEK → register
- Base64 encoding for all binary data sent to backend (matches backend expectations)
- Proper error handling with user-friendly messages
- Auto-redirect to vault after successful registration with session stored in auth store
- All 403 frontend tests passing

---

### T9.2: Implement Login Page
- [x] Complete task

**Steps:**
1. Create +page.svelte (landing/login) ✅
2. Form: email, master password ✅
3. Derive AuthHash and KEK on submit ✅
4. Call API /api/auth/login ✅
5. Decrypt WrappedKey with KEK → DEK ✅
6. Store DEK in auth store ✅
7. Redirect to vault on success ✅
8. Show error on failure ✅

**Acceptance:** Login page functional ✅

**Validates:** AC1.4

**Implementation Notes (December 2025):**
- Using Svelte 5.37.0 with runes ($state, $derived) for reactive state management
- Added GET /api/auth/salts/:email endpoint to backend for fetching user salts before login
- Salts are not secret and can be publicly accessible (security comes from password + salt)
- Login flow: Fetch salts → Derive AuthHash/KEK → Send login request → Unwrap DEK → Store in auth
- Progress indicator shows key derivation progress (Argon2id computation takes 300-500ms)
- Proper error handling for account lockout (423 status), invalid credentials (401), and not found (404)
- Auto-redirect to /vault after successful login
- Links to /register and /recover for new users and account recovery
- Fixed zxcvbn-ts/core v3.x API usage (zxcvbnOptions.setOptions instead of ZxcvbnFactory)
- Converted base64 to hex properly for unwrapKeyFromHex (no Buffer dependency in browser)
- All builds passing, ready for testing

---

### T9.3: Implement Account Recovery Page
- [x] Complete task

**Steps:**
1. Create recover/+page.svelte ✅
2. Form: seed phrase (24 words) ✅
3. Validate seed phrase ✅
4. Derive DEK from seed phrase ✅
5. Prompt for new master password ✅
6. Re-encrypt DEK with new KEK ✅
7. Call API to update wrappedKey ✅
8. Redirect to vault on success ✅

**Acceptance:** Account recovery page functional ✅

**Validates:** AC1.5

**Implementation Notes (December 2025):**
- Using Svelte 5.37.0 with runes ($state, $derived) for reactive state management
- Two-step recovery flow: seed phrase verification → new password setup
- Seed phrase validation using @scure/bip39 2.0.1 (validateSeedPhrase)
- DEK recovery via deriveDEKFromSeedPhrase (PBKDF2-HMAC-SHA512 + HKDF)
- Password strength validation using @zxcvbn-ts/core 3.0.4 (minimum score 2)
- Progress indicators for key derivation operations (Argon2id takes 300-500ms)
- Backend endpoint POST /api/auth/recover updates auth_verifier, salts, and wrapped_key
- Resets failed_login_attempts and locked_until on successful recovery
- Auto-login after successful recovery with new session token
- All sensitive data cleared from memory after recovery
- Links to login page for users who remember their password

---

## Phase 10: Frontend - Vault UI

### T10.1: Implement Service List Component
- [x] Complete task

**Steps:**
1. Create src/lib/components/ServiceList.svelte ✅
2. Display services from vault store ✅
3. Search by service name ✅
4. Click to view service details ✅
5. Add service button ✅
6. Delete service button (with confirmation) ✅

**Acceptance:** Service list component functional ✅

**Validates:** AC2.1, AC2.6

**Implementation Notes (December 2025):**
- Using Svelte 5.37.0 with runes ($state, $derived, $props) for reactive state management
- Component receives optional callbacks via props: onAddService, onSelectService
- Local search state with $derived for filtered services based on search query
- Integrated with vaultStore singleton for service data and selection state
- Keyboard accessibility: Enter/Space keys for service selection (role="button", tabindex="0")
- Service deletion with confirmation dialog (event.stopPropagation to prevent selection)
- Empty states: different messages for no services vs no search results
- Service icons: displays custom icon or generates placeholder with first letter
- Shows credential count per service using vaultStore.getCredentialsForService()
- CSS uses custom properties from app.css (--color-* variables) for theme consistency
- Added missing CSS variables: --color-accent-primary-hover, --color-accent-primary-alpha, --color-text-tertiary
- Fixed vitest config: added resolve.conditions: ['browser'] for Svelte 5 SSR compatibility
- 4 unit tests passing: empty state, service count, multiple services, search filtering
- svelte-check: 0 errors, 0 warnings

---

### T10.2: Implement Service Detail Component
- [x] Complete task

**Steps:**
1. Create src/lib/components/ServiceDetail.svelte ✅
2. Display service name ✅
3. Display credentials list (ordered by display_order) ✅
4. Show credential type and label ✅
5. Hide credential values (••••••••) ✅
6. Click to reveal value (require master password if view-only mode) ✅
7. Copy to clipboard button (30s auto-clear) ✅
8. Add credential button ✅
9. Edit credential button ✅
10. Delete credential button ✅
11. Reorder credentials (drag-and-drop or up/down buttons) ✅

**Acceptance:** Service detail component functional ✅

**Validates:** AC2.2, AC2.3, AC2.4, AC2.5, AC2.7, AC4.1-AC4.4

**Implementation Notes (December 2025):**
- Using Svelte 5.37.0 with runes ($state, $derived, $props, $effect) for reactive state management
- Component receives serviceId prop and optional callbacks (onAddCredential, onEditCredential)
- Integrated with vaultStore for service and credential data
- Integrated with authStore for DEK access (decryption)
- Credential value decryption using decryptFromHexToString from @noble/ciphers AES-256-GCM
- Reveal/hide toggle for credential values with in-memory state tracking
- Copy to clipboard using navigator.clipboard.writeText with 30s auto-clear timeout
- Credential reordering with up/down buttons (calls vaultStore.reorderCredentials)
- Credential type icons: username (👤), password (🔑), email (📧), totp (🔐), note (📝), custom (🏷️)
- Delete confirmation dialog before removing credentials
- Empty states: no credentials, service not found
- Monospace font for credential values (Monaco, Courier New)
- Keyboard accessibility: proper ARIA labels and button semantics
- CSS uses custom properties from app.css for theme consistency
- Cleanup effect for copy timeouts on component unmount
- 14 unit tests passing: rendering, empty states, callbacks, button states, icons

---

### T10.3: Implement Add/Edit Credential Modal
- [x] Complete task

**Steps:**
1. Create src/lib/components/CredentialModal.svelte ✅
2. Form: type (dropdown), label, value ✅
3. Encrypt value with DEK on submit ✅
4. Call API to save credential ✅
5. Update vault store (optimistic) ✅

**Acceptance:** Add/edit credential modal functional ✅

**Validates:** AC2.3, AC2.4

**Implementation Notes (December 2025):**
- Using Svelte 5.37.0 with runes ($state, $derived, $props, $effect) for reactive state management
- Modal component with isOpen prop for visibility control
- Support for both Add and Edit modes (credentialId prop determines mode)
- 6 credential types: username, password, email, totp, note, custom
- Type-specific input handling: password type uses password input, note type uses textarea
- AES-256-GCM encryption using @noble/ciphers before sending to API
- Decryption of existing values when editing credentials
- Optimistic updates with rollback on API failure
- Proper form validation with required fields
- Keyboard accessibility: Escape key closes modal
- Backdrop click closes modal
- Loading state with disabled inputs during API calls
- Error display for failed operations
- 17 unit tests passing

---

### T10.4: Implement Vault Page
- [ ] Complete task

**Steps:**
1. Create vault/+page.svelte
2. Load services from IndexedDB on mount
3. Display ServiceList component
4. Display ServiceDetail component (selected service)
5. Implement search functionality

**Acceptance:** Vault page functional

**Validates:** AC2.1-AC2.9

---

## Phase 11: Frontend - Subscription Dashboard UI

### T11.1: Implement Spending Overview Component
- [ ] Complete task

**Steps:**
1. Create src/lib/components/SpendingOverview.svelte
2. Display total monthly spending
3. Display total yearly spending
4. Display upcoming renewals count (next 30 days)
5. Use derived state from subscriptions store

**Acceptance:** Spending overview component functional

**Validates:** AC3.5, AC3.6, AC3.7

---

### T11.2: Implement Subscription List Component
- [ ] Complete task

**Steps:**
1. Create src/lib/components/SubscriptionList.svelte
2. Display subscriptions from store
3. Show service name, cost, currency, next renewal
4. Show trial badge if is_trial
5. Add subscription button
6. Edit subscription button
7. Delete subscription button

**Acceptance:** Subscription list component functional

**Validates:** AC3.1

---

### T11.3: Implement Add/Edit Subscription Modal
- [ ] Complete task

**Steps:**
1. Create src/lib/components/SubscriptionModal.svelte
2. Form: service name, cost, currency, billing cycle, renewal date, payment method, start date, tier, trial status
3. Validate cost > 0
4. Validate currency (USD, CAD, EUR)
5. Call API to save subscription
6. Update subscriptions store (optimistic)

**Acceptance:** Add/edit subscription modal functional

**Validates:** AC3.1, AC3.2, AC3.3, AC3.4

---

### T11.4: Implement Spending Trends Chart
- [ ] Complete task

**Steps:**
1. Create src/lib/components/SpendingTrends.svelte
2. Use Chart.js or similar library
3. Display line chart of spending over time
4. Group by month
5. Show monthly and yearly subscriptions

**Acceptance:** Spending trends chart functional

**Validates:** AC3.8

---

### T11.5: Implement Cost Breakdown Chart
- [ ] Complete task

**Steps:**
1. Create src/lib/components/CostBreakdown.svelte
2. Use Chart.js or similar library
3. Display pie chart of cost by service
4. Show percentage and amount

**Acceptance:** Cost breakdown chart functional

**Validates:** AC3.9

---

### T11.6: Implement Renewal Calendar Component
- [ ] Complete task

**Steps:**
1. Create src/lib/components/RenewalCalendar.svelte
2. Display calendar view of upcoming renewals
3. Highlight renewal dates
4. Show subscription details on hover/click

**Acceptance:** Renewal calendar component functional

**Validates:** AC3.10

---

### T11.7: Implement Trial Expiration Warnings
- [ ] Complete task

**Steps:**
1. Create src/lib/components/TrialWarnings.svelte
2. Filter subscriptions where is_trial = true
3. Show warning if trial_end_date < 7 days
4. Display countdown

**Acceptance:** Trial expiration warnings functional

**Validates:** AC3.11

---

### T11.8: Implement Dashboard Page
- [ ] Complete task

**Steps:**
1. Create dashboard/+page.svelte
2. Load subscriptions from IndexedDB on mount
3. Display SpendingOverview component
4. Display SubscriptionList component
5. Display SpendingTrends chart
6. Display CostBreakdown chart
7. Display RenewalCalendar component
8. Display TrialWarnings component

**Acceptance:** Dashboard page functional

**Validates:** AC3.1-AC3.12

---

## Phase 12: Testing & Validation

### T12.1: Write Backend Unit Tests
- [ ] Complete task

**Steps:**
1. Test auth endpoints (register, login, logout)
2. Test vault endpoints (services, credentials CRUD)
3. Test subscription endpoints (CRUD)
4. Test rate limiting logic
5. Test security headers middleware
6. Achieve >80% code coverage

**Acceptance:** Backend unit tests passing with >80% coverage

---

### T12.2: Write Frontend Unit Tests
- [ ] Complete task

**Steps:**
1. Test crypto utilities (Argon2id, AES-256-GCM, seed phrase)
2. Test stores (auth, vault, subscriptions)
3. Test IndexedDB operations
4. Achieve >80% code coverage

**Acceptance:** Frontend unit tests passing with >80% coverage

---

### T12.3: Write E2E Tests (Playwright)
- [ ] Complete task

**Steps:**
1. Test registration flow with seed phrase
2. Test login flow
3. Test add service with credentials
4. Test add subscription
5. Test vault lock/unlock
6. Test account recovery with seed phrase
7. Test rate limiting (5 failed logins)
8. Test session timeout (15 min)

**Acceptance:** E2E tests passing

**Validates:** All acceptance criteria

---

### T12.4: Security Audit
- [ ] Complete task

**Steps:**
1. Verify no plaintext in network requests (programmatic checks)
2. Verify encrypted data in D1
3. Verify CSP headers applied
4. Verify rate limiting works
5. Verify constant-time comparison
6. Verify memory sanitization

**Acceptance:** Security audit passed

**Validates:** AC6.1-AC6.7

---

### T12.5: Performance Testing
- [ ] Complete task

**Steps:**
1. Measure vault unlock time (target <300ms)
2. Measure time to interactive (target <1.5s)
3. Measure Argon2 computation time (target 300-500ms)
4. Measure API response times (target <100ms)
5. Test with 10, 100, 1000 vault items

**Acceptance:** Performance targets met

**Validates:** AC6.7, AC6.8, AC6.9
- [ ] Measure API response times (target <100ms)
- [ ] Test with 10, 100, 1000 vault items

**Acceptance:** Performance targets met

**Validates:** AC6.7, AC6.8, AC6.9

---

## Phase 13: Deployment & Launch

### T13.1: Configure Custom Domain
**Autonomous:** ⚠️ **MANUAL STEP REQUIRED**

**Human Action Required:**
1. Log into Cloudflare Dashboard
2. Navigate to DNS settings for codavibe.dev
3. Add CNAME record:
   - Name: `secrets`
   - Target: `<cloudflare-pages-url>.pages.dev` (get from Pages dashboard)
   - Proxy status: Proxied (orange cloud)
4. Navigate to SSL/TLS settings
5. Set SSL/TLS encryption mode to "Full (strict)"

**AI Agent Actions:**
- [ ] Generate instructions document with exact values
- [ ] Create docs/dns-setup.md with step-by-step guide
- [ ] After human completes: Test domain resolution with `curl -I https://secrets.codavibe.dev`
- [ ] Verify SSL certificate: `openssl s_client -connect secrets.codavibe.dev:443 -servername secrets.codavibe.dev`

**Acceptance:** Custom domain accessible at https://secrets.codavibe.dev with valid SSL

**Validates:** AC7.4, AC7.5

**Note:** This is one of only 2 manual steps in the entire project (5% of work)

---

### T13.2: Deploy to Production
- [ ] Complete task

**Steps:**
1. Push to main branch
2. Verify GitHub Actions workflows run
3. Verify frontend deploys to Cloudflare Pages
4. Verify backend deploys to Cloudflare Workers
5. Verify D1 migrations applied
6. Test live site at secrets.codavibe.dev

**Acceptance:** Production deployment successful

**Validates:** AC7.1, AC7.2, AC7.3, AC7.6

---

### T13.3: Founder Testing (MVP Validation)
**Autonomous:** ⚠️ **MANUAL STEP REQUIRED**

**Human Action Required (Founder Testing):**
1. Visit https://secrets.codavibe.dev
2. Register account with seed phrase (save seed phrase!)
3. Add 10+ services with passwords and API keys
4. Add 5+ subscriptions with full data
5. View subscription analytics dashboard
6. Search and retrieve credentials
7. Lock/unlock vault multiple times
8. Test account recovery with seed phrase
9. Use daily for 1 week, report any issues

**AI Agent Actions:**
- [ ] Create testing checklist document
- [ ] Create docs/testing-guide.md with detailed test scenarios
- [ ] Monitor error logs during testing period
- [ ] Fix any bugs reported by founder
- [ ] Re-deploy fixes automatically via GitHub Actions

**Acceptance:** Founder can use product daily with zero errors or blockers

**Validates:** All success criteria

**Note:** This is the 2nd of only 2 manual steps in the entire project (5% of work)

---

### T13.4: Documentation
- [ ] Complete task

**Steps:**
1. Create docs/architecture.md
2. Create docs/security-model.md
3. Create docs/api-reference.md
4. Create docs/deployment.md
5. Create docs/development.md
6. Update README.md with project overview

**Acceptance:** Comprehensive documentation created

---

## Phase 14: Post-MVP (Future)

### T14.1: Multi-Device Sync (Phase 2)
- [ ] Complete task

**Steps:**
1. Implement delta sync engine
2. Implement conflict resolution
3. Implement device management

**Status:** Deferred to Phase 2

---

### T14.2: Stripe Integration (Post-MVP)
- [ ] Complete task

**Steps:**
1. Integrate Stripe Checkout
2. Implement subscription enforcement
3. Generate 100% discount codes for beta testers

**Status:** Deferred to post-MVP

---

### T14.3: Browser Extension (Phase 4)
- [ ] Complete task

**Steps:**
1. Build Manifest V3 extension
2. Implement autofill functionality

**Status:** Deferred to Phase 4

---

## Summary

**Total Tasks:** 80+  
**Estimated Timeline:** 4-6 weeks (no rush, quality over speed)  
**Critical Path:** T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13

**Next Action:** Start with T1.1 (Initialize GitHub Repository)
