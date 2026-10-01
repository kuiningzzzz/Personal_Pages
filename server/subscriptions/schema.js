export function migrateSubscriptions(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scope TEXT NOT NULL CHECK (scope IN ('resource-all','resource-type','collection','moment-all','moment-short','moment-article')),
            target_id INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
            event_cursor INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, scope, target_id)
        );
        CREATE TABLE IF NOT EXISTS subscription_publications (
            entry_id INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS subscription_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL UNIQUE REFERENCES entries(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            prepared INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS subscription_deliveries (
            event_id INTEGER NOT NULL REFERENCES subscription_events(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','failed')),
            attempts INTEGER NOT NULL DEFAULT 0,
            retry_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (event_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_subscription_delivery_queue ON subscription_deliveries(status, retry_at);
        CREATE TABLE IF NOT EXISTS subscription_mail_state (
            email TEXT PRIMARY KEY,
            last_sent_at INTEGER NOT NULL DEFAULT 0,
            reserved_until INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS subscription_meta (key TEXT PRIMARY KEY);
    `);
    const publicCondition = alias => `${alias}.status = 'published' AND NOT EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, status, kind, resource_kind FROM entries WHERE id = ${alias}.parent_id
            UNION SELECT p.id, p.parent_id, p.status, p.kind, p.resource_kind FROM entries p JOIN ancestors a ON p.id = a.parent_id
        ) SELECT 1 FROM ancestors WHERE status != 'published' OR kind != 'resource' OR resource_kind != 'collection')`;
    // Install once, without sending emails for the existing public library.
    if (!db.prepare("SELECT key FROM subscription_meta WHERE key = 'initialized'").get()) {
        db.transaction(() => {
            db.exec(`INSERT OR IGNORE INTO subscription_publications SELECT e.id FROM entries e WHERE ${publicCondition('e')}`);
            db.exec("INSERT INTO subscription_meta VALUES ('initialized')");
        })();
    }
    const publish = `
        INSERT OR IGNORE INTO subscription_events (entry_id, created_at)
        SELECT e.id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM entries e
        WHERE e.id IN (WITH RECURSIVE subtree(id) AS (
            SELECT NEW.id UNION SELECT child.id FROM entries child JOIN subtree s ON child.parent_id = s.id
        ) SELECT id FROM subtree)
        AND ${publicCondition('e')}
        AND NOT EXISTS (SELECT 1 FROM subscription_publications p WHERE p.entry_id = e.id);
        INSERT INTO subscription_publications SELECT event.entry_id FROM subscription_events event
        WHERE NOT EXISTS (SELECT 1 FROM subscription_publications p WHERE p.entry_id = event.entry_id);
    `;
    db.exec(`
        CREATE TRIGGER IF NOT EXISTS subscription_entry_insert AFTER INSERT ON entries BEGIN ${publish} END;
        CREATE TRIGGER IF NOT EXISTS subscription_entry_release AFTER UPDATE OF status, parent_id, kind, resource_kind ON entries BEGIN ${publish} END;
        CREATE TRIGGER IF NOT EXISTS subscription_collection_delete BEFORE DELETE ON entries BEGIN
            DELETE FROM subscriptions WHERE scope = 'collection' AND target_id IN (
                WITH RECURSIVE subtree(id) AS (SELECT OLD.id UNION SELECT e.id FROM entries e JOIN subtree s ON e.parent_id = s.id)
                SELECT id FROM subtree
            );
        END;
        CREATE TRIGGER IF NOT EXISTS subscription_category_delete BEFORE DELETE ON resource_types BEGIN
            DELETE FROM subscriptions WHERE scope = 'resource-type' AND target_id = OLD.id;
            DELETE FROM subscriptions WHERE scope = 'collection' AND target_id IN (
                WITH RECURSIVE subtree(id) AS (
                    SELECT id FROM entries WHERE resource_type_id = OLD.id
                    UNION SELECT e.id FROM entries e JOIN subtree s ON e.parent_id = s.id
                ) SELECT id FROM subtree
            );
        END;
        CREATE TRIGGER IF NOT EXISTS subscription_collection_conversion AFTER UPDATE OF kind, resource_kind ON entries
        WHEN NEW.kind != 'resource' OR NEW.resource_kind != 'collection' BEGIN
            DELETE FROM subscriptions WHERE scope = 'collection' AND target_id = NEW.id;
        END;
    `);
}
