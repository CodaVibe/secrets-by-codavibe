-- Migration: 0002_vault.sql
-- Description: Create services and credentials tables for vault storage

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for fetching user's services
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);

-- Index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_services_is_deleted ON services(is_deleted);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_services_user_deleted ON services(user_id, is_deleted);

CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('password', 'api_key', 'secret_key', 'public_key', 'access_token', 'private_key', 'custom')),
    label TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for fetching credentials by service
CREATE INDEX IF NOT EXISTS idx_credentials_service_id ON credentials(service_id);

-- Index for fetching user's credentials
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);

-- Index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_credentials_is_deleted ON credentials(is_deleted);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_credentials_service_deleted ON credentials(service_id, is_deleted);
