import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../sqlite.js';
import { migrateUsers } from '../auth/schema.js';
import { migrateSubscriptions } from '../subscriptions/schema.js';
import { migrateResourceCategories } from '../resource-categories.js';
import { resourceGraph, setSubscription, subscriptionState, subscriptionMap, subscribedToEntry } from '../subscriptions/graph.js';

function fixture(t, { legacy = false, recursive = false } = {}) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON'); db.pragma(`recursive_triggers = ${recursive ? 'ON' : 'OFF'}`);
    migrateUsers(db);
    db.exec(`CREATE TABLE resource_types(id INTEGER PRIMARY KEY,name TEXT);
        INSERT INTO resource_types VALUES(1,'学习'),(2,'工具');
        CREATE TABLE entries(id INTEGER PRIMARY KEY,kind TEXT DEFAULT 'resource',resource_kind TEXT DEFAULT 'document',
            parent_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,resource_type_id INTEGER REFERENCES resource_types(id) ON DELETE SET NULL,
            status TEXT DEFAULT 'published',format TEXT DEFAULT 'article',title TEXT DEFAULT '资源');
        INSERT INTO users(username,username_key,email,password_hash,created_at) VALUES('用户一','用户一','one@example.com','test','2026-10-02'),
            ('用户二','用户二','two@example.com','test','2026-10-02');`);
    migrateSubscriptions(db);
    if (!legacy) migrateResourceCategories(db);
    const insert = (shape = 'document', parent = null, type = null, status = 'published') => Number(db.prepare('INSERT INTO entries(resource_kind,parent_id,resource_type_id,status) VALUES(?,?,?,?)').run(shape, parent, type, status).lastInsertRowid);
    const category = id => db.prepare('SELECT resource_type_id FROM entries WHERE id=?').get(id).resource_type_id;
    t.after(() => db.close());
    return { db, insert, category };
}

for (const recursive of [false, true]) test(`子形态与草稿递归继承；改大类、移动子树及回到根层一致（递归触发器 ${recursive}）`, t => {
    const f = fixture(t, { recursive });
    const first = f.insert('collection', null, 1), second = f.insert('collection', null, 2);
    const child = f.insert('collection', first, 2), nested = f.insert('collection', child), file = f.insert('document', nested, 2), gallery = f.insert('gallery', nested, null, 'draft');
    for (const id of [child, nested, file, gallery]) assert.equal(f.category(id), 1);
    f.db.prepare('UPDATE entries SET resource_type_id=2 WHERE id=?').run(file);
    assert.equal(f.category(file), 1);
    f.db.prepare('UPDATE entries SET parent_id=? WHERE id=?').run(second, child);
    for (const id of [child, nested, file, gallery]) assert.equal(f.category(id), 2);
    f.db.prepare('UPDATE entries SET resource_type_id=NULL WHERE id=?').run(second);
    for (const id of [second, child, nested, file, gallery]) assert.equal(f.category(id), null);
    f.db.prepare('UPDATE entries SET resource_type_id=1 WHERE id=?').run(second);
    f.db.prepare('UPDATE entries SET parent_id=NULL WHERE id=?').run(child);
    assert.equal(f.category(child), 1, '移回根层保留最后继承的大类');
    f.db.prepare('UPDATE entries SET resource_type_id=2 WHERE id=?').run(child);
    for (const id of [child, nested, file, gallery]) assert.equal(f.category(id), 2);
    f.db.prepare('DELETE FROM entries WHERE id=?').run(child);
    assert.equal(f.db.prepare('SELECT parent_id FROM entries WHERE id=?').get(nested).parent_id, null);
    for (const id of [nested, file, gallery]) assert.equal(f.category(id), 2);
});

test('旧库统一子分类，不改根分类或触发通知；清理旧自动订阅默认并保留独立选择', t => {
    const f = fixture(t, { legacy: true });
    const root = f.insert('collection', null, 1), child = f.insert('collection', root, 2), nested = f.insert('collection', child, null, 'draft');
    const file = f.insert('document', nested, 2), rootFile = f.insert('document', null, 2);
    const write = f.db.prepare('INSERT INTO subscriptions(user_id,scope,target_id,enabled,event_cursor) VALUES(?,?,?,?,?)');
    write.run(1, 'resource-type', 1, 1, 0); write.run(1, 'collection', root, 1, 0); write.run(1, 'collection', child, 1, 0);
    write.run(1, 'collection', nested, 0, 4); write.run(2, 'collection', child, 1, 7);
    const publications = f.db.prepare('SELECT COUNT(*) AS n FROM subscription_events').get().n;
    migrateResourceCategories(f.db); migrateResourceCategories(f.db);
    for (const id of [root, child, nested, file]) assert.equal(f.category(id), 1);
    assert.equal(f.category(rootFile), 2);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM subscription_events').get().n, publications);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE user_id=1 AND scope='collection' AND enabled=1").get().n, 0);
    assert.equal(f.db.prepare("SELECT enabled FROM subscriptions WHERE user_id=1 AND target_id=? AND scope='collection'").get(nested).enabled, 0);
    assert.equal(f.db.prepare("SELECT event_cursor FROM subscriptions WHERE user_id=2 AND target_id=? AND scope='collection'").get(child).event_cursor, 7);
    assert.equal(subscriptionState(f.db, 1).collections[child], true);
});

test('大类订阅随根层级移动而改变，独立订阅保留；整类取消递归清除选择', t => {
    const f = fixture(t);
    const first = f.insert('collection', null, 1), second = f.insert('collection', null, 2), child = f.insert('collection', first), nested = f.insert('collection', child);
    setSubscription(f.db, 1, 'resource-type', 1, true); setSubscription(f.db, 2, 'resource-type', 2, true);
    assert.equal(subscriptionState(f.db, 1).collections[nested], true);
    assert.equal(subscriptionState(f.db, 2).collections[nested], false);
    f.db.prepare('UPDATE entries SET parent_id=? WHERE id=?').run(second, child);
    assert.equal(subscriptionState(f.db, 1).collections[nested], false);
    assert.equal(subscriptionState(f.db, 2).collections[nested], true);
    setSubscription(f.db, 1, 'collection', nested, true);
    f.db.prepare('UPDATE entries SET parent_id=? WHERE id=?').run(first, child);
    assert.equal(subscriptionState(f.db, 1).collections[nested], true);
    setSubscription(f.db, 1, 'resource-type', 1, false);
    for (const id of [first, child, nested]) assert.equal(subscriptionState(f.db, 1).collections[id], false);
    setSubscription(f.db, 1, 'resource-all', 0, true);
    for (const id of [first, second, child, nested]) assert.equal(subscriptionState(f.db, 1).collections[id], true);
});

test('删除大类递归清理订阅及继承字段，其他根大类不受影响', t => {
    const f = fixture(t);
    const root = f.insert('collection', null, 1), child = f.insert('collection', root), file = f.insert('document', child), other = f.insert('collection', null, 2);
    setSubscription(f.db, 1, 'resource-type', 1, true); setSubscription(f.db, 2, 'collection', child, true); setSubscription(f.db, 2, 'collection', other, true);
    f.db.prepare('DELETE FROM resource_types WHERE id=1').run();
    for (const id of [root, child, file]) assert.equal(f.category(id), null);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE scope='resource-type'").get().n, 0);
    assert.equal(subscriptionState(f.db, 2).collections[child], false);
    assert.equal(subscriptionState(f.db, 2).collections[other], true);
});

test('面对旧的不一致子分类，按类订阅仍只按根集合判断', t => {
    const f = fixture(t, { legacy: true });
    const root = f.insert('collection', null, 1), child = f.insert('collection', root, 2), file = f.insert('document', child, 2);
    setSubscription(f.db, 1, 'resource-type', 2, true);
    const records = subscriptionMap(f.db.prepare('SELECT * FROM subscriptions WHERE user_id=1').all());
    const graph = resourceGraph(f.db);
    assert.equal(subscribedToEntry(graph.nodes.get(file), graph, records), false);
    assert.equal(subscriptionState(f.db, 1).collections[child], false);
    setSubscription(f.db, 1, 'resource-type', 1, true);
    assert.equal(subscriptionState(f.db, 1).collections[child], true);
});
