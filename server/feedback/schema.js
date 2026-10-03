export function migrateFeedback(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS visitor_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            username TEXT NOT NULL, email TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('experience','bug','music','rights','other')),
            body TEXT NOT NULL DEFAULT '', song TEXT NOT NULL DEFAULT '', artist TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
            is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
            created_at INTEGER NOT NULL, read_at INTEGER,
            mail_status TEXT NOT NULL DEFAULT 'pending' CHECK(mail_status IN ('pending','sending','sent','failed')),
            mail_attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_user_time ON visitor_feedback(user_id,created_at);
        CREATE INDEX IF NOT EXISTS idx_feedback_status ON visitor_feedback(is_read,created_at);
        CREATE INDEX IF NOT EXISTS idx_feedback_mail ON visitor_feedback(mail_status,retry_at);
        CREATE TABLE IF NOT EXISTS feedback_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            feedback_id INTEGER NOT NULL REFERENCES visitor_feedback(id) ON DELETE CASCADE,
            filename TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL
        );
    `);
}
