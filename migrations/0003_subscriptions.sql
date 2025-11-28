-- Migration: 0003_subscriptions.sql
-- Description: Create subscriptions table for subscription tracking

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    cost REAL NOT NULL CHECK(cost > 0),
    currency TEXT NOT NULL CHECK(currency IN ('USD', 'CAD', 'EUR')),
    billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'yearly', 'custom')),
    billing_cycle_days INTEGER,
    next_renewal INTEGER NOT NULL,
    payment_method TEXT,
    start_date INTEGER NOT NULL,
    tier TEXT,
    is_trial INTEGER NOT NULL DEFAULT 0,
    trial_end_date INTEGER,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for fetching user's subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- Index for upcoming renewals query
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_renewal ON subscriptions(next_renewal);

-- Index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_deleted ON subscriptions(is_deleted);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_deleted ON subscriptions(user_id, is_deleted);

-- Index for trial subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_trial ON subscriptions(is_trial);
