import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../sqlite.js';
import { articleNavigation } from '../article-navigation.js';

function fixture(t) {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE entries(id INTEGER PRIMARY KEY,kind TEXT,resource_kind TEXT,parent_id INTEGER,
        format TEXT,status TEXT,title TEXT,published_at TEXT,resource_type_id INTEGER,updated_at TEXT)`);
    const insert = (id, overrides = {}) => {
        const row = { id, kind: 'resource', resource_kind: 'document', parent_id: null, format: 'article', status: 'published',
            title: `文章 ${id}`, published_at: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`, resource_type_id: 1, updated_at: '2026-10-30', ...overrides };
        db.prepare('INSERT INTO entries VALUES (?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));
        return row;
    };
    t.after(() => db.close());
    return { db, insert, nav: id => articleNavigation(db, db.prepare('SELECT * FROM entries WHERE id=?').get(id)) };
}

test('单篇不显示，两篇两侧指向同一篇，多篇首尾循环且保留完整标题', t => {
    const f = fixture(t);
    f.insert(1);
    assert.equal(f.nav(1), null);
    f.insert(2, { title: '一篇很长的完整文章标题 📚' });
    assert.deepEqual(f.nav(1), { previous: { id: 2, title: '一篇很长的完整文章标题 📚' }, next: { id: 2, title: '一篇很长的完整文章标题 📚' } });
    f.insert(3);
    assert.deepEqual([f.nav(3).previous.id, f.nav(3).next.id], [1, 2]);
    assert.deepEqual([f.nav(2).previous.id, f.nav(2).next.id], [3, 1]);
    assert.deepEqual([f.nav(1).previous.id, f.nav(1).next.id], [2, 3]);
});

test('限定直属同级，跳过草稿、合集、图集、短帖以及其他栏目', t => {
    const f = fixture(t);
    f.insert(1, { resource_kind: 'collection' });
    f.insert(2, { parent_id: 1 });
    f.insert(3, { parent_id: 1 });
    f.insert(4, { parent_id: 1, resource_kind: 'collection' });
    f.insert(5, { parent_id: 4 });
    f.insert(6, { parent_id: 1, resource_kind: 'gallery' });
    f.insert(7, { parent_id: 1, status: 'draft' });
    f.insert(8, { parent_id: 1, format: 'short' });
    f.insert(9);
    f.insert(10, { parent_id: 1, kind: 'moment' });
    assert.deepEqual([f.nav(2).previous.id, f.nav(2).next.id], [3, 3]);
    assert.equal(f.nav(5), null, '子合集内单独成队列');
    assert.equal(f.nav(9), null, '根目录不会进入合集');
    for (const id of [1, 4, 6, 7, 8]) assert.equal(f.nav(id), null);
});

test('根文章跨大类循环，动态长文单独循环；删除或移动即时改变队列', t => {
    const f = fixture(t);
    f.insert(1, { resource_type_id: 1 });
    f.insert(2, { resource_type_id: 2 });
    f.insert(3, { kind: 'moment' });
    f.insert(4, { kind: 'moment' });
    f.insert(5, { kind: 'moment', format: 'short' });
    assert.equal(f.nav(1).next.id, 2);
    assert.equal(f.nav(3).next.id, 4);
    assert.equal(f.nav(5), null);
    f.db.prepare('DELETE FROM entries WHERE id=?').run(2);
    assert.equal(f.nav(1), null);
    f.insert(6, { resource_kind: 'collection' });
    f.db.prepare('UPDATE entries SET parent_id=? WHERE id=?').run(6, 1);
    assert.equal(f.nav(1), null);
    f.insert(7, { parent_id: 6 });
    assert.equal(f.nav(1).next.id, 7);
});

test('发布时间按实际时间比较，同一时间按 ID 排序，修改时间不改变阅读队列', t => {
    const f = fixture(t);
    f.insert(1, { published_at: '2026-10-03T10:00:00+08:00' });
    f.insert(2, { published_at: '2026-10-03T02:00:00Z' });
    f.insert(3, { published_at: '2026-10-03T03:00:00Z' });
    assert.equal(f.nav(3).next.id, 2);
    f.db.prepare('UPDATE entries SET updated_at=? WHERE id=?').run('2027-01-01', 1);
    assert.equal(f.nav(3).next.id, 2);
});
