-- Migration: 0001_initial.sql
-- Description: Create users table with authentication fields

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    auth_verifier TEXT NOT NULL,
    auth_salt TEXT NOT NULL,
    kek_salt TEXT NOT NULL,
    wrapped_key TEXT NOT NULL,
    argon2_params TEXT NOT NULL DEFAULT '{"m":65536,"t":3,"p":4}',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for email lookups during login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for checking locked accounts
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);
