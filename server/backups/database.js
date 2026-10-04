import { randomUUID } from 'node:crypto';

export const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const internal = new Set(['backup_records', 'backup_aliases', 'backup_state']);
export function initializeBackupDb(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS backup_records(table_name TEXT NOT NULL,row_key TEXT NOT NULL,identity TEXT NOT NULL UNIQUE,marker TEXT NOT NULL,PRIMARY KEY(table_name,row_key));
        CREATE TABLE IF NOT EXISTS backup_aliases(identity TEXT PRIMARY KEY,table_name TEXT NOT NULL,row_key TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS backup_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)`);
}
export function schema(db) {
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
        .filter(r => !internal.has(r.name)).map(({ name }) => [name, {
            columns: db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(r => ({ name: r.name, type: r.type, pk: r.pk, notnull: r.notnull })),
            foreign: db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().map(r => ({ from: r.from, table: r.table, to: r.to }))
        }]));
}
const keys = info => info.columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
const rowKey = (info, row) => JSON.stringify(keys(info).map(c => row[c]));
function identity(db, table, info, row) {
    const key = rowKey(info, row), marker = String(row.created_at ?? '');
    let stored = db.prepare('SELECT * FROM backup_records WHERE table_name=? AND row_key=?').get(table, key);
    if (!stored || stored.marker !== marker) {
        stored = { identity: randomUUID() };
        db.prepare('INSERT INTO backup_records VALUES(?,?,?,?) ON CONFLICT(table_name,row_key) DO UPDATE SET identity=excluded.identity,marker=excluded.marker').run(table, key, stored.identity, marker);
    }
    return stored.identity;
}
export function snapshot(db) {
    initializeBackupDb(db);
    const layout = schema(db), tables = {};
    for (const [table, info] of Object.entries(layout)) {
        if (!keys(info).length) throw new Error(`数据表 ${table} 缺少主键，无法备份`);
        tables[table] = db.prepare(`SELECT * FROM ${quote(table)}`).all().map(row => ({ identity: identity(db, table, info, row), values: { ...row } }));
    }
    const existingKeys = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, new Set(rows.map(r => rowKey(layout[name], r.values)))]));
    const aliases = db.prepare('SELECT * FROM backup_aliases').all().filter(r => existingKeys[r.table_name]?.has(r.row_key));
    return { schema: layout, tables, aliases, sequences: db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get() ? db.prepare('SELECT * FROM sqlite_sequence').all() : [] };
}
export function validateSnapshot(db, dump) {
    if (!dump || JSON.stringify(schema(db)) !== JSON.stringify(dump.schema) || !dump.tables || JSON.stringify(Object.keys(dump.tables).sort()) !== JSON.stringify(Object.keys(dump.schema).sort())) throw new Error('备份的数据结构与当前网站版本不兼容');
    const identities = new Set();
    for (const [table, rows] of Object.entries(dump.tables)) {
        if (!Array.isArray(rows)) throw new Error('备份数据库内容无效');
        const names = dump.schema[table].columns.map(c => c.name).sort(), seen = new Set();
        for (const item of rows) {
            if (!item || typeof item.identity !== 'string' || !/^[a-f0-9-]{36}$/.test(item.identity) || identities.has(item.identity) || !item.values || JSON.stringify(Object.keys(item.values).sort()) !== JSON.stringify(names)) throw new Error('备份包含无效或重复的数据记录');
            identities.add(item.identity);
            if (Object.values(item.values).some(v => v !== null && typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v)))) throw new Error('备份包含不支持的数据类型');
            const key = rowKey(dump.schema[table], item.values);
            if (seen.has(key)) throw new Error('备份包含重复主键'); seen.add(key);
        }
    }
    for (const alias of dump.aliases || []) if (!dump.tables[alias.table_name]?.some(r => rowKey(dump.schema[alias.table_name], r.values) === alias.row_key) || !/^[a-f0-9-]{36}$/.test(alias.identity)) throw new Error('备份的数据标识无效');
}
function triggers(db, namespace = 'main') {
    return db.prepare(`SELECT name,sql FROM ${quote(namespace)}.sqlite_master WHERE type='trigger'`).all();
}
export function withoutTriggers(db, namespace, work) {
    const saved = triggers(db, namespace);
    for (const r of saved) db.exec(`DROP TRIGGER ${quote(namespace)}.${quote(r.name)}`);
    try { return work(); }
    finally { for (const r of saved) db.exec(namespace === 'main' ? r.sql : r.sql.replace(/^(CREATE\s+TRIGGER\s+(?:IF NOT EXISTS\s+)?)([^\s]+)/i, `$1${quote(namespace)}.$2`)); }
}
function insert(db, table, row, namespace = 'main') {
    const columns = Object.keys(row);
    return db.prepare(`INSERT INTO ${quote(namespace)}.${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(c => row[c]));
}
export function overwrite(db, dump, namespace = 'main') {
    withoutTriggers(db, namespace, () => {
        for (const table of Object.keys(dump.tables)) db.exec(`DELETE FROM ${quote(namespace)}.${quote(table)}`);
        db.exec(`DELETE FROM ${quote(namespace)}.backup_records`);
        db.exec(`DELETE FROM ${quote(namespace)}.backup_aliases`);
        for (const [table, rows] of Object.entries(dump.tables)) for (const { identity: uuid, values } of rows) {
            insert(db, table, values, namespace);
            db.prepare(`INSERT INTO ${quote(namespace)}.backup_records VALUES(?,?,?,?)`).run(table, rowKey(dump.schema[table], values), uuid, String(values.created_at ?? ''));
        }
        for (const alias of dump.aliases || []) db.prepare(`INSERT INTO ${quote(namespace)}.backup_aliases VALUES(?,?,?)`).run(alias.identity, alias.table_name, alias.row_key);
        if (db.prepare(`SELECT name FROM ${quote(namespace)}.sqlite_master WHERE name='sqlite_sequence'`).get()) {
            db.exec(`DELETE FROM ${quote(namespace)}.sqlite_sequence`);
            for (const r of dump.sequences || []) if (dump.tables[r.name] && Number.isSafeInteger(r.seq) && r.seq >= 0) db.prepare(`INSERT INTO ${quote(namespace)}.sqlite_sequence(name,seq) VALUES(?,?)`).run(r.name, r.seq);
        }
    });
}

const implicit = {
    ai_tasks: [{ from: 'collection_id', table: 'entries', to: 'id', optional: true }, { from: 'result_entry_id', table: 'entries', to: 'id', optional: 'null' }],
    subscriptions: [{ from: 'target_id', table: 'entries', to: 'id', when: row => row.scope === 'collection' }, { from: 'target_id', table: 'resource_types', to: 'id', when: row => row.scope === 'resource-type' }, { from: 'event_cursor', table: 'subscription_events', to: 'id', optional: true }]
};
const singleton = new Set(['profile', 'home_welcome']);
// Incremental import follows stable record identities, then natural unique keys.
// Numeric IDs are allocated afresh, and all relationships follow the resulting map.
export function merge(db, dump, rewrite = value => value) {
    const current = snapshot(db), maps = {}, pending = new Set(), added = new Set();
    let count = 0, skipped = 0;
    const uuidRows = new Map();
    for (const [table, rows] of Object.entries(current.tables)) for (const r of rows) uuidRows.set(r.identity, { table, row: r.values });
    for (const alias of current.aliases) {
        const row = current.tables[alias.table_name]?.find(r => rowKey(current.schema[alias.table_name], r.values) === alias.row_key);
        if (row) uuidRows.set(alias.identity, { table: alias.table_name, row: row.values });
    }
    for (const table of Object.keys(dump.tables)) maps[table] = new Map();
    function resolve(table, value, column = 'id', optional = false) {
        if (value == null || value === 0) return value;
        const item = dump.tables[table]?.find(r => r.values[column] === value);
        if (!item) { if (optional) return optional === 'null' ? null : 0; throw new Error(`备份中的 ${table} 引用不存在`); }
        return importRow(table, item)[column];
    }
    function importRow(table, item) {
        const info = dump.schema[table], key = rowKey(info, item.values), cached = maps[table].get(key);
        if (cached) return cached;
        const match = uuidRows.get(item.identity);
        if (match && match.table === table) { maps[table].set(key, match.row); skipped++; return match.row; }
        const token = `${table}:${key}`;
        if (pending.has(token)) throw new Error('备份中存在循环数据引用'); pending.add(token);
        const row = { ...item.values };
        for (const fk of [...info.foreign, ...(implicit[table] || [])]) if (!fk.when || fk.when(row)) row[fk.from] = resolve(fk.table, row[fk.from], fk.to, fk.optional);
        if (table === 'entries' && row.parent_id) row.resource_type_id = db.prepare('SELECT resource_type_id FROM entries WHERE id=?').get(row.parent_id).resource_type_id;
        if (table === 'entry_comments' && row.reply_to_id) row.reply_to_name = db.prepare('SELECT u.username FROM entry_comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(row.reply_to_id)?.username || row.reply_to_name;
        // At this point collection/task identities exist; rewrite URLs and workspace references.
        for (const c of Object.keys(row)) if (typeof row[c] === 'string') row[c] = rewrite(row[c], maps, table, c);
        const primary = keys(info);
        let existing;
        if (singleton.has(table)) existing = db.prepare(`SELECT * FROM ${quote(table)} WHERE id=?`).get(row.id);
        const unique = db.prepare(`PRAGMA index_list(${quote(table)})`).all().filter(i => i.unique && !i.partial && i.origin !== 'pk').map(i => db.prepare(`PRAGMA index_info(${quote(i.name)})`).all().map(c => c.name)).filter(cols => cols.every(Boolean));
        if (table === 'users') {
            existing ||= db.prepare('SELECT * FROM users WHERE email=?').get(row.email);
            if (!existing && db.prepare('SELECT id FROM users WHERE username_key=?').get(row.username_key)) { row.username += `_${item.identity.slice(0, 8)}`; row.username_key += `_${item.identity.slice(0, 8)}`; }
            if (row.is_owner && db.prepare('SELECT id FROM users WHERE is_owner=1').get()) row.is_owner = 0;
        }
        if (!existing) for (const cols of unique) {
            if (table === 'users' || cols.some(c => row[c] === null)) continue;
            existing = db.prepare(`SELECT * FROM ${quote(table)} WHERE ${cols.map(c => `${quote(c)}=?`).join(' AND ')}`).get(...cols.map(c => row[c]));
            if (existing) break;
        }
        const integerId = primary.length === 1 && primary[0] === 'id' && info.columns.find(c => c.name === 'id').type === 'INTEGER' && !info.foreign.some(f => f.from === 'id');
        if (!existing && !integerId) {
            existing = db.prepare(`SELECT * FROM ${quote(table)} WHERE ${primary.map(c => `${quote(c)}=?`).join(' AND ')}`).get(...primary.map(c => row[c]));
            // Natural text and compound primary keys identify the same entity.
        }
        if (!existing && integerId) {
            const cols = Object.keys(row).filter(c => c !== 'id' && c !== 'updated_at');
            existing = db.prepare(`SELECT * FROM ${quote(table)} WHERE ${cols.map(c => `${quote(c)} IS ?`).join(' AND ')}`).get(...cols.map(c => row[c]));
        }
        if (existing) { maps[table].set(key, { ...existing }); db.prepare('INSERT OR REPLACE INTO backup_aliases VALUES(?,?,?)').run(item.identity, table, rowKey(info, existing)); skipped++; }
        else {
            if (integerId) delete row.id;
            if (row.pinned && (table === 'announcements' || table === 'entries')) {
                const clause = table === 'entries' ? "kind='moment' AND " : '';
                if (Number(db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)} WHERE ${clause}pinned=1`).get().n) >= (table === 'entries' ? 5 : 2)) row.pinned = 0;
            }
            const result = insert(db, table, row);
            if (integerId) row.id = Number(result.lastInsertRowid);
            maps[table].set(key, row); added.add(token); count++;
            db.prepare('INSERT OR REPLACE INTO backup_records VALUES(?,?,?,?)').run(table, rowKey(info, row), item.identity, String(row.created_at ?? ''));
        }
        pending.delete(token); return maps[table].get(key);
    }
    withoutTriggers(db, 'main', () => {
        for (const [table, rows] of Object.entries(dump.tables)) for (const r of rows) importRow(table, r);
        for (const alias of dump.aliases || []) {
            const target = maps[alias.table_name]?.get(alias.row_key);
            if (target) db.prepare('INSERT OR IGNORE INTO backup_aliases VALUES(?,?,?)').run(alias.identity, alias.table_name, rowKey(dump.schema[alias.table_name], target));
        }
        if (dump.tables.user_blacklist) db.exec('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email IN (SELECT email FROM user_blacklist))');
    });
    return { count, skipped, maps, added };
}
export function neutralizeImportedJobs(dump) {
    // Restoring history must not replay old emails or start a paid model request.
    for (const { values: r } of dump.tables.ai_tasks || []) if (['running', 'queued'].includes(r.status)) { r.status = 'cancelled'; r.error = '从备份导入的未完成任务已暂停，请手动重新学习'; }
    for (const { values: r } of dump.tables.subscription_events || []) r.prepared = 1;
    for (const name of ['subscription_deliveries', 'discussion_mail_queue']) for (const { values: r } of dump.tables[name] || []) if (['pending', 'sending'].includes(r.status)) r.status = 'skipped';
    for (const { values: r } of dump.tables.visitor_feedback || []) if (['pending', 'sending'].includes(r.mail_status)) r.mail_status = 'failed';
}
