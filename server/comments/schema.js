export function migrateComments(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS entry_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            root_id INTEGER REFERENCES entry_comments(id) ON DELETE CASCADE,
            reply_to_id INTEGER REFERENCES entry_comments(id) ON DELETE SET NULL,
            reply_to_name TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL,
            reports_muted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comments_entry_root ON entry_comments(entry_id, root_id, created_at);
        CREATE TABLE IF NOT EXISTS comment_likes (
            comment_id INTEGER NOT NULL REFERENCES entry_comments(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY(comment_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS comment_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER REFERENCES entry_comments(id) ON DELETE SET NULL,
            reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
            author_name TEXT NOT NULL, author_email TEXT NOT NULL, body TEXT NOT NULL,
            entry_title TEXT NOT NULL, entry_path TEXT NOT NULL,
            reasons TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
            action TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, resolved_at TEXT,
            UNIQUE(comment_id, reporter_id)
        );
        CREATE INDEX IF NOT EXISTS idx_reports_status ON comment_reports(status, created_at);
        CREATE TABLE IF NOT EXISTS discussion_mail_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK (kind IN ('reply','report')),
            comment_id INTEGER REFERENCES entry_comments(id) ON DELETE CASCADE,
            report_id INTEGER REFERENCES comment_reports(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','failed')),
            attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
            lease_until INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_discussion_queue ON discussion_mail_queue(status,retry_at);
        CREATE TABLE IF NOT EXISTS discussion_mail_state (
            key TEXT PRIMARY KEY, last_sent_at INTEGER NOT NULL DEFAULT 0, reserved_until INTEGER NOT NULL DEFAULT 0
        );
    `);
}
