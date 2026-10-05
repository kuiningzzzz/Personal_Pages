export function migrateActivities(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS plaza_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK(kind IN ('activity','collection')),
        identifier TEXT UNIQUE, source TEXT NOT NULL DEFAULT 'package' CHECK(source IN ('package','external')),
        state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','preview','published')),
        parent_id INTEGER REFERENCES plaza_items(id) ON DELETE RESTRICT,
        title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',cover TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
        entry_label TEXT NOT NULL DEFAULT '进入活动',pause_music INTEGER NOT NULL DEFAULT 0,login_required INTEGER NOT NULL DEFAULT 0,
        schedule TEXT NOT NULL DEFAULT 'permanent' CHECK(schedule IN ('permanent','timed')), starts_at TEXT,ends_at TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,external_url TEXT NOT NULL DEFAULT '',backend_env TEXT NOT NULL DEFAULT '{}',
        published_version_id TEXT,preview_version_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plaza_versions (
        id TEXT PRIMARY KEY,item_id INTEGER NOT NULL REFERENCES plaza_items(id) ON DELETE CASCADE,
        version TEXT NOT NULL,manifest TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','preview','published','archived')),
        backend_enabled INTEGER NOT NULL DEFAULT 0,backend_port INTEGER,
        build_status TEXT NOT NULL DEFAULT 'pending',runtime_status TEXT NOT NULL DEFAULT 'stopped',
        error TEXT NOT NULL DEFAULT '',logs TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,UNIQUE(item_id,version)
    );
    CREATE TABLE IF NOT EXISTS plaza_tags(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE);
    CREATE INDEX IF NOT EXISTS idx_plaza_parent ON plaza_items(parent_id,display_order,id);
    CREATE INDEX IF NOT EXISTS idx_plaza_versions ON plaza_versions(item_id,created_at);
    `);
}
export function activityOpen(item, now = Date.now()) {
    return item.schedule === 'permanent' || (Date.parse(item.starts_at) <= now && now < Date.parse(item.ends_at));
}
