import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from '../sqlite.js';
import { migrateAnnouncements, listAnnouncements, saveAnnouncement, createAnnouncementAdminRoutes, createAnnouncementPublicRoutes } from '../announcements.js';

function fixture(t) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrateAnnouncements(db);
    t.after(() => db.close());
    const input = (n, extra = {}) => ({ title: `公告 ${n}`, body: `内容 ${n}`, status: 'published', pinned: false, tag_ids: [], published_at: `2026-09-${String(n).padStart(2, '0')}T12:00:00Z`, ...extra });
    return { db, input, save: (n, extra = {}, id = null) => saveAnnouncement(db, input(n, extra), id) };
}

test('收起显示 2 条置顶及最新 3 条普通公告，不重复，不泄露草稿；展开分页按发布时间排序', t => {
    const f = fixture(t);
    for (let n = 1; n <= 20; n++) f.save(n, { pinned: n <= 2 });
    f.save(21, { status: 'draft', pinned: true });
    const collapsed = listAnnouncements(f.db, { page: 2 });
    assert.deepEqual(collapsed.pinned.map(row => row.title), ['公告 2', '公告 1']);
    assert.deepEqual(collapsed.data.map(row => row.title), ['公告 20', '公告 19', '公告 18']);
    assert.equal(collapsed.total, 18);
    assert.equal(collapsed.totalPages, 2);
    assert.equal(collapsed.page, 1);
    assert.equal(listAnnouncements(f.db, { expanded: true }).data.length, 15);
    const second = listAnnouncements(f.db, { expanded: true, page: 99 });
    assert.equal(second.page, 2);
    assert.deepEqual(second.data.map(row => row.title), ['公告 5', '公告 4', '公告 3']);
    assert.equal(second.pinned.length, 2);
    assert.equal(listAnnouncements(f.db, { admin: true }).total, 21);
    const old = f.db.prepare('SELECT * FROM announcements WHERE title=?').get('公告 3');
    f.save(3, { title: '修改旧公告', body: '修改不提升发布时间' }, old.id);
    assert.deepEqual(listAnnouncements(f.db).data.map(row => row.title), collapsed.data.map(row => row.title));
});

test('最多置顶两条，第三条请求原子回滚；取消置顶、转草稿和删除均释放位置', t => {
    const f = fixture(t);
    const a = f.save(1, { pinned: true }), b = f.save(2, { pinned: true }), c = f.save(3);
    assert.throws(() => f.save(4, { pinned: true }), /最多置顶/);
    assert.throws(() => f.save(3, { pinned: true, title: '不应保存' }, c.id), /最多置顶/);
    assert.equal(f.db.prepare('SELECT title FROM announcements WHERE id=?').get(c.id).title, '公告 3');
    assert.equal(listAnnouncements(f.db, { admin: true }).total, 3);
    f.save(1, { pinned: false }, a.id);
    f.save(3, { pinned: true }, c.id);
    f.save(2, { status: 'draft', pinned: true }, b.id);
    assert.equal(f.db.prepare('SELECT pinned FROM announcements WHERE id=?').get(b.id).pinned, 0);
    f.save(4, { pinned: true });
    f.db.prepare('DELETE FROM announcements WHERE id=?').run(c.id);
    f.save(5, { pinned: true });
    assert.equal(listAnnouncements(f.db).pinned.length, 2);
    assert.throws(() => f.db.prepare('UPDATE announcements SET pinned=1 WHERE id=?').run(a.id), /最多置顶/);
});

test('动态标签重命名即时生效、删除解除关联；不存在的标签不能留下部分修改', t => {
    const f = fixture(t);
    const tag = Number(f.db.prepare('INSERT INTO announcement_tags(name) VALUES(?)').run('更新日志').lastInsertRowid);
    const item = f.save(1, { tag_ids: [tag, tag] });
    assert.equal(item.tags.length, 1);
    f.db.prepare('UPDATE announcement_tags SET name=? WHERE id=?').run('重要提醒', tag);
    assert.equal(listAnnouncements(f.db).data[0].tags[0].name, '重要提醒');
    assert.throws(() => f.save(1, { title: '无效修改', tag_ids: [tag, 999] }, item.id), /标签不存在/);
    assert.equal(listAnnouncements(f.db).data[0].title, '公告 1');
    f.db.prepare('DELETE FROM announcement_tags WHERE id=?').run(tag);
    assert.deepEqual(listAnnouncements(f.db).data[0].tags, []);
    f.db.prepare('DELETE FROM announcements WHERE id=?').run(item.id);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM announcement_tag_links').get().n, 0);
    migrateAnnouncements(f.db);
    assert.deepEqual(listAnnouncements(f.db).data, []);
});

test('公告接口可以管理标签、发布、编辑、删除，错误返回可读提示；公众只读取已发布数据', async t => {
    const f = fixture(t);
    const app = express(); app.use(express.json());
    let cleanups = 0;
    app.use('/admin', createAnnouncementAdminRoutes({ db: f.db, cleanup: () => ({ warnings: [], deletedFiles: ++cleanups }) }));
    app.use('/public', createAnnouncementPublicRoutes({ db: f.db }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const request = async (path, method = 'GET', body) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
        return { status: response.status, body: await response.json() };
    };
    assert.equal((await request('/admin/tags', 'POST', { name: '更新日志' })).status, 200);
    assert.equal((await request('/admin/tags', 'POST', { name: '更新日志' })).status, 400);
    const tags = (await request('/admin/tags')).body.data;
    const created = await request('/admin', 'POST', f.input(1, { tag_ids: [tags[0].id] }));
    assert.equal(created.status, 200);
    const id = created.body.data.id;
    assert.equal(created.body.deletedFiles, 1);
    const draft = await request('/admin', 'POST', f.input(2, { status: 'draft' }));
    assert.equal((await request('/public?expanded=1')).body.total, 1);
    assert.equal((await request('/admin')).body.total, 2);
    assert.equal((await request(`/admin/tags/${tags[0].id}`, 'PUT', { name: '重要提醒' })).status, 200);
    assert.equal((await request('/public')).body.data[0].tags[0].name, '重要提醒');
    assert.equal((await request(`/admin/${id}`, 'PUT', f.input(1, { pinned: true }))).status, 200);
    assert.equal((await request(`/admin/${draft.body.data.id}`, 'PUT', f.input(2, { pinned: true }))).status, 200);
    assert.equal((await request('/admin', 'POST', f.input(3, { pinned: true }))).status, 409);
    assert.equal((await request('/admin/999', 'PUT', f.input(3))).status, 404);
    assert.equal((await request(`/admin/${id}`, 'DELETE')).status, 200);
    assert.equal((await request(`/admin/${id}`, 'DELETE')).status, 404);
    assert.equal((await request(`/admin/tags/${tags[0].id}`, 'DELETE')).status, 200);
    assert.equal((await request('/public')).body.pinned.length, 1);
});
