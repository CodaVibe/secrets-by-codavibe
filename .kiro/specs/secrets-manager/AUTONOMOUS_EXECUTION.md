# Autonomous Execution Guide for AI Agents

**Project:** Secrets by Codavibe - Zero-Knowledge Password Manager  
**Autonomous Coverage:** 95% (76 of 80 tasks)  
**Manual Steps:** 2 (DNS configuration + User testing)

---

## 🤖 For AI Agents Working on This Project

This document provides complete instructions for autonomous execution of this project. Read this first before starting any tasks.

---

## Prerequisites

### Required Files

1. **SOCRAM.md** - Contains all API keys and tokens (at project root)
2. **ALLTOGETHER.md** - Complete technical specification
3. **.kiro/specs/secrets-manager/** - Spec files (requirements, design, tasks)

### Required CLI Tools

All tools should be available in the execution environment:
- `gh` - GitHub CLI
- `wrangler` - Cloudflare Wrangler CLI
- `pnpm` - Package manager
- `git` - Version control
- `node` - Node.js runtime (v20+)
- `openssl` - For generating secrets

---

## Step 1: Read Credentials from SOCRAM.md

**Location:** `SOCRAM.md` at project root

**Expected format:**
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxx
```

**Action:**
```bash
# Export credentials as environment variables
export GITHUB_TOKEN=$(grep "GITHUB_TOKEN" SOCRAM.md | cut -d'=' -f2 | tr -d ' ')
export CLOUDFLARE_API_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" SOCRAM.md | cut -d'=' -f2 | tr -d ' ')
export CLOUDFLARE_ACCOUNT_ID=$(grep "CLOUDFLARE_ACCOUNT_ID" SOCRAM.md | cut -d'=' -f2 | tr -d ' ')
```

---

## Step 2: Authenticate CLI Tools

### GitHub CLI

```bash
# Authenticate with token
echo $GITHUB_TOKEN | gh auth login --with-token

# Verify authentication
gh auth status

# Expected output:
# ✓ Logged in to github.com as <username>
```

### Wrangler CLI

```bash
# Wrangler uses environment variables (no separate login needed)
# Verify by listing D1 databases
wrangler d1 list

# If successful, you'll see a list (may be empty initially)
```

---

## Step 3: Execute Tasks Sequentially

### Task Execution Order

Follow the phase order in `tasks.md`:

1. **Phase 1:** Project Setup & Infrastructure (T1.1 - T1.6)
2. **Phase 2:** Backend - Authentication System (T2.1 - T2.7)
3. **Phase 3:** Backend - Vault API (T3.1 - T3.7)
4. **Phase 4:** Backend - Subscriptions API (T4.1 - T4.4)
5. **Phase 5:** Frontend - Project Setup (T5.1 - T5.3)
6. **Phase 6:** Frontend - Crypto Utilities (T6.1 - T6.5)
7. **Phase 7:** Frontend - State Management (T7.1 - T7.3)
8. **Phase 8:** Frontend - IndexedDB (T8.1 - T8.3)
9. **Phase 9:** Frontend - Authentication UI (T9.1 - T9.3)
10. **Phase 10:** Frontend - Vault UI (T10.1 - T10.4)
11. **Phase 11:** Frontend - Subscription Dashboard UI (T11.1 - T11.8)
12. **Phase 12:** Testing & Validation (T12.1 - T12.5)
13. **Phase 13:** Deployment & Launch (T13.1 - T13.4)

### Task Execution Pattern

For each task:

1. **Read task details** from `tasks.md`
2. **Check "Autonomous" status**:
   - ✅ Yes → Execute fully
   - ⚠️ Manual → Create instructions for human, flag for intervention
3. **Execute steps** listed in task
4. **Validate** using acceptance criteria
5. **Mark checkbox** as complete: `- [x]`
6. **Commit progress** to git
7. **Move to next task**

---

## Step 4: Handle Manual Steps

### Manual Step 1: DNS Configuration (T13.1)

**When you reach this task:**

1. Create `docs/dns-setup.md` with exact instructions
2. Include Cloudflare Pages URL (get from `wrangler pages project list`)
3. Flag for human intervention with clear instructions
4. Wait for human confirmation before proceeding
5. After confirmation, test domain resolution

**Template for human:**
```
⚠️ MANUAL ACTION REQUIRED

Task: T13.1 - Configure Custom Domain

Please complete the following in Cloudflare Dashboard:

1. Go to: https://dash.cloudflare.com/<account-id>/codavibe.dev/dns
2. Add CNAME record:
   - Name: secrets
   - Target: <pages-url>.pages.dev
   - Proxy: Enabled (orange cloud)
3. Go to: https://dash.cloudflare.com/<account-id>/codavibe.dev/ssl-tls
4. Set SSL/TLS mode to: Full (strict)

Reply "DONE" when completed.
```

### Manual Step 2: User Testing (T13.3)

**When you reach this task:**

1. Create `docs/testing-guide.md` with detailed test scenarios
2. Provide founder with testing checklist
3. Monitor for bug reports
4. Fix bugs autonomously and redeploy
5. Wait for founder confirmation of successful testing

---

## Step 5: Continuous Integration

### Automatic Deployment

After Phase 1 (T1.6), every push to `main` triggers:

1. **Frontend deployment** (if frontend/** changed)
2. **Backend deployment** (if backend/** changed)
3. **D1 migrations** (if migrations/** changed)

**Monitor deployments:**
```bash
# Watch GitHub Actions
gh run watch

# Check Cloudflare Pages deployments
wrangler pages deployment list

# Check Worker deployments
wrangler deployments list
```

### Testing After Each Phase

Run tests after completing each phase:

```bash
# Backend tests
cd backend
pnpm test

# Frontend tests
cd frontend
pnpm test

# E2E tests (after Phase 11)
cd frontend
pnpm test:e2e
```

---

## Step 6: Progress Tracking

### Update Task Checkboxes

After completing each task, update `tasks.md`:

```bash
# Mark task as complete
# Change: - [ ] Task description
# To:     - [x] Task description

git add .kiro/specs/secrets-manager/tasks.md
git commit -m "Complete T1.1: Initialize GitHub Repository"
git push origin main
```

### Document Decisions

If you make any implementation decisions not specified in the spec:

1. Create `docs/decisions/YYYYMMDD-decision-title.md`
2. Document: Context, Decision, Rationale, Consequences
3. Commit to repository

---

## Step 7: Error Handling

### If a Task Fails

1. **Analyze error** - Read error message carefully
2. **Check credentials** - Verify SOCRAM.md values are correct
3. **Check dependencies** - Ensure all packages installed
4. **Retry** - Some operations may be transient failures
5. **Document issue** - Create `docs/issues/YYYYMMDD-issue-title.md`
6. **Flag for human** - If unresolvable, request human intervention

### Common Issues

**GitHub CLI authentication fails:**
```bash
# Re-authenticate
gh auth logout
echo $GITHUB_TOKEN | gh auth login --with-token
```

**Wrangler commands fail:**
```bash
# Verify environment variables
echo $CLOUDFLARE_API_TOKEN
echo $CLOUDFLARE_ACCOUNT_ID

# Re-export if needed
export CLOUDFLARE_API_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" SOCRAM.md | cut -d'=' -f2 | tr -d ' ')
```

**Package installation fails:**
```bash
# Clear cache and retry
pnpm store prune
pnpm install
```

---

## Step 8: Validation & Testing

### After Each Phase

Run validation checks:

```bash
# Lint code
pnpm run lint

# Type check
pnpm run type-check

# Run tests
pnpm test

# Check build
pnpm run build
```

### Before Deployment (Phase 13)

Run comprehensive checks:

```bash
# Backend
cd backend
pnpm test
pnpm run build
wrangler deploy --dry-run

# Frontend
cd frontend
pnpm test
pnpm test:e2e
pnpm run build

# Security checks
pnpm audit
```

---

## Step 9: Documentation

### Generate Documentation

After completing implementation:

1. **Architecture docs** - `docs/architecture.md`
2. **API reference** - `docs/api-reference.md`
3. **Security model** - `docs/security-model.md`
4. **Deployment guide** - `docs/deployment.md`
5. **Development guide** - `docs/development.md`

### Update README.md

Include:
- Project overview
- Features
- Tech stack
- Quick start
- Links to detailed docs

---

## Step 10: Completion Checklist

Before marking project as complete:

- [x] All 76 autonomous tasks completed
- [x] All tests passing (unit + E2E)
- [x] Documentation generated
- [x] Deployed to production
- [x] DNS configured (manual step)
- [x] Founder testing completed (manual step)
- [x] No critical bugs
- [x] Performance targets met
- [x] Security audit passed

---

## Quick Reference: Key Commands

### GitHub
```bash
gh auth login --with-token
gh repo create <name> --public --source=. --push
gh secret set <name> --body "<value>"
gh run watch
```

### Wrangler
```bash
wrangler d1 create <name>
wrangler d1 migrations apply <name> --remote
wrangler kv:namespace create <name>
wrangler secret put <name>
wrangler deploy
```

### Package Management
```bash
pnpm install
pnpm add <package>
pnpm test
pnpm run build
```

### Git
```bash
git add .
git commit -m "message"
git push origin main
```

---

## Support

If you encounter issues beyond your autonomous capabilities:

1. Document the issue in `docs/issues/`
2. Flag for human intervention with clear description
3. Provide context: what you tried, error messages, relevant logs
4. Suggest potential solutions if possible

---

## Success Criteria

**Project is complete when:**

1. ✅ All 76 autonomous tasks executed successfully
2. ✅ Application deployed to https://secrets.codavibe.dev
3. ✅ All tests passing
4. ✅ Documentation complete
5. ✅ Founder can use application daily without errors

**Estimated Timeline:** 4-6 weeks (no rush, quality over speed)

---

## Notes for Future AI Agents

- **Read SOCRAM.md first** - All credentials are there
- **Follow task order** - Dependencies exist between phases
- **Test frequently** - Don't wait until the end
- **Document decisions** - Help future agents understand your choices
- **Ask for help** - Flag manual steps clearly
- **Be thorough** - This is a security-critical application

**Good luck! 🚀**
