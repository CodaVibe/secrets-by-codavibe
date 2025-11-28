# Deployment Guide

This document describes the CI/CD setup for Secrets by Codavibe.

## Overview

The application uses GitHub Actions for continuous deployment to Cloudflare infrastructure.

## GitHub Secrets

The following secrets are configured in the repository for CI/CD:

| Secret Name | Purpose |
|-------------|---------|
| `CLOUDFLARE_API_TOKEN` | API token for Wrangler CLI authentication |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier |

## Deployment Workflows

### Backend Deployment

- **Trigger:** Push to `main` branch with changes in `backend/**`
- **Target:** Cloudflare Workers
- **Command:** `wrangler deploy`

### Frontend Deployment

- **Trigger:** Push to `main` branch with changes in `frontend/**`
- **Target:** Cloudflare Pages
- **Command:** `wrangler pages deploy`

## Manual Deployment

### Backend

```bash
cd backend
export CLOUDFLARE_API_TOKEN="<token>"
export CLOUDFLARE_ACCOUNT_ID="<account-id>"
wrangler deploy
```

### Frontend

```bash
cd frontend
pnpm build
wrangler pages deploy dist --project-name=secrets-by-codavibe
```

## Environment Configuration

### Production

- Worker: `secrets-api`
- D1 Database: `secrets-db`
- KV Namespace: `RATE_LIMIT`
- Domain: `secrets.codavibe.dev`

## Rollback

To rollback a deployment:

```bash
# List recent deployments
wrangler deployments list

# Rollback to specific version
wrangler rollback <deployment-id>
```

## Monitoring

- View logs: `wrangler tail`
- Check deployment status: GitHub Actions tab
- Cloudflare Dashboard for metrics and analytics
