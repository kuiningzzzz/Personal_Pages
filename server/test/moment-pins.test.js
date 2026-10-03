import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../sqlite.js';
import { migrateMomentPins, validateMomentPin, setMomentPin, publicEntryComparator } from '../moment-pins.js';
import { migrateUsers } from '../auth/schema.js';
import { migrateSubscriptions } from '../subscriptions/schema.js';

function fixture(t) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE entries(id INTEGER PRIMARY KEY,kind TEXT DEFAULT 'moment',status TEXT DEFAULT 'published',
        format TEXT DEFAULT 'article',title TEXT DEFAULT '',body TEXT DEFAULT '',resource_kind TEXT DEFAULT 'document',
        parent_id INTEGER,resource_type_id INTEGER,published_at TEXT DEFAULT '2026-10-01',updated_at TEXT DEFAULT '2026-10-02')`);
    db.exec("INSERT INTO entries(id,title) VALUES(1,'已有长文')");
    migrateMomentPins(db);
    const insert = (id, format = 'short', status = 'published', kind = 'moment') => db.prepare('INSERT INTO entries(id,format,status,kind) VALUES(?,?,?,?)').run(id, format, status, kind);
    const row = id => db.prepare('SELECT * FROM entries WHERE id=?').get(id);
    t.after(() => db.close());
    return { db, insert, row };
}

test('迁移兼容已有动态且重复运行不丢失置顶；短帖和长文共享五条上限', t => {
    const f = fixture(t);
    assert.equal(f.row(1).pinned, 0);
    setMomentPin(f.db, 1, true);
    for (let id = 2; id <= 5; id++) { f.insert(id, id % 2 ? 'short' : 'article'); setMomentPin(f.db, id, true); }
    f.insert(6);
    assert.throws(() => setMomentPin(f.db, 6, true), error => error.status === 409 && /最多置顶 5 条/.test(error.message));
    assert.equal(f.row(6).pinned, 0);
    assert.equal(validateMomentPin(f.db, { kind: 'moment', status: 'published', pinned: true }).status, 409);
    assert.equal(validateMomentPin(f.db, { kind: 'moment', status: 'published', pinned: true }, 1).pinned, 1, '编辑已有置顶不占第六个位置');
    assert.equal(validateMomentPin(f.db, { kind: 'moment', status: 'published' }, 1).pinned, 1, '未指定时保留已有设置');
    assert.throws(() => f.db.prepare('UPDATE entries SET pinned=1 WHERE id=6').run(), /最多置顶/);
    migrateMomentPins(f.db);
    assert.equal(f.row(1).pinned, 1);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM entries WHERE pinned=1').get().n, 5);
});

test('取消置顶、转草稿、删除与转换资源释放位置，草稿和资源不能置顶', t => {
    const f = fixture(t);
    for (let id = 2; id <= 6; id++) f.insert(id);
    for (let id = 1; id <= 5; id++) setMomentPin(f.db, id, true);
    setMomentPin(f.db, 1, false); setMomentPin(f.db, 6, true);
    f.db.prepare("UPDATE entries SET status='draft' WHERE id=2").run();
    assert.equal(f.row(2).pinned, 0);
    assert.throws(() => setMomentPin(f.db, 2, true), /请先发布/);
    setMomentPin(f.db, 1, true);
    f.db.prepare("UPDATE entries SET kind='resource' WHERE id=3").run();
    assert.equal(f.row(3).pinned, 0);
    assert.throws(() => setMomentPin(f.db, 3, true), /只有动态/);
    f.insert(7); setMomentPin(f.db, 7, true);
    f.db.prepare('DELETE FROM entries WHERE id=4').run();
    f.insert(8); setMomentPin(f.db, 8, true);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM entries WHERE pinned=1').get().n, 5);
    assert.equal(validateMomentPin(f.db, { kind: 'moment', status: 'draft', pinned: true }, 1).pinned, 0);
    assert.equal(validateMomentPin(f.db, { kind: 'resource', pinned: true }).pinned, 0);
    assert.match(validateMomentPin(f.db, { kind: 'moment', pinned: 'true' }).error, /无效/);
    assert.throws(() => setMomentPin(f.db, 999, true), error => error.status === 404);
});

test('浏览时置顶优先，两组各沿用时间排序；搜索和首页最新内容保持原排序', () => {
    const rows = [
        { id: 1, pinned: true, published_at: '2020-01-01', updated_at: '2026-10-02', score: 1 },
        { id: 2, pinned: false, published_at: '2026-10-01', updated_at: '2026-10-01', score: 5 },
        { id: 3, pinned: true, published_at: '2021-01-01', updated_at: '2026-10-01', score: 3 },
        { id: 4, pinned: false, published_at: '2026-10-02', updated_at: '2026-10-02', score: 5 },
    ];
    const sorted = options => [...rows].sort(publicEntryComparator(options)).map(row => row.id);
    assert.deepEqual(sorted({ sort: 'latest', pinnedFirst: true }), [3, 1, 4, 2]);
    assert.deepEqual(sorted({ sort: 'updated', pinnedFirst: true }), [1, 3, 4, 2]);
    assert.deepEqual(sorted({ sort: 'relevance', search: true, pinnedFirst: true }), [4, 2, 3, 1]);
    assert.deepEqual(sorted({ sort: 'latest', search: true, pinnedFirst: true }), [4, 2, 3, 1]);
    assert.deepEqual(sorted({ sort: 'latest', pinnedFirst: false }), [4, 2, 3, 1]);
});

test('单独置顶及取消不改修改时间，不产生新增订阅通知', t => {
    const f = fixture(t);
    migrateUsers(f.db);
    f.db.exec('CREATE TABLE resource_types(id INTEGER PRIMARY KEY)');
    migrateSubscriptions(f.db);
    const before = { ...f.row(1) };
    setMomentPin(f.db, 1, true);
    assert.equal(f.row(1).updated_at, before.updated_at);
    assert.equal(f.row(1).published_at, before.published_at);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM subscription_events').get().n, 0);
    setMomentPin(f.db, 1, false);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM subscription_events').get().n, 0);
});
