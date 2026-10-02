import { resourceGraph, subscriptionKey, subscriptionMap } from './subscriptions/graph.js';

// Older broad subscription operations wrote identical collection overrides.
// Remove those redundant defaults on upgrade, preserving independent choices
// and cancellations. Otherwise a category subscription could follow a moved
// collection into a different root category.
function migrateSubscriptionDefaults(db) {
    const graph = resourceGraph(db);
    const collections = graph.rows.filter(row => row.resource_kind === 'collection')
        .sort((a, b) => graph.path(a).length - graph.path(b).length);
    for (const { user_id: userId } of db.prepare('SELECT DISTINCT user_id FROM subscriptions').all()) {
        const records = subscriptionMap(db.prepare('SELECT * FROM subscriptions WHERE user_id=?').all(userId));
        for (const row of collections) {
            const key = subscriptionKey('collection', row.id), own = records.get(key);
            if (!own) continue;
            const path = graph.path(row);
            let fallback = path.slice(1).map(node => records.get(subscriptionKey('collection', node.id))).find(Boolean);
            fallback ||= path.map(node => records.get(subscriptionKey('resource-type', node.resource_type_id))).find(Boolean);
            fallback ||= records.get(subscriptionKey('resource-all'));
            if (fallback && own.enabled === fallback.enabled && own.event_cursor === fallback.event_cursor) {
                db.prepare("DELETE FROM subscriptions WHERE user_id=? AND scope='collection' AND target_id=?").run(userId, row.id);
                records.delete(key);
            }
        }
    }
}

export function migrateResourceCategories(db) {
    db.exec('CREATE TABLE IF NOT EXISTS resource_category_meta (key TEXT PRIMARY KEY)');
    db.transaction(() => {
        if (!db.prepare("SELECT key FROM resource_category_meta WHERE key='root-categories'").get()) {
            migrateSubscriptionDefaults(db);
            db.exec(`WITH RECURSIVE tree(id, category) AS (
                SELECT id, resource_type_id FROM entries WHERE kind='resource' AND parent_id IS NULL
                UNION ALL SELECT child.id, tree.category FROM entries child JOIN tree ON child.parent_id=tree.id WHERE child.kind='resource'
            ) UPDATE entries SET resource_type_id=(SELECT category FROM tree WHERE tree.id=entries.id)
              WHERE id IN (SELECT id FROM tree) AND resource_type_id IS NOT (SELECT category FROM tree WHERE tree.id=entries.id);
              INSERT INTO resource_category_meta VALUES ('root-categories');`);
        }
        const category = `CASE WHEN NEW.parent_id IS NULL THEN NEW.resource_type_id
            ELSE (SELECT resource_type_id FROM entries WHERE id=NEW.parent_id) END`;
        const synchronize = `UPDATE entries SET resource_type_id=${category}
            WHERE id IN (WITH RECURSIVE branch(id) AS (
                SELECT NEW.id UNION SELECT child.id FROM entries child JOIN branch ON child.parent_id=branch.id WHERE child.kind='resource'
            ) SELECT id FROM branch) AND resource_type_id IS NOT (${category});`;
        db.exec(`CREATE TRIGGER IF NOT EXISTS resource_category_insert AFTER INSERT ON entries
            WHEN NEW.kind='resource' AND NEW.parent_id IS NOT NULL BEGIN ${synchronize} END;
            CREATE TRIGGER IF NOT EXISTS resource_category_update AFTER UPDATE OF resource_type_id, parent_id ON entries
            WHEN NEW.kind='resource' AND (OLD.parent_id IS NOT NEW.parent_id OR OLD.resource_type_id IS NOT NEW.resource_type_id)
            BEGIN ${synchronize} END;`);
    })();
}
