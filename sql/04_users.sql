-- =============================================================================
-- SEFA Grant Tracking Database — Application Users & Login Audit
-- Passwords are salted PBKDF2-HMAC-SHA256 hashes (see pcb_auth.py).
-- The algo/iterations columns allow per-user migration to stronger settings;
-- in production, application secrets move to Azure Key Vault while these
-- per-user hashes remain in the database (hashes are not secrets to vault).
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE app_user (
    user_id         INTEGER PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('grant_manager','finance_admin','viewer')),
    password_salt   TEXT NOT NULL,   -- hex, 16 random bytes per user
    password_hash   TEXT NOT NULL,   -- hex PBKDF2-HMAC-SHA256 output
    hash_algo       TEXT NOT NULL DEFAULT 'pbkdf2_sha256',
    hash_iterations INTEGER NOT NULL DEFAULT 200000,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_login      TEXT
);

-- Every login attempt, success or failure — part of the paper trail.
CREATE TABLE login_audit (
    login_audit_id INTEGER PRIMARY KEY,
    username       TEXT NOT NULL,
    success        INTEGER NOT NULL,
    client_addr    TEXT,
    attempted_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Same append-only protection as the expenditure audit log.
CREATE TRIGGER trg_login_audit_no_update
BEFORE UPDATE ON login_audit
BEGIN
    SELECT RAISE(ABORT, 'login audit is append-only');
END;

CREATE TRIGGER trg_login_audit_no_delete
BEFORE DELETE ON login_audit
BEGIN
    SELECT RAISE(ABORT, 'login audit is append-only');
END;
