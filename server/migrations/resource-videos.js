// SQLite cannot widen a CHECK constraint in place. Rebuild the table inside a
// transaction, with foreign-key actions disabled so comments/assets survive.
export function migrateResourceVideos(db) {
    const definition = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='entries'").get().sql;
    const constraint = /resource_kind\s+IN\s*\(([^)]*)\)/i;
    const match = definition.match(constraint);
    if (match && !/'video'/i.test(match[1])) {
        const foreignKeys = db.prepare('PRAGMA foreign_keys').get().foreign_keys;
        const legacy = db.prepare('PRAGMA legacy_alter_table').get().legacy_alter_table;
        const dependencies = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='entries' AND type IN ('index','trigger') AND sql IS NOT NULL").all();
        const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='entries'").get()?.seq;
        const columns = db.prepare('PRAGMA table_info(entries)').all().map(column => `"${column.name.replaceAll('"', '""')}"`).join(',');
        const sql = definition.replace(constraint, `resource_kind IN (${match[1]}, 'video')`)
            .replace(/^CREATE TABLE\s+(?:"entries"|entries)\s*\(/i, 'CREATE TABLE entries_video_upgrade (');
        db.exec('PRAGMA foreign_keys=OFF; PRAGMA legacy_alter_table=ON');
        try {
            db.transaction(() => {
                db.exec(sql);
                db.exec(`INSERT INTO entries_video_upgrade (${columns}) SELECT ${columns} FROM entries`);
                db.exec('DROP TABLE entries; ALTER TABLE entries_video_upgrade RENAME TO entries');
                for (const item of dependencies) db.exec(item.sql);
                if (sequence !== undefined) {
                    db.prepare("DELETE FROM sqlite_sequence WHERE name='entries'").run();
                    db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run('entries', sequence);
                }
                if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('视频资源升级时发现无效的数据关联，已撤销升级');
            })();
        } finally {
            db.exec(`PRAGMA legacy_alter_table=${legacy}; PRAGMA foreign_keys=${foreignKeys}`);
        }
    }
    if (!db.prepare('PRAGMA table_info(entries)').all().some(column => column.name === 'video_url')) {
        db.exec("ALTER TABLE entries ADD COLUMN video_url TEXT NOT NULL DEFAULT ''");
    }
}
