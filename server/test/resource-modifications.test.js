import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../sqlite.js';
import { migrateUsers } from '../auth/schema.js';
import { migrateSubscriptions } from '../subscriptions/schema.js';
import { migrateResourceCategories } from '../resource-categories.js';
import { migrateResourceModifications } from '../resource-modifications.js';

function fixture(t, recursive = false) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON'); db.pragma(`recursive_triggers = ${recursive ? 'ON' : 'OFF'}`);
    migrateUsers(db);
    db.exec(`CREATE TABLE resource_types(id INTEGER PRIMARY KEY,name TEXT);
        INSERT INTO resource_types VALUES(1,'学习'),(2,'工具');
        CREATE TABLE entries(id INTEGER PRIMARY KEY,kind TEXT DEFAULT 'resource',resource_kind TEXT DEFAULT 'document',
            parent_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,resource_type_id INTEGER REFERENCES resource_types(id) ON DELETE SET NULL,
            status TEXT DEFAULT 'published',format TEXT DEFAULT 'article',title TEXT DEFAULT '资源',
            created_at TEXT DEFAULT '2020-01-01T00:00:00.000Z',updated_at TEXT DEFAULT '2020-01-01T00:00:00.000Z');`);
    migrateSubscriptions(db); migrateResourceCategories(db);
    const insert = (id, parent = null, shape = 'document', status = 'published', updated = '2020-01-01T00:00:00.000Z') => db.prepare(
        'INSERT INTO entries(id,parent_id,resource_kind,status,resource_type_id,updated_at) VALUES(?,?,?,?,1,?)').run(id, parent, shape, status, updated);
    const time = id => db.prepare('SELECT updated_at FROM entries WHERE id=?').get(id).updated_at;
    const events = () => db.prepare('SELECT COUNT(*) AS n FROM subscription_events').get().n;
    t.after(() => db.close());
    return { db, insert, time, events };
}

for (const recursive of [false, true]) test(`深层草稿修改、新增和图集修改同步所有祖先；不发送修改通知（递归触发器 ${recursive}）`, t => {
    const f = fixture(t, recursive); migrateResourceModifications(f.db);
    f.insert(1, null, 'collection'); f.insert(2, 1, 'collection'); f.insert(3, 2, 'collection', 'draft'); f.insert(4, 3, 'gallery');
    const count = f.events();
    f.db.prepare("UPDATE entries SET title='修改',updated_at='2024-01-02T00:00:00.000Z' WHERE id=4").run();
    for (const id of [1, 2, 3, 4]) assert.equal(f.time(id), '2024-01-02T00:00:00.000Z');
    assert.equal(f.events(), count, '仅修改时间不能触发订阅通知');
    f.insert(5, 3, 'document', 'published', '2025-02-03T00:00:00.000Z');
    for (const id of [1, 2, 3]) assert.equal(f.time(id), '2025-02-03T00:00:00.000Z', 'AI 与普通新增共用数据库规则');
    assert.equal(f.events(), count, '草稿合集内新增仍不公开');
    f.db.prepare("UPDATE entries SET updated_at='2021-01-01T00:00:00.000Z' WHERE id=4").run();
    assert.equal(f.time(1), '2025-02-03T00:00:00.000Z', '祖先修改时间不倒退');
});

for (const recursive of [false, true]) test(`移动及删除更新原来和现在的合集，根创建时间保持不变（递归触发器 ${recursive}）`, t => {
    const f = fixture(t, recursive); migrateResourceModifications(f.db);
    f.insert(1, null, 'collection'); f.insert(2, 1, 'collection'); f.insert(3, 2);
    f.insert(10, null, 'collection'); f.insert(11, 10, 'collection');
    // Compare against SQLite's clock: on Windows its wall clock resolution can
    // differ slightly from Node's Date.now() within the same millisecond.
    const clock = () => Date.parse(f.db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS time").get().time);
    const since = clock();
    f.db.prepare('UPDATE entries SET parent_id=11 WHERE id=3').run();
    for (const id of [1, 2, 10, 11]) assert.ok(Date.parse(f.time(id)) >= since);
    assert.equal(f.db.prepare('SELECT created_at FROM entries WHERE id=1').get().created_at, '2020-01-01T00:00:00.000Z');
    assert.equal(f.db.prepare('SELECT resource_type_id FROM entries WHERE id=3').get().resource_type_id, 1);
    f.db.prepare("UPDATE entries SET updated_at='2020-01-01T00:00:00.000Z' WHERE id IN (10,11)").run();
    const beforeDelete = clock();
    f.db.prepare('DELETE FROM entries WHERE id=3').run();
    for (const id of [10, 11]) assert.ok(Date.parse(f.time(id)) >= beforeDelete);
    // Deleting a collection detaches its children but still modifies its parent.
    f.insert(4, 2); f.db.prepare('DELETE FROM entries WHERE id=2').run();
    assert.equal(f.db.prepare('SELECT parent_id FROM entries WHERE id=4').get().parent_id, null);
    assert.ok(Date.parse(f.time(1)) >= since);
});

test('升级回填所有层级最新时间，保留创建时间与通知记录，重复启动不修改时间', t => {
    const f = fixture(t);
    f.insert(1, null, 'collection'); f.insert(2, 1, 'collection');
    f.insert(3, 2, 'document', 'draft', '2025-09-30T08:00:00.000Z');
    f.insert(4, 1, 'gallery', 'published', '2024-10-01T08:00:00.000Z');
    const count = f.events();
    migrateResourceModifications(f.db); migrateResourceModifications(f.db);
    for (const id of [1, 2, 3]) assert.equal(f.time(id), '2025-09-30T08:00:00.000Z');
    assert.equal(f.time(4), '2024-10-01T08:00:00.000Z');
    assert.equal(f.events(), count);
});
