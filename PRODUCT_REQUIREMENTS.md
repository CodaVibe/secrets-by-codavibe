# Product Requirements Document
## Secrets by Codavibe

**Product Name:** Secrets by Codavibe  
**Domain:** secrets.codavibe.dev  
**Version:** MVP (Phase 1)  
**Last Updated:** November 22, 2025

---

## Product Vision

A zero-knowledge password manager and subscription dashboard built specifically for solo developers. Focused on simplicity, security, and providing a clean interface for managing service credentials (passwords + API keys) and tracking subscription spending.

---

## Target Users

**Primary:** Solo developers, code enthusiasts, individual developers  
**Geographic Market:** Canada and USA  
**User Count (MVP):** Single user (founder) → Reddit beta testers → Public launch

---

## Core Value Proposition

1. **Developer-First:** Hierarchical credential storage (Service → Password + Multiple API/Secret Keys)
2. **Zero-Knowledge Security:** Client-side encryption, seed phrase recovery (like crypto wallets)
3. **Subscription Analytics:** Visual dashboard for tracking renewal dates, costs, and spending patterns
4. **Straight to the Point:** No feature bloat - username, password, API secrets, done

---

## Monetization

- **Pricing:** $5/month (single tier, no free tier)
- **Payment:** Stripe integration (post-MVP)
- **Beta Access:** 100% discount codes via Stripe for invited testers
- **MVP:** Skip payment processing, enforce subscription status for future

---

## MVP Scope (Phase 1)

### Must-Have Features

#### 1. Zero-Knowledge Authentication
- Registration with username + master password
- Login with zero-knowledge proof (Argon2id key derivation)
- **Seed Phrase Recovery:** Generate once during registration, show only once (user responsibility to save)
- Seed phrase length: Based on security best practices (12-24 words)
- Accept data loss if user loses both password and seed phrase

#### 2. Vault - Hierarchical Credential Storage

**Structure:**
```
Service (Parent)
├── Password (optional)
├── API Key 1 (with custom name, e.g., "Domains API")
├── API Key 2 (with custom name, e.g., "DNS API")
├── Secret Key 1
├── Public Key 1
└── ... (unlimited keys)
```

**Example:**
```
Cloudflare
├── Password: ••••••••
├── API Key: "Domains API" → ••••••••
├── API Key: "DNS API" → ••••••••
└── Secret Key: "Workers Secret" → ••••••••
```

**Key Types Supported:**
- Password (account login)
- API Key
- Secret Key
- Public Key
- Access Token
- Private Key
- Any custom key type

**Features:**
- Add/Edit/Delete services
- Add/Edit/Delete credentials under each service
- Order/sort credentials within a service
- Search by service name
- Copy to clipboard with auto-clear (30 seconds)

#### 3. View-Only Mode
- Quick lookup mode without full vault unlock
- Show service names and credential labels (not values)
- Require master password to reveal actual credentials

#### 4. Subscription Dashboard

**Tracked Data per Subscription:**
- Service name (e.g., "GitHub Pro", "Cloudflare Workers")
- Cost (amount + currency)
- Billing cycle (monthly, yearly, custom)
- Renewal date (next billing date)
- Payment method: Last 4 digits of card OR custom nickname
- Start date (since when it's been used)
- Tier/Plan name (e.g., "Pro", "Enterprise")
- Trial status (yes/no, trial end date)
- Optional: User can add their own $5/month Secrets subscription

**Analytics & Visualizations:**
- Total monthly spending
- Total yearly spending
- Spending by category/service
- Upcoming renewals (calendar view)
- Spending trends over time (line chart)
- Cost breakdown by service (pie chart)
- Trial expiration warnings

#### 5. Security Features
- Client-side encryption (AES-256-GCM)
- Zero-knowledge architecture (server never sees plaintext)
- Session timeout (auto-lock after 15 minutes inactivity)
- Rate limiting on auth endpoints
- Content Security Policy with Trusted Types
- No audit logs, no retention policy (privacy-first)

---

## Design Requirements

### Visual Style
- **Inspiration:** LastPass-like interface
- **Theme:** Dark mode (primary)
- **Note:** MVP design is not final, focus on functionality over polish

### Color Palette

**Base Colors:**
- Background: `#1b1b1b` (soft dark gray)
- Surface/Cards: `#2d2d2d`
- Borders: `#3a3a3a`

**Text:**
- Primary: `rgba(255, 255, 255, 0.87)`
- Secondary: `rgba(255, 255, 255, 0.60)`
- Disabled: `rgba(255, 255, 255, 0.38)`

**Accent Colors:**
- Primary: `#BB86FC` (Purple - buttons, links, primary actions)
- Secondary: `#00FFFF` (Cyan - highlights, success, charts)

**Additional:**
- Error: `#CF6679` (desaturated red)
- Warning: `#FFB74D` (desaturated orange)
- Success: `#81C784` (desaturated green)

---

## Technical Constraints

### Compliance
- **GDPR/CCPA:** Yes (Canada + USA launch)
- **Security Standards:** Use industry best practices, no formal audits required
- **Data Retention:** Zero retention policy, no audit logs

### Performance Targets
- Vault unlock: <300ms
- Time to interactive: <1.5s
- Sync latency: <500ms (Phase 2)

### Browser Support
- Modern browsers only (Chrome, Firefox, Edge, Safari - latest 2 versions)
- No IE11 support

---

## Out of Scope (MVP)

### Not Included in Phase 1:
- ❌ Browser extension / autofill
- ❌ Multi-device sync (Phase 2)
- ❌ Password sharing between users
- ❌ Stripe payment integration (post-MVP)
- ❌ Email notifications for renewals
- ❌ Automatic subscription detection
- ❌ Receipt attachments
- ❌ Two-factor authentication (TOTP/WebAuthn)
- ❌ Team/family sharing
- ❌ Mobile apps

---

## Success Criteria (MVP)

**Definition of Success:**
> Founder (first user) can use the product daily with zero errors or blockers for managing credentials and subscriptions.

**Specific Criteria:**
1. ✅ Register account with seed phrase backup
2. ✅ Add 10+ services with passwords and API keys
3. ✅ Add 5+ subscriptions with full tracking data
4. ✅ View subscription analytics dashboard
5. ✅ Search and retrieve credentials quickly
6. ✅ Lock/unlock vault without issues
7. ✅ Recover account using seed phrase
8. ✅ No data loss or corruption
9. ✅ No security vulnerabilities (self-audit)
10. ✅ Acceptable performance (<300ms unlock)

---

## User Flows

### 1. Registration Flow
1. User visits secrets.codavibe.dev
2. Clicks "Create Account"
3. Enters username + master password
4. System generates seed phrase (12-24 words)
5. **Critical:** User must write down seed phrase (shown only once)
6. User confirms seed phrase by entering 3 random words
7. Account created, vault initialized

### 2. Adding a Service with Credentials
1. User unlocks vault
2. Clicks "Add Service"
3. Enters service name (e.g., "Cloudflare")
4. Optionally adds account password
5. Clicks "Add API Key"
6. Enters key name (e.g., "Domains API") and value
7. Repeats for multiple keys
8. Saves service
9. All credentials encrypted and stored

### 3. Adding a Subscription
1. User navigates to "Subscriptions" tab
2. Clicks "Add Subscription"
3. Fills form:
   - Service name
   - Cost + currency
   - Billing cycle
   - Next renewal date
   - Payment method (last 4 digits or nickname)
   - Start date
   - Tier/plan name
   - Trial status
4. Saves subscription
5. Dashboard updates with new data

### 4. Viewing Analytics
1. User navigates to "Dashboard" tab
2. Sees overview cards:
   - Total monthly spending
   - Total yearly spending
   - Upcoming renewals (next 30 days)
3. Scrolls to charts:
   - Spending trends (line chart)
   - Cost breakdown (pie chart)
   - Renewal calendar
4. Filters by date range or service

### 5. Account Recovery
1. User forgets master password
2. Clicks "Recover Account"
3. Enters seed phrase (12-24 words)
4. System derives new master password option
5. User sets new master password
6. Vault re-encrypted with new key

---

## Data Model

### Service Entity
```typescript
interface Service {
  id: string;
  userId: string;
  name: string; // e.g., "Cloudflare"
  credentials: Credential[];
  createdAt: number;
  updatedAt: number;
}
```

### Credential Entity
```typescript
interface Credential {
  id: string;
  serviceId: string;
  type: 'password' | 'api_key' | 'secret_key' | 'public_key' | 'access_token' | 'private_key' | 'custom';
  label: string; // e.g., "Domains API", "Account Password"
  encryptedValue: string;
  iv: string;
  order: number; // for sorting within service
  createdAt: number;
  updatedAt: number;
}
```

### Subscription Entity
```typescript
interface Subscription {
  id: string;
  userId: string;
  serviceName: string;
  cost: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly' | 'custom';
  customCycleDays?: number;
  nextRenewal: number; // Unix timestamp
  paymentMethod: string; // "•••• 1234" or "Personal Visa"
  startDate: number;
  tier: string; // "Pro", "Enterprise", etc.
  isTrial: boolean;
  trialEndDate?: number;
  createdAt: number;
  updatedAt: number;
}
```

---

## Open Questions / Decisions Needed

1. **Seed Phrase Length:** 12 words (128-bit) or 24 words (256-bit)?
   - Recommendation: 24 words for maximum security
   
2. **View-Only Mode Implementation:** Should it require a PIN, or just hide values until clicked?
   - Recommendation: Hide values, require master password on reveal

3. **Subscription Currency:** Support multiple currencies or USD only for MVP?
   - Recommendation: Support multiple (USD, CAD, EUR) with dropdown

4. **Service Icons:** Should services have icons/logos, or text-only for MVP?
   - Recommendation: Text-only for MVP, icons in Phase 2

---

## Timeline

**MVP Development:** No rush, quality over speed  
**Beta Testing:** Founder → Reddit users → Public launch  
**Phases:** Iterative development, Phase 1 first, then expand

---

## Notes

- This is a personal project first, product second
- Focus on building something the founder will actually use daily
- Security and UX are equally important
- Keep it simple, avoid feature creep
- Document everything for future contributors
