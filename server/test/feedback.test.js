import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from '../sqlite.js';
import { migrateUsers } from '../auth/schema.js';
import { migrateFeedback } from '../feedback/schema.js';
import { createFeedbackRoutes, createFeedbackAdminRoutes } from '../feedback/routes.js';
import { createFeedbackMailService } from '../feedback/mail-service.js';
import { feedbackMessage } from '../auth/mail.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cXuoAAAAASUVORK5CYII=', 'base64');
async function fixture() {
    const folder = mkdtempSync(join(tmpdir(), 'feedback-tests-'));
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON');
    migrateUsers(db); migrateFeedback(db);
    db.exec("CREATE TABLE profile(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO profile VALUES(1,'个人小站')");
    let now = Date.UTC(2026, 9, 3), deliveryError = false;
    const tokens = [null, 'a'.repeat(64), 'b'.repeat(64)];
    for (let id = 1; id <= 2; id++) {
        db.prepare('INSERT INTO users(id,username,username_key,email,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id, `访客${id}`, `guest${id}`, `guest${id}@example.com`, 'test', new Date(now).toISOString());
        db.prepare('INSERT INTO user_sessions VALUES(?,?,?)').run(createHash('sha256').update(tokens[id]).digest('hex'), id, now + 86400000);
    }
    const deliveries = [];
    const mailer = { enabled: true, ownerEmail: 'owner@qq.com', async sendFeedbackNotification(fields) { if (deliveryError) throw Object.assign(new Error('fake SMTP error'), { code: 'EAUTH' }); deliveries.push(fields); } };
    const app = express(); app.use(express.json());
    app.use('/api/feedback', createFeedbackRoutes({ db, root: folder, clock: () => now }));
    app.use('/api/admin/feedback', (req, res, next) => req.get('x-test-admin') === 'yes' ? next() : res.status(401).json({ success: false }), createFeedbackAdminRoutes({ db, root: folder, clock: () => now }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const service = createFeedbackMailService({ db, mailer, origin: base, root: folder, clock: () => now });
    const request = async (path, { user, admin, ...options } = {}) => {
        const response = await fetch(base + path, { ...options, headers: { ...(user ? { cookie: `pp_user_session=${tokens[user]}` } : {}), ...(admin ? { 'x-test-admin': 'yes' } : {}), ...options.headers } });
        return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
    };
    const submit = (fields = { category: 'experience', body: '阅读时目录可以更清晰' }, images = [], options = {}) => {
        const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.append(key, value);
        for (const image of images) data.append('images', new Blob([image.bytes || png], { type: image.type || 'image/png' }), image.name || '截图.png');
        return request('/api/feedback', { user: 1, method: 'POST', body: data, ...options });
    };
    return { db, request, submit, service, deliveries, folder, advance(ms) { now += ms; }, mailError(value) { deliveryError = value; }, async close() { await service.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); rmSync(folder, { recursive: true, force: true }); } };
}

test('反馈只允许登录用户同源提交，黑名单会禁止提交，无效表单不占次数', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.submit(undefined, [], { user: null })).status, 401);
        assert.equal((await f.submit(undefined, [], { headers: { origin: 'https://evil.example' } })).status, 403);
        assert.equal((await f.submit({ category: 'music', song: '歌曲' })).status, 400);
        assert.equal((await f.submit({ category: 'unknown', body: '建议' })).status, 400);
        assert.equal((await f.submit({ category: 'experience', body: 'a'.repeat(10001) })).status, 400);
        assert.equal(f.db.prepare('SELECT count(*) AS count FROM visitor_feedback').get().count, 0);
        f.db.prepare('INSERT INTO user_blacklist VALUES(?,?,?)').run('guest1@example.com', 'test', new Date().toISOString());
        assert.equal((await f.submit()).status, 401);
    } finally { await f.close(); }
});

test('每用户滚动半小时最多三次，审批不能绕过限流，其他用户独立计数', async () => {
    const f = await fixture();
    try {
        const first = await f.submit(); assert.equal(first.status, 201);
        assert.equal((await f.submit({ category: 'bug', body: 'Bug 内容' })).status, 201);
        assert.equal((await f.submit({ category: 'music', song: '歌名', artist: '歌手', notes: 'live 版本' })).status, 201);
        assert.equal((await f.submit()).status, 429);
        assert.equal((await f.request(`/api/admin/feedback/${first.body.id}/approve`, { method: 'POST', admin: true })).status, 200);
        assert.equal((await f.submit()).status, 429);
        assert.equal((await f.submit(undefined, [], { user: 2 })).status, 201);
        f.advance(30 * 60000);
        assert.equal((await f.submit()).status, 201);
    } finally { await f.close(); }
});

test('图片仅管理员可读取，所有非音乐类型可配图，审批移动到已处理并保留原内容', async () => {
    const f = await fixture();
    try {
        for (const category of ['experience', 'bug', 'rights', 'other']) assert.equal((await f.submit({ category, body: `反馈-${category}` }, [{ name: '辅助图.png' }], { user: category === 'other' ? 2 : 1 })).status, 201);
        assert.equal((await f.request('/api/admin/feedback', { user: 1 })).status, 401);
        const list = await f.request('/api/admin/feedback?status=unread', { admin: true });
        assert.equal(list.body.total, 4);
        const row = list.body.data[0]; assert.equal(row.is_read, false);
        assert.equal(row.images.length, 1);
        assert.equal((await f.request(row.images[0].url, { user: 2 })).status, 401);
        assert.deepEqual((await f.request(row.images[0].url, { admin: true })).body, png);
        assert.equal((await f.request(`/api/admin/feedback/${row.id}/approve`, { admin: true, method: 'POST' })).status, 200);
        const read = await f.request('/api/admin/feedback?status=read', { admin: true });
        assert.equal(read.body.total, 1); assert.equal(read.body.data[0].body, row.body); assert.equal(read.body.data[0].is_read, true);
        assert.equal((await f.request('/api/admin/feedback?status=unread', { admin: true })).body.total, 3);
        assert.equal((await f.request(`/api/admin/feedback/${row.id}/approve`, { admin: true, method: 'POST' })).status, 200);
    } finally { await f.close(); }
});

test('伪图片、SVG、过量图片和音乐配图均被拒绝，不残留文件', async () => {
    const f = await fixture();
    try {
        assert.equal((await f.submit(undefined, [{ bytes: '<script>bad</script>' }])).status, 400);
        assert.equal((await f.submit(undefined, [{ type: 'image/svg+xml', bytes: '<svg />' }])).status, 400);
        assert.equal((await f.submit(undefined, Array.from({ length: 5 }, () => ({})))).status, 400);
        assert.equal((await f.submit({ category: 'music', song: 'a', artist: 'b' }, [{}])).status, 400);
        assert.deepEqual(readdirSync(f.folder), []);
    } finally { await f.close(); }
});

test('每条已提交反馈独立排队通知，审批后仍发邮件，失败重试且成功后不重复', async () => {
    const f = await fixture();
    try {
        const first = await f.submit({ category: 'rights', body: '详细侵权说明' }, [{}]);
        await f.submit({ category: 'music', song: '喜欢的歌', artist: '歌手', notes: '详细备注' });
        await f.request(`/api/admin/feedback/${first.body.id}/approve`, { admin: true, method: 'POST' });
        f.mailError(true); await f.service.process();
        assert.equal(f.deliveries.length, 0);
        f.advance(60000); f.mailError(false);
        await Promise.all([f.service.process(), f.service.process()]);
        assert.equal(f.deliveries.length, 2);
        assert.equal(f.deliveries[0].email, 'guest1@example.com');
        assert.equal(f.deliveries[0].username, '访客1');
        assert.deepEqual(f.deliveries[0].pictures[0].content, png);
        assert.equal(f.deliveries[1].notes, '详细备注');
        assert.ok(f.deliveries[0].manageUrl.endsWith('/admin?tab=feedback'));
        await f.service.process(); assert.equal(f.deliveries.length, 2);
    } finally { await f.close(); }
});

test('反馈邮件转义文本并包含全部歌曲字段和内嵌图片', () => {
    const base = { id: 5, siteName: '小站', username: '<script>访客</script>', email: 'guest@example.com', user_id: 9, created_at: 0, manageUrl: 'https://example.com/admin?tab=feedback' };
    const music = feedbackMessage({ ...base, category: 'music', song: '曲目', artist: '歌手', notes: '备注' });
    for (const text of ['曲目','歌手','备注','guest@example.com','用户 ID：9']) assert.ok(music.text.includes(text));
    assert.ok(!music.html.includes('<script>'));
    const images = feedbackMessage({ ...base, category: 'other', body: '<img src=x onerror=bad>', pictures: [{ id: 3, name: '截图.png', mime_type: 'image/png', content: png }] });
    assert.ok(images.html.includes('cid:feedback-5-3@personal-pages'));
    assert.ok(!images.html.includes('<img src=x'));
    assert.deepEqual(images.attachments[0].content, png);
});
