import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import Database from '../sqlite.js';
import { migrateUsers } from '../auth/schema.js';
import { createUserRoutes, SESSION_TTL } from '../auth/routes.js';
import { discussionMessage } from '../auth/mail.js';
import { migrateComments } from '../comments/schema.js';
import { createCommentRoutes } from '../comments/routes.js';
import { createModerationRoutes } from '../comments/admin-routes.js';
import { createUserAdminRoutes } from '../auth/admin-routes.js';
import { createDiscussionMailService, REPORT_MAIL_COOLDOWN } from '../comments/mail-service.js';

async function fixture(t, options = {}) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrateUsers(db);
    db.exec(`CREATE TABLE profile (id INTEGER PRIMARY KEY,name TEXT); INSERT INTO profile VALUES (1,'测试小站');
        CREATE TABLE resource_types (id INTEGER PRIMARY KEY,name TEXT);
        CREATE TABLE entries (id INTEGER PRIMARY KEY,kind TEXT DEFAULT 'moment',resource_kind TEXT DEFAULT 'document',
            parent_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,resource_type_id INTEGER REFERENCES resource_types(id),
            status TEXT DEFAULT 'published',format TEXT DEFAULT 'article',title TEXT DEFAULT '课程笔记',body TEXT DEFAULT '',summary TEXT DEFAULT '');
        INSERT INTO entries (id,kind,resource_kind,status,format,parent_id) VALUES
            (1,'moment','document','published','article',NULL),(2,'resource','document','published','article',NULL),
            (3,'resource','gallery','published','article',NULL),(4,'resource','collection','published','article',NULL),
            (5,'moment','document','published','short',NULL),(6,'moment','document','draft','article',NULL),
            (7,'resource','collection','draft','article',NULL),(8,'resource','document','published','article',7);
        INSERT INTO users (username,username_key,email,password_hash,created_at) VALUES
            ('用户一','用户一','one@example.com','test-only','2026-10-01'),
            ('用户二','用户二','two@example.com','test-only','2026-10-01'),
            ('用户三','用户三','three@example.com','test-only','2026-10-01');`);
    migrateComments(db); migrateComments(db); migrateUsers(db);
    let now = Date.now();
    const messages = [];
    const mailer = { enabled: true, ownerEmail: '12345@qq.com',
        send: async message => messages.push({ kind: 'verification', ...message }),
        sendReportNotification: async message => { if (options.send) await options.send(message); messages.push({ ...message, email: '12345@qq.com' }); },
        sendReplyNotification: async message => { if (options.send) await options.send(message); messages.push(message); } };
    const clock = () => now;
    const createService = () => createDiscussionMailService({ db, mailer, clock, origin: 'https://example.com' });
    const service = createService();
    const cookies = new Map();
    for (const id of [1, 2, 3]) {
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), id, now + SESSION_TTL);
        cookies.set(id, `pp_user_session=${token}`);
    }
    const app = express(); app.use(express.json());
    app.use('/api/comments', createCommentRoutes({ db, clock }));
    app.use('/api/auth', createUserRoutes({ db, clock, mailer, secret: 'isolated-test-secret', passwordVerifier: async () => true }));
    // The production Admin middleware is covered in content.test.js.
    app.use('/api/admin/moderation', (req, res, next) => req.get('x-test-admin') === 'yes' ? next() : res.sendStatus(401), createModerationRoutes({ db, clock }));
    app.use('/api/admin/users', (req, res, next) => req.get('x-test-admin') === 'yes' ? next() : res.sendStatus(401), createUserAdminRoutes({ db }));
    app.use((error, _req, res, _next) => res.status(500).json({ success: false, message: error.message }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { user = null, admin = false, method = 'GET', body, headers = {} } = {}) => {
        const response = await fetch(base + path, { method, headers: { ...(user ? { cookie: cookies.get(user) } : {}),
            ...(admin ? { 'x-test-admin': 'yes' } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}), ...headers },
            ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) });
        const result = await response.text();
        return { status: response.status, body: result.startsWith('{') ? JSON.parse(result) : result };
    };
    const post = async (user = 1, entry = 1, body = '一条评论', replyTo = null) => {
        now += 5000;
        const result = await request(`/api/comments/${entry}`, { user, method: 'POST', body: { body, replyTo } });
        assert.equal(result.status, 201, JSON.stringify(result.body));
        return result.body.data;
    };
    const report = (id, user = 2, reasons = ['广告营销'], description = '') => request(`/api/comments/items/${id}/report`, { user, method: 'POST', body: { reasons, description } });
    const moderate = (id, action) => request(`/api/admin/moderation/reports/${id}`, { admin: true, method: 'POST', body: { action } });
    t.after(async () => { await service.stop(); await new Promise(resolve => server.close(resolve)); db.close(); });
    return { db, post, report, moderate, request, messages, service, createService, advance: ms => { now += ms; } };
}

test('公开阅读及身份隔离：长文、资源、图集与短帖可评论，合集及草稿树不可评论', async t => {
    const f = await fixture(t);
    for (const id of [1, 2, 3, 5]) assert.equal((await f.request(`/api/comments/${id}`)).status, 200);
    for (const id of [4, 6, 8, 999]) {
        assert.equal((await f.request(`/api/comments/${id}`)).status, 404);
        assert.equal((await f.request(`/api/comments/${id}`, { user: 1, method: 'POST', body: { body: '不应发布' } })).status, 404);
    }
    assert.equal((await f.request('/api/comments/1', { method: 'POST', body: { body: '访客' } })).status, 401);
    const comment = await f.post();
    const publicRows = (await f.request('/api/comments/1')).body.data;
    assert.equal(publicRows[0].email, 'o***@example.com');
    for (const field of ['user_id', 'reports_muted', 'password_hash']) assert.ok(!Object.hasOwn(publicRows[0], field));
    assert.equal(publicRows[0].owned, false);
    assert.equal((await f.request('/api/comments/1', { user: 1 })).body.data[0].owned, true);
    assert.equal((await f.request(`/api/comments/items/${comment.id}/like`, { user: 1, method: 'POST', body: { enabled: true }, headers: { origin: 'https://evil.invalid' } })).status, 403);
    assert.equal((await f.request('/api/admin/moderation/reports', { user: 1 })).status, 401);
});

test('站主可由管理员指定并转移，评论、回复和自己的身份均即时反映账户设置', async t => {
    const f = await fixture(t);
    const root = await f.post(1, 1, '站主的评论'), reply = await f.post(1, 1, '站主的回复', root.id);
    await f.post(2, 1, '普通用户');
    assert.equal((await f.request('/api/admin/users', { user: 1 })).status, 401);
    assert.equal((await f.request('/api/admin/users/1/owner', { user: 1, method: 'POST', body: { enabled: true } })).status, 401);
    const listed = await f.request('/api/admin/users', { admin: true });
    assert.equal(listed.body.total, 3);
    assert.equal(listed.body.owner, null);
    assert.deepEqual(Object.keys(listed.body.data[0]).sort(), ['created_at','email','id','is_owner','username']);
    assert.equal(listed.body.data.find(user => user.id === 1).email, 'one@example.com');
    assert.equal((await f.request('/api/admin/users/1/owner', { admin: true, method: 'POST', body: { enabled: true } })).status, 200);
    let rows = (await f.request('/api/comments/1', { user: 1 })).body.data;
    assert.equal(rows.find(row => row.id === root.id).owned, true);
    assert.equal(rows.find(row => row.id === root.id).is_owner, true);
    assert.equal(rows.find(row => row.id === root.id).replies[0].owned, true);
    assert.equal(rows.find(row => row.id === root.id).replies[0].is_owner, true);
    assert.equal(rows.find(row => row.username === '用户二').is_owner, false);
    rows = (await f.request('/api/comments/1')).body.data;
    assert.equal(rows.find(row => row.id === root.id).owned, false);
    assert.equal(rows.find(row => row.id === root.id).is_owner, true);
    const replies = (await f.request(`/api/comments/1/replies/${root.id}`, { user: 2 })).body.data;
    assert.equal(replies.find(row => row.id === reply.id).is_owner, true);
    assert.equal(replies.find(row => row.id === reply.id).owned, false);
    await f.request('/api/admin/users/2/owner', { admin: true, method: 'POST', body: { enabled: true } });
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM users WHERE is_owner=1').get().n, 1);
    assert.equal((await f.request('/api/admin/users', { admin: true })).body.owner.id, 2);
    rows = (await f.request('/api/comments/1', { user: 2 })).body.data;
    assert.equal(rows.find(row => row.id === root.id).is_owner, false);
    assert.equal(rows.find(row => row.username === '用户二').is_owner, true);
    assert.equal(rows.find(row => row.username === '用户二').owned, true);
    await f.request('/api/admin/users/1/owner', { admin: true, method: 'POST', body: { enabled: false } });
    assert.equal((await f.request('/api/admin/users', { admin: true })).body.owner.id, 2, '取消其他用户不影响当前站主');
    await f.request('/api/admin/users/2/owner', { admin: true, method: 'POST', body: { enabled: false } });
    assert.equal((await f.request('/api/admin/users', { admin: true })).body.owner, null);
    assert.equal((await f.request('/api/admin/users/999/owner', { admin: true, method: 'POST', body: { enabled: true } })).status, 404);
    assert.equal((await f.request('/api/admin/users/1/owner', { admin: true, method: 'POST', body: { enabled: 1 } })).status, 400);
});

test('用户管理搜索与分页包含所有注册账户，站主唯一性和迁移保持稳定', async t => {
    const f = await fixture(t);
    for (let id = 4; id <= 34; id++) f.db.prepare('INSERT INTO users(id,username,username_key,email,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id, `用户${id}`, `用户${id}`, `person${id}@example.com`, 'private-hash', '2026-10-03');
    const first = (await f.request('/api/admin/users', { admin: true })).body;
    assert.equal(first.total, 34); assert.equal(first.totalPages, 3); assert.equal(first.data.length, 15);
    const second = (await f.request('/api/admin/users?page=2', { admin: true })).body;
    const third = (await f.request('/api/admin/users?page=999', { admin: true })).body;
    assert.equal(third.page, 3);
    assert.equal(new Set([...first.data, ...second.data, ...third.data].map(row => row.id)).size, 34);
    assert.deepEqual((await f.request('/api/admin/users?q=PERSON34', { admin: true })).body.data.map(row => row.id), [34]);
    assert.deepEqual((await f.request('/api/admin/users?q=' + encodeURIComponent('用户一'), { admin: true })).body.data.map(row => row.id), [1]);
    assert.equal((await f.request('/api/admin/users?q=%25', { admin: true })).body.total, 0, '搜索符号按普通文字处理');
    await f.request('/api/admin/users/1/owner', { admin: true, method: 'POST', body: { enabled: true } });
    assert.throws(() => f.db.prepare('UPDATE users SET is_owner=1 WHERE id=2').run(), /UNIQUE/);
    migrateUsers(f.db); migrateUsers(f.db);
    assert.equal(f.db.prepare('SELECT is_owner FROM users WHERE id=1').get().is_owner, 1);
    assert.equal((await f.request('/api/admin/users?q=PERSON34', { admin: true })).body.owner.id, 1, '搜索结果不隐藏当前站主摘要');
});

test('短帖在列表使用完整评论功能，回复及举报链接可正确定位短帖和评论', async t => {
    const f = await fixture(t);
    const root = await f.post(1, 5, '短帖评论'), reply = await f.post(2, 5, '短帖回复', root.id);
    await f.service.process();
    assert.equal(f.messages[0].url, `https://example.com/moments?post=5&comment=${reply.id}`);
    assert.equal((await f.request('/api/comments/5')).body.data[0].replies[0].id, reply.id);
    assert.equal((await f.request(`/api/comments/items/${root.id}/like`, { user: 2, method: 'POST', body: { enabled: true } })).body.data.likes, 1);
    await f.report(reply.id, 1);
    assert.equal(f.db.prepare('SELECT entry_path FROM comment_reports').get().entry_path, `/moments?post=5&comment=${reply.id}`);
    await f.service.process();
    assert.equal(f.messages[1].url, `https://example.com/moments?post=5&comment=${reply.id}`);
    assert.equal((await f.request(`/api/comments/items/${root.id}`, { user: 1, method: 'DELETE' })).status, 200);
    assert.equal((await f.request('/api/comments/5')).body.total, 0);
});

test('正文长度、跨页面回复、发布限流和评论文本安全边界', async t => {
    const f = await fixture(t);
    const c = await f.post(1, 1, '<script>alert(1)</script>\n不是 HTML');
    assert.equal(c.body, '<script>alert(1)</script>\n不是 HTML', '公开 API 返回纯文本，卡片使用 Vue 文本插值');
    assert.equal((await f.request('/api/comments/2', { user: 2, method: 'POST', body: { body: '跨页面', replyTo: c.id } })).status, 400);
    assert.equal((await f.request('/api/comments/1', { user: 1, method: 'POST', body: { body: '重复过快' } })).status, 429);
    for (const body of ['', '   ', '😀'.repeat(2001)]) assert.equal((await f.request('/api/comments/1', { user: 2, method: 'POST', body: { body } })).status, 400);
    assert.equal((await f.post(2, 1, '😀'.repeat(2000))).body.length, 4000, 'Unicode 字符而非 UTF-16 长度计数');
});

test('点赞唯一且可取消，根评论赞数优先/同赞最新优先，可切换纯时间排序', async t => {
    const f = await fixture(t);
    const older = await f.post(), newer = await f.post(2);
    const like = enabled => f.request(`/api/comments/items/${older.id}/like`, { user: 3, method: 'POST', body: { enabled } });
    assert.equal((await like(true)).body.data.likes, 1);
    assert.equal((await like(true)).body.data.likes, 1);
    assert.equal((await f.request('/api/comments/1', { user: 3 })).body.data[0].id, older.id);
    assert.equal((await f.request('/api/comments/1?sort=latest', { user: 3 })).body.data[0].id, newer.id);
    assert.equal((await like(false)).body.data.likes, 0);
    assert.equal((await like(false)).body.data.likes, 0);
    assert.equal((await f.request('/api/comments/1')).body.data[0].id, newer.id);
});

test('回复回复仍归属同一根评论，默认三条，展开按时间读取且不受点赞影响', async t => {
    const f = await fixture(t);
    const root = await f.post();
    const first = await f.post(2, 1, '首条回复', root.id);
    const second = await f.post(3, 1, '回复首条', first.id);
    assert.equal(second.root_id, root.id); assert.equal(second.reply_to_id, first.id); assert.equal(second.reply_to_name, '用户二');
    const third = await f.post(2, 1, '第三条', second.id);
    const fourth = await f.post(3, 1, '第四条', root.id);
    await f.request(`/api/comments/items/${fourth.id}/like`, { user: 1, method: 'POST', body: { enabled: true } });
    const list = (await f.request('/api/comments/1')).body.data;
    assert.equal(list.length, 1); assert.equal(list[0].reply_count, 4);
    assert.deepEqual(list[0].replies.map(row => row.id), [first.id, second.id, third.id]);
    assert.deepEqual((await f.request(`/api/comments/1/replies/${root.id}`)).body.data.map(row => row.id), [first.id, second.id, third.id, fourth.id]);
    const focused = (await f.request(`/api/comments/1?focus=${fourth.id}`)).body.focusedComment;
    assert.equal(focused.id, fourth.id);
    assert.equal((await f.request(`/api/comments/2/replies/${root.id}`)).status, 404);
});

test('撤回回复保留其他回复及 @ 快照，撤回根评论级联清除回复、点赞与待发邮件', async t => {
    const f = await fixture(t);
    const root = await f.post(), child = await f.post(2, 1, '回复', root.id), grandchild = await f.post(3, 1, '回复回复', child.id);
    assert.equal((await f.request(`/api/comments/items/${root.id}`, { user: 2, method: 'DELETE' })).status, 403);
    assert.equal((await f.request(`/api/comments/items/${child.id}`, { user: 2, method: 'DELETE' })).status, 200);
    const stillHere = f.db.prepare('SELECT * FROM entry_comments WHERE id=?').get(grandchild.id);
    assert.equal(stillHere.root_id, root.id); assert.equal(stillHere.reply_to_id, null); assert.equal(stillHere.reply_to_name, '用户二');
    await f.report(grandchild.id);
    await f.request(`/api/comments/items/${root.id}/like`, { user: 3, method: 'POST', body: { enabled: true } });
    await f.request(`/api/comments/items/${root.id}`, { user: 1, method: 'DELETE' });
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM entry_comments').get().n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM comment_likes').get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM discussion_mail_queue WHERE kind='reply'").get().n, 0);
    const snapshot = f.db.prepare('SELECT * FROM comment_reports').get();
    assert.equal(snapshot.body, '回复回复'); assert.equal(snapshot.comment_id, null); assert.equal(snapshot.action, 'withdrawn');
});

test('举报多选及说明校验，同人重复举报去重；保留并静默后仍成功且无记录、邮件和限流反应', async t => {
    const f = await fixture(t);
    const c = await f.post();
    assert.equal((await f.report(c.id, 2, [])).status, 400);
    assert.equal((await f.report(c.id, 2, ['无效原因'])).status, 400);
    assert.equal((await f.report(c.id, 2, ['其他描述'])).status, 400);
    const normal = await f.report(c.id, 2, ['侵犯权益', '其他描述'], '说明');
    assert.equal(normal.status, 200);
    assert.equal((await f.report(c.id)).status, 200);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM comment_reports').get().n, 1);
    const reports = await f.request('/api/admin/moderation/reports', { admin: true });
    assert.deepEqual(reports.body.data[0].reasons, ['侵犯权益', '其他描述']);
    assert.equal(reports.body.data[0].author_email, 'one@example.com');
    assert.equal((await f.moderate(reports.body.data[0].id, 'keep-mute')).status, 200);
    for (let i = 0; i < 15; i++) assert.deepEqual(await f.report(c.id, 3), normal);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM comment_reports').get().n, 1);
    await f.service.process(); assert.equal(f.messages.length, 0);
});

test('保留、删除与删除封禁可处理根评论或回复，完整快照保留且重复决策被拒绝', async t => {
    const f = await fixture(t);
    const root = await f.post(), child = await f.post(2, 1, '被举报回复', root.id), other = await f.post(3, 1, '另一条回复', root.id);
    await f.report(child.id, 1);
    const id = f.db.prepare('SELECT id FROM comment_reports').get().id;
    assert.equal((await f.moderate(id, 'delete')).status, 200);
    assert.ok(f.db.prepare('SELECT id FROM entry_comments WHERE id=?').get(other.id));
    assert.equal(f.db.prepare('SELECT author_email FROM comment_reports WHERE id=?').get(id).author_email, 'two@example.com');
    assert.equal((await f.moderate(id, 'keep')).status, 409);
    await f.report(root.id, 2); await f.report(root.id, 3);
    const reportId = f.db.prepare("SELECT id FROM comment_reports WHERE status='pending'").get().id;
    assert.equal((await f.moderate(reportId, 'keep')).status, 200);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM comment_reports WHERE status='pending'").get().n, 0);
    const banned = await f.post(2, 1, '需要封禁');
    await f.report(banned.id, 1);
    assert.equal((await f.moderate(f.db.prepare("SELECT id FROM comment_reports WHERE status='pending'").get().id, 'delete-ban')).status, 200);
    assert.ok(f.db.prepare('SELECT email FROM user_blacklist WHERE email=?').get('two@example.com'));
    assert.equal((await f.request('/api/auth/session', { user: 2 })).body.user, null);
});

test('手工黑名单立即撤销登录、阻止注册/验证码/重设/评论，解除不会复活旧会话', async t => {
    const f = await fixture(t);
    assert.equal((await f.request('/api/admin/moderation/blacklist', { admin: true, method: 'POST', body: { email: ' ONE@EXAMPLE.COM ', reason: '手工处理' } })).status, 200);
    assert.equal((await f.request('/api/admin/moderation/blacklist', { admin: true })).body.data[0].email, 'one@example.com');
    assert.equal((await f.request('/api/auth/session', { user: 1 })).body.user, null);
    assert.equal((await f.request('/api/auth/login', { method: 'POST', body: { identity: '用户一', password: 'test-password' } })).status, 403);
    for (const purpose of ['register', 'password-reset']) assert.equal((await f.request('/api/auth/code', { method: 'POST', body: { email: 'one@example.com', purpose } })).status, 403);
    assert.equal((await f.request('/api/auth/register', { method: 'POST', body: { username: '新用户', email: 'one@example.com', password: 'test-password', code: '123456' } })).status, 403);
    assert.equal((await f.request('/api/auth/reset-password', { method: 'POST', body: { email: 'one@example.com', password: 'test-password', code: '123456' } })).status, 403);
    assert.equal((await f.request('/api/comments/1', { user: 1, method: 'POST', body: { body: '被封禁' } })).status, 401);
    assert.equal(f.messages.length, 0);
    await f.request('/api/admin/moderation/blacklist', { admin: true, method: 'DELETE', body: { email: 'one@example.com' } });
    assert.equal((await f.request('/api/auth/session', { user: 1 })).body.user, null);
    assert.equal((await f.request('/api/auth/login', { method: 'POST', body: { identity: '用户一', password: 'test-password' } })).status, 200);
});

test('回复通知默认启用、通知实际 @ 对象；关闭设置跳过待发邮件，回复自己不发邮件', async t => {
    const f = await fixture(t);
    assert.equal((await f.request('/api/auth/session', { user: 1 })).body.user.replyNotifications, true);
    const root = await f.post(), first = await f.post(2, 1, '回复根', root.id);
    await f.service.process();
    assert.equal(f.messages[0].email, 'one@example.com'); assert.match(f.messages[0].url, new RegExp(`/entry/1\\?comment=${first.id}$`));
    const addressed = await f.post(3, 1, '回复用户二', first.id);
    await f.service.process(); assert.equal(f.messages[1].email, 'two@example.com'); assert.match(f.messages[1].url, new RegExp(`comment=${addressed.id}$`));
    await f.post(1, 1, '回复自己', root.id);
    await f.post(2, 1, '等待发送', root.id);
    const settings = await f.request('/api/auth/settings', { user: 1, method: 'POST', body: { replyNotifications: false } });
    assert.equal(settings.body.user.replyNotifications, false);
    await f.service.process(); assert.equal(f.messages.length, 2);
    assert.equal((await f.request('/api/auth/settings', { method: 'POST', body: { replyNotifications: true } })).status, 401);
    assert.equal((await f.request('/api/auth/settings', { user: 1, method: 'POST', body: { replyNotifications: 'yes' } })).status, 400);
    await f.request('/api/auth/settings', { user: 1, method: 'POST', body: { replyNotifications: true } });
    const gallery = await f.post(1, 3), reply = await f.post(2, 3, '图集回复', gallery.id);
    await f.service.process(); assert.equal(f.messages[2].url, `https://example.com/resource/gallery/3?comment=${reply.id}`);
});

test('站长举报邮件共用持久化 30 分钟冷却，边界后可再次提醒，已处理举报不发送', async t => {
    const f = await fixture(t);
    const root = await f.post();
    await f.report(root.id, 2); await f.service.process(); assert.equal(f.messages.length, 1); assert.equal(f.messages[0].email, '12345@qq.com');
    assert.equal(f.messages[0].manageUrl, 'https://example.com/admin?tab=feedback&section=reports');
    await f.report(root.id, 3); await f.createService().process(); assert.equal(f.messages.length, 1);
    f.advance(REPORT_MAIL_COOLDOWN - 1);
    await f.report(root.id, 1); await f.service.process(); assert.equal(f.messages.length, 1);
    f.advance(1);
    const after = f.db.prepare("INSERT INTO entry_comments(entry_id,user_id,body,created_at) VALUES(1,1,'新举报目标',?)").run(new Date().toISOString()).lastInsertRowid;
    await f.report(Number(after), 2); await f.createService().process(); assert.equal(f.messages.length, 2);
    const pending = await f.post(1, 1, '待处理'); await f.report(pending.id, 2);
    await f.moderate(f.db.prepare('SELECT id FROM comment_reports WHERE comment_id=?').get(pending.id).id, 'keep');
    f.advance(REPORT_MAIL_COOLDOWN); await f.service.process(); assert.equal(f.messages.length, 2);
});

test('回复撤回、草稿祖先、被封禁收件者均跳过未发邮件；SMTP 超时不立即重复提醒', async t => {
    let fail = true;
    const f = await fixture(t, { send: async () => { if (fail) throw Object.assign(new Error('offline timeout'), { code: 'ETIMEDOUT' }); } });
    const root = await f.post(); await f.report(root.id, 2); await f.service.process();
    assert.equal(f.messages.length, 0);
    fail = false; f.advance(60000); await f.createService().process(); assert.equal(f.messages.length, 0);
    f.advance(REPORT_MAIL_COOLDOWN); await f.service.process(); assert.equal(f.messages.length, 1);
    const child = await f.post(2, 1, '撤回前', root.id);
    await f.request(`/api/comments/items/${child.id}`, { user: 2, method: 'DELETE' });
    const hiddenRoot = await f.post(1, 2); await f.post(2, 2, '资源回复', hiddenRoot.id);
    f.db.prepare('UPDATE entries SET parent_id=7 WHERE id=2').run();
    await f.post(2, 1, '封禁前', root.id);
    await f.request('/api/admin/moderation/blacklist', { admin: true, method: 'POST', body: { email: 'one@example.com' } });
    await f.service.process(); assert.equal(f.messages.length, 1);
});

test('邮件正文安全转义并包含退订回复提醒的账号操作路径', () => {
    const message = discussionMessage({ kind: 'reply', siteName: '<站名>', title: '<script>笔记</script>', name: '<访客>', body: '<img src=x onerror=alert(1)>',
        details: '回复 @某用户', url: 'https://example.com/entry/1?comment=2', manageUrl: 'https://example.com/account' });
    assert.ok(!message.html.includes('<script>')); assert.match(message.html, /&lt;img/);
    assert.match(message.text, /个人账号 → 账号设置 → 接收回复提醒邮件/); assert.match(message.html, /https:\/\/example.com\/account/);
    assert.match(message.html, /background:#c8d5d7/); assert.ok(!message.html.includes('<img'));
});
