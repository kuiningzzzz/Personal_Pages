// Update every ancestor explicitly; SQLite's recursive_triggers setting should
// not determine how far a content modification travels through a collection.
export function migrateResourceModifications(db) {
    db.exec('CREATE TABLE IF NOT EXISTS resource_modification_meta (key TEXT PRIMARY KEY)');
    db.transaction(() => {
        if (!db.prepare("SELECT key FROM resource_modification_meta WHERE key='ancestor-times'").get()) {
            db.exec(`WITH RECURSIVE branch(root,id) AS (
                SELECT id,id FROM entries WHERE kind='resource' AND resource_kind='collection'
                UNION SELECT branch.root,child.id FROM entries child JOIN branch ON child.parent_id=branch.id WHERE child.kind='resource'
            ) UPDATE entries SET updated_at=(SELECT e.updated_at FROM branch JOIN entries e ON e.id=branch.id WHERE branch.root=entries.id ORDER BY julianday(e.updated_at) DESC LIMIT 1)
              WHERE id IN (SELECT root FROM branch);
              INSERT INTO resource_modification_meta VALUES ('ancestor-times');`);
        }
        const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
        const touch = (parent, timestamp) => `UPDATE entries SET updated_at=${timestamp}
            WHERE kind='resource' AND resource_kind='collection' AND julianday(updated_at) < julianday(${timestamp})
            AND id IN (WITH RECURSIVE ancestors(id,parent_id) AS (
                SELECT id,parent_id FROM entries WHERE id=${parent}
                UNION SELECT e.id,e.parent_id FROM entries e JOIN ancestors a ON e.id=a.parent_id
            ) SELECT id FROM ancestors);`;
        db.exec(`CREATE TRIGGER IF NOT EXISTS resource_modification_insert AFTER INSERT ON entries
            WHEN NEW.kind='resource' AND NEW.parent_id IS NOT NULL BEGIN ${touch('NEW.parent_id', 'NEW.updated_at')} END;
            CREATE TRIGGER IF NOT EXISTS resource_modification_update AFTER UPDATE OF updated_at ON entries
            WHEN NEW.kind='resource' AND OLD.updated_at IS NOT NEW.updated_at
            BEGIN ${touch('NEW.parent_id', 'NEW.updated_at')} END;
            CREATE TRIGGER IF NOT EXISTS resource_modification_move AFTER UPDATE OF parent_id ON entries
            WHEN NEW.kind='resource' AND OLD.parent_id IS NOT NEW.parent_id
            BEGIN ${touch('OLD.parent_id', now)} ${touch('NEW.parent_id', now)} END;
            CREATE TRIGGER IF NOT EXISTS resource_modification_delete BEFORE DELETE ON entries
            WHEN OLD.kind='resource' AND OLD.parent_id IS NOT NULL BEGIN ${touch('OLD.parent_id', now)} END;`);
    })();
}
