# Secrets Management

This document describes the secret management strategy for Secrets by Codavibe.

## Overview

The application uses Cloudflare Worker Secrets to store sensitive configuration values that should never be exposed in code or version control.

## Configured Secrets

### PEPPER

- **Purpose:** Server-side secret used to hash AuthHash before storage (AuthVerifier)
- **Type:** Base64-encoded random string (32 bytes)
- **Location:** Cloudflare Worker Secret
- **Rotation:** Should be rotated periodically; requires re-hashing all AuthVerifiers

## Security Properties

1. **Zero-Knowledge Architecture:** The PEPPER ensures that even if the database is compromised, AuthHash values cannot be reversed without the server-side secret.

2. **Defense in Depth:** Combined with client-side Argon2id hashing, provides multiple layers of protection.

3. **Isolation:** Secrets are stored in Cloudflare's secure infrastructure, separate from application code and database.

## Managing Secrets

### Viewing Secrets (names only)

```bash
cd backend
wrangler secret list
```

### Adding/Updating a Secret

```bash
# Generate a new secret
PEPPER=$(openssl rand -base64 32)

# Set the secret
echo $PEPPER | wrangler secret put PEPPER
```

### Rotating the PEPPER

⚠️ **Warning:** Rotating the PEPPER requires re-hashing all existing AuthVerifiers in the database.

1. Generate new PEPPER value
2. Run migration script to re-hash all AuthVerifiers with new PEPPER
3. Update the Worker secret
4. Deploy updated Worker

## Environment Variables

The following environment variables are used for Wrangler CLI authentication:

- `CLOUDFLARE_API_TOKEN` - API token with Workers edit permissions
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account identifier

These are stored in GitHub Secrets for CI/CD and should never be committed to version control.

## Best Practices

1. **Never log secrets** - Ensure application code never logs secret values
2. **Use environment variables** - Access secrets via `env.PEPPER` in Worker code
3. **Rotate periodically** - Establish a rotation schedule for production secrets
4. **Audit access** - Monitor who has access to secret management
5. **Separate environments** - Use different secrets for development/staging/production
