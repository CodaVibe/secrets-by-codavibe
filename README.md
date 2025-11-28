# Secrets by Codavibe

A zero-knowledge password manager and subscription dashboard for solo developers.

## Features

- **Zero-Knowledge Architecture**: Your master password never leaves your device
- **Hierarchical Vault**: Organize credentials by service (passwords, API keys, secrets)
- **Subscription Dashboard**: Track spending, renewals, and visualize costs
- **Offline-First**: Works offline with IndexedDB caching
- **End-to-End Encryption**: AES-256-GCM encryption, client-side only

## Tech Stack

- **Frontend**: Svelte 5, Tailwind CSS 4, Vite
- **Backend**: Cloudflare Workers, Hono
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV (rate limiting)
- **Crypto**: @noble/hashes, @noble/ciphers

## Security

- Argon2id key derivation (300-500ms adaptive)
- 24-word BIP39 seed phrase for account recovery
- AES-256-GCM encryption for all credentials
- Zero plaintext data transmitted to server
- CSP with Trusted Types enabled

## Deployment

Automatically deployed via GitHub Actions:
- Frontend → Cloudflare Pages
- Backend → Cloudflare Workers

## License

Private - Codavibe
