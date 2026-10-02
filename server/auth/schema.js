export function migrateUsers(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            username_key TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);
        CREATE TABLE IF NOT EXISTS registration_codes (
            email TEXT PRIMARY KEY,
            nonce TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            sent_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            delivered INTEGER NOT NULL DEFAULT 0,
            purpose TEXT NOT NULL DEFAULT 'register' CHECK (purpose IN ('register', 'password-reset'))
        );
        CREATE TABLE IF NOT EXISTS user_auth_limits (
            key TEXT PRIMARY KEY,
            count INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_blacklist (
            email TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS blacklist_revoke_sessions AFTER INSERT ON user_blacklist BEGIN
            DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email = NEW.email);
        END;
    `);
    if (!db.pragma('table_info(users)').some(column => column.name === 'reply_notifications')) {
        db.exec('ALTER TABLE users ADD COLUMN reply_notifications INTEGER NOT NULL DEFAULT 1 CHECK (reply_notifications IN (0,1))');
    }
    if (!db.pragma('table_info(registration_codes)').some(column => column.name === 'purpose')) {
        db.exec("ALTER TABLE registration_codes ADD COLUMN purpose TEXT NOT NULL DEFAULT 'register' CHECK (purpose IN ('register', 'password-reset'))");
    }
}
