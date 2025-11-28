# Requirements: Secrets by Codavibe - Zero-Knowledge Password Manager

## Overview

Build a zero-knowledge password manager and subscription dashboard for solo developers. The application stores credentials hierarchically (Service → Multiple API/Secret Keys) and provides subscription analytics. Deployed entirely on Cloudflare (Workers, D1, Pages) with GitHub-based deployment workflow.

## Target Users

- **Primary:** Solo developers, individual developers
- **Geographic:** Canada & USA
- **Use Case:** Managing service credentials (passwords + API keys) and tracking subscription spending

## Core Requirements

### R1: Zero-Knowledge Authentication

**Acceptance Criteria:**
- AC1.1: User can register with email + master password
- AC1.2: System generates 24-word BIP39 seed phrase during registration
- AC1.3: Seed phrase shown only once, user must confirm by entering 3 random words
- AC1.4: Master password never sent to server (only derived AuthHash)
- AC1.5: User can recover account using seed phrase
- AC1.6: Session auto-locks after 15 minutes of inactivity
- AC1.7: Rate limiting: 5 failed login attempts per 15 minutes per IP

**Security Model:**
- Argon2id key derivation (300-500ms target, adaptive parameters)
- Two derived keys: AuthHash (server verification) + KEK (local DEK decryption)
- Server stores: AuthVerifier (AuthHash + Pepper), AuthSalt, KEKSalt, WrappedKey
- DEK (Data Encryption Key) encrypted with KEK, stored as WrappedKey
- All encryption/decryption happens client-side only

### R2: Hierarchical Vault Storage

**Acceptance Criteria:**
- AC2.1: User can create services (e.g., "Cloudflare", "GitHub")
- AC2.2: Each service can have optional password field
- AC2.3: Each service can have unlimited credentials with custom labels
- AC2.4: Supported credential types: Password, API Key, Secret Key, Public Key, Access Token, Private Key, Custom
- AC2.5: Credentials can be reordered within a service
- AC2.6: User can search services by name
- AC2.7: Copy credential to clipboard with 30-second auto-clear
- AC2.8: All credentials encrypted with AES-256-GCM using DEK
- AC2.9: Soft delete for services and credentials (is_deleted flag)

**Data Structure:**
```
Service: Cloudflare
├── Password: "Account Password" → ••••••••
├── API Key: "Domains API" → ••••••••
├── API Key: "DNS API" → ••••••••
└── Secret Key: "Workers Secret" → ••••••••
```

### R3: Subscription Dashboard

**Acceptance Criteria:**
- AC3.1: User can add subscriptions with: service name, cost, currency, billing cycle, renewal date, payment method, start date, tier, trial status
- AC3.2: Support multiple currencies: USD, CAD, EUR
- AC3.3: Support billing cycles: monthly, yearly, custom (days)
- AC3.4: Payment method stored as last 4 digits or custom nickname
- AC3.5: Display total monthly spending
- AC3.6: Display total yearly spending
- AC3.7: Show upcoming renewals (next 30 days)
- AC3.8: Visualize spending trends (line chart)
- AC3.9: Visualize cost breakdown by service (pie chart)
- AC3.10: Show renewal calendar view
- AC3.11: Warn about trial expirations
- AC3.12: User can optionally add their own $5/month Secrets subscription

### R4: View-Only Mode

**Acceptance Criteria:**
- AC4.1: User can enable view-only mode
- AC4.2: In view-only mode, show service names and credential labels only
- AC4.3: Credential values hidden (shown as ••••••••)
- AC4.4: Require master password to reveal individual credential values
- AC4.5: View-only mode persists across sessions

### R5: Offline-First Architecture

**Acceptance Criteria:**
- AC5.1: Encrypted vault cached in IndexedDB
- AC5.2: App works offline after initial sync
- AC5.3: Changes queued when offline, synced when online
- AC5.4: Monitor IndexedDB quota, warn at 80% usage
- AC5.5: Instant vault unlock from local cache (<300ms)

### R6: Security & Performance

**Acceptance Criteria:**
- AC6.1: Content Security Policy with Trusted Types enabled
- AC6.2: All security headers configured (X-Frame-Options, X-Content-Type-Options, etc.)
- AC6.3: Rate limiting on auth endpoints (Cloudflare KV)
- AC6.4: Account lockout after excessive failed attempts
- AC6.5: Constant-time comparison for auth verification
- AC6.6: No plaintext data in network requests (verified)
- AC6.7: Vault unlock time <300ms (target: 200ms)
- AC6.8: Time to interactive <1.5s
- AC6.9: Argon2 computation 300-500ms (adaptive to device)

### R7: GitHub → Cloudflare Deployment

**Acceptance Criteria:**
- AC7.1: Frontend auto-deploys to Cloudflare Pages on push to main
- AC7.2: Backend auto-deploys to Cloudflare Workers on push to main
- AC7.3: D1 migrations run automatically before Worker deployment
- AC7.4: Custom domain secrets.codavibe.dev configured
- AC7.5: SSL/TLS enabled (Full Strict mode)
- AC7.6: No local development setup required
- AC7.7: Preview deployments for pull requests

## Non-Functional Requirements

### NFR1: Browser Support
- Modern browsers only: Chrome, Firefox, Edge, Safari (latest 2 versions)
- No IE11 support

### NFR2: Compliance
- GDPR/CCPA compliant (Canada + USA)
- Zero retention policy, no audit logs
- Privacy-first approach

### NFR3: Monetization (Post-MVP)
- $5/month single tier subscription
- Stripe integration for payment processing
- 100% discount codes for beta testers
- Enforce subscription status

## Out of Scope (MVP)

- ❌ Multi-device sync (Phase 2)
- ❌ Browser extension / autofill
- ❌ Password sharing between users
- ❌ Email notifications for renewals
- ❌ Automatic subscription detection
- ❌ Receipt attachments
- ❌ Two-factor authentication (TOTP/WebAuthn)
- ❌ Team/family sharing
- ❌ Mobile apps

## Success Criteria

**MVP Success:** Founder can use the product daily with zero errors or blockers for managing credentials and subscriptions.

**Specific Validation:**
1. Register account with seed phrase backup
2. Add 10+ services with passwords and API keys
3. Add 5+ subscriptions with full tracking data
4. View subscription analytics dashboard
5. Search and retrieve credentials quickly
6. Lock/unlock vault without issues
7. Recover account using seed phrase
8. No data loss or corruption
9. No security vulnerabilities (self-audit)
10. Performance targets met (<300ms unlock)

## References

- Full implementation details: #[[file:ALLTOGETHER.md]]
- Tech stack: Svelte 5, Tailwind CSS 4, Cloudflare Workers, D1, KV
- Crypto libraries: @noble/hashes, @noble/ciphers
- Deployment: GitHub Actions → Cloudflare
