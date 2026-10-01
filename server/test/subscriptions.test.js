import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import Database from '../sqlite.js';
import { migrateUsers } from '../auth/schema.js';
import { subscriptionMessage } from '../auth/mail.js';
import { migrateSubscriptions } from '../subscriptions/schema.js';
import { setSubscription, setSubscriptions, subscriptionState } from '../subscriptions/graph.js';
import { createSubscriptionRoutes } from '../subscriptions/routes.js';
import { createSubscriptionService, NOTIFICATION_COOLDOWN, siteOrigin, notificationPath } from '../subscriptions/service.js';

function fixture(t, options = {}) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrateUsers(db);
    db.exec(`CREATE TABLE profile (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO profile VALUES (1,'测试小站');
        CREATE TABLE resource_types (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO resource_types VALUES (1,'学习资源'),(2,'工具');
        CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT DEFAULT 'resource', resource_kind TEXT DEFAULT 'document',
            parent_id INTEGER REFERENCES entries(id) ON DELETE SET NULL, resource_type_id INTEGER REFERENCES resource_types(id) ON DELETE SET NULL,
            status TEXT DEFAULT 'published', format TEXT DEFAULT 'article', title TEXT DEFAULT '测试内容', summary TEXT DEFAULT '', body TEXT DEFAULT '');
        INSERT INTO users (username,username_key,email,password_hash,created_at) VALUES ('用户一','用户一','one@example.com','test-only','2026-10-01'),
            ('用户二','用户二','two@example.com','test-only','2026-10-01');`);
    // A pre-existing public entry must never trigger a retroactive mailing.
    db.exec("INSERT INTO entries (title) VALUES ('已有资源')");
    migrateSubscriptions(db);
    migrateSubscriptions(db);
    let now = Date.now();
    const messages = [];
    const mailer = { enabled: true, sendNotification: async message => { if (options.send) await options.send(message); messages.push(message); } };
    const createService = () => createSubscriptionService({ db, mailer, origin: 'https://example.com', clock: () => now });
    const service = createService();
    t.after(async () => { await service.stop(); db.close(); });
    const insert = fields => Number(db.prepare('INSERT INTO entries (kind,resource_kind,parent_id,resource_type_id,status,format,title) VALUES (?,?,?,?,?,?,?)')
        .run(fields.kind || 'resource', fields.shape || 'document', fields.parent || null, fields.type || null, fields.status || 'published', fields.format || 'article', fields.title || '新增内容').lastInsertRowid);
    return { db, insert, service, messages, createService, mailer, advance: ms => { now += ms; } };
}

test('分类递归订阅与取消覆盖异类子合集，新子合集自动继承且可单独取消', t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1 });
    const child = f.insert({ shape: 'collection', parent: root, type: 2 });
    const grandchild = f.insert({ shape: 'collection', parent: child });
    let state = setSubscription(f.db, 1, 'resource-type', 1, true);
    for (const id of [root, child, grandchild]) assert.equal(state.collections[id], true);
    const newer = f.insert({ shape: 'collection', parent: grandchild });
    assert.equal(subscriptionState(f.db, 1).collections[newer], true);
    state = setSubscription(f.db, 1, 'collection', child, false);
    assert.equal(state.collections[root], true);
    for (const id of [child, grandchild, newer]) assert.equal(state.collections[id], false);
    state = setSubscription(f.db, 1, 'resource-type', 1, true);
    for (const id of [root, child, grandchild, newer]) assert.equal(state.collections[id], true);
    state = setSubscription(f.db, 1, 'resource-type', 1, false);
    for (const id of [root, child, grandchild, newer]) assert.equal(state.collections[id], false);
    const newest = f.insert({ shape: 'collection', parent: newer });
    assert.equal(subscriptionState(f.db, 1).collections[newest], false);
});

test('全库订阅、分类取消、重新全订阅与全部取消，以及动态三种独立选择', t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1 });
    const child = f.insert({ shape: 'collection', parent: root, type: 2 });
    const tool = f.insert({ shape: 'collection', type: 2 });
    let state = setSubscription(f.db, 1, 'resource-all', 0, true);
    assert.equal(state.resourceTypes[1], true);
    assert.equal(state.collections[child], true);
    state = setSubscription(f.db, 1, 'resource-type', 1, false);
    assert.equal(state.collections[root], false);
    assert.equal(state.collections[child], false);
    assert.equal(state.collections[tool], true);
    state = setSubscription(f.db, 1, 'resource-all', 0, true);
    assert.equal(state.collections[child], true);
    setSubscription(f.db, 1, 'moment-all', 0, true);
    state = setSubscription(f.db, 1, 'moment-short', 0, false);
    assert.equal(state.moments.short, false);
    assert.equal(state.moments.article, true);
    state = setSubscription(f.db, 1, 'resource-all', 0, false);
    assert.equal(state.collections[tool], false);
    assert.equal(state.collections[child], false);
    assert.equal(state.moments.article, true, '全库取消不影响动态');
    state = setSubscription(f.db, 1, 'moment-all', 0, false);
    assert.deepEqual(state.moments, { all: false, short: false, article: false });
    assert.throws(() => setSubscription(f.db, 1, 'collection', 1, true), /不存在/);
});

test('多选保存作为一次事务，写入失败时不会只保存部分选择', t => {
    const f = fixture(t);
    f.db.exec(`CREATE TRIGGER reject_test_article BEFORE INSERT ON subscriptions
        WHEN NEW.scope = 'moment-article' BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;`);
    assert.throws(() => setSubscriptions(f.db, 1, [
        { scope: 'moment-short', targetId: 0, enabled: true },
        { scope: 'moment-article', targetId: 0, enabled: true }
    ]), /simulated storage failure/);
    assert.deepEqual(subscriptionState(f.db, 1).moments, { all: false, short: false, article: false });
});

test('删除分类或合集会递归清理相关订阅，不损伤其他类别', t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1 });
    const child = f.insert({ shape: 'collection', parent: root, type: 2 });
    const grandchild = f.insert({ shape: 'collection', parent: child });
    const unrelated = f.insert({ shape: 'collection', type: 2 });
    setSubscription(f.db, 1, 'resource-type', 1, true);
    setSubscription(f.db, 2, 'collection', grandchild, true);
    setSubscription(f.db, 1, 'collection', unrelated, true);
    f.db.prepare('DELETE FROM resource_types WHERE id = ?').run(1);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM subscriptions WHERE scope = 'collection' AND target_id IN (?,?,?)").get(root, child, grandchild).n, 0);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM subscriptions WHERE scope = 'resource-type'").get().n, 0);
    assert.equal(subscriptionState(f.db, 1).collections[unrelated], true);
    setSubscription(f.db, 1, 'collection', root, true);
    f.db.prepare('DELETE FROM entries WHERE id = ?').run(root);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM subscriptions WHERE scope = 'collection' AND target_id IN (?,?,?)").get(root, child, grandchild).n, 0);
    assert.equal(f.db.prepare('SELECT parent_id FROM entries WHERE id = ?').get(child).parent_id, null);
});

test('只有首次公开触发通知，编辑、重新发布与历史内容不会通知；草稿发布及 AI 同式插入会通知', async t => {
    const f = fixture(t);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM subscription_events').get().n, 0);
    const root = f.insert({ shape: 'collection', type: 1 });
    setSubscription(f.db, 1, 'collection', root, true);
    const report = f.insert({ parent: root, type: 1, title: 'AI 学习报告' });
    await f.service.process();
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].url, `https://example.com/entry/${report}`);
    f.db.prepare("UPDATE entries SET title = '修改后的标题', status = 'published' WHERE id = ?").run(report);
    f.db.prepare("UPDATE entries SET status = 'draft' WHERE id = ?").run(report);
    f.db.prepare("UPDATE entries SET status = 'published' WHERE id = ?").run(report);
    f.advance(NOTIFICATION_COOLDOWN);
    await f.service.process();
    assert.equal(f.messages.length, 1);
    const draft = f.insert({ parent: root, status: 'draft' });
    await f.service.process();
    assert.equal(f.messages.length, 1);
    f.db.prepare("UPDATE entries SET status = 'published' WHERE id = ?").run(draft);
    await f.service.process();
    assert.equal(f.messages.length, 2);
    assert.equal(f.messages[1].url, `https://example.com/entry/${draft}`);
});

test('草稿祖先下的公开子内容不漏发；祖先首次发布时仅产生第一次公开事件', async t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1, status: 'draft' });
    const child = f.insert({ shape: 'collection', parent: root });
    const report = f.insert({ parent: child });
    setSubscription(f.db, 1, 'resource-type', 1, true);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM subscription_events WHERE entry_id IN (?,?,?)').get(root, child, report).n, 0);
    assert.equal(Object.hasOwn(subscriptionState(f.db, 1).collections, root), false);
    f.db.prepare("UPDATE entries SET status = 'published' WHERE id = ?").run(root);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM subscription_events WHERE entry_id IN (?,?,?)').get(root, child, report).n, 3);
    await f.service.process();
    assert.equal(f.messages.length, 1, '三个新增公开条目也不能突破单邮箱冷却');
    f.db.prepare("UPDATE entries SET status = 'published' WHERE id = ?").run(root);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM subscription_events WHERE entry_id IN (?,?,?)').get(root, child, report).n, 3);
});

test('订阅重叠只发送一封，同一邮箱跨动态与资源的 30 分钟限制跨队列重启保持', async t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1 });
    setSubscription(f.db, 1, 'resource-all', 0, true);
    setSubscription(f.db, 1, 'collection', root, true);
    setSubscription(f.db, 1, 'moment-all', 0, true);
    setSubscription(f.db, 2, 'moment-short', 0, true);
    f.insert({ parent: root });
    await f.service.process();
    assert.equal(f.messages.filter(m => m.email === 'one@example.com').length, 1);
    f.advance(NOTIFICATION_COOLDOWN - 1);
    const short = f.insert({ kind: 'moment', format: 'short' });
    const restarted = f.createService();
    await restarted.process();
    assert.equal(f.messages.filter(m => m.email === 'one@example.com').length, 1);
    assert.equal(f.messages.filter(m => m.email === 'two@example.com').length, 1);
    assert.equal(f.messages.at(-1).url, `https://example.com/moments?post=${short}`);
    f.advance(1);
    f.insert({ kind: 'moment', format: 'article' });
    await restarted.process();
    assert.equal(f.messages.filter(m => m.email === 'one@example.com').length, 2);
    assert.equal(f.messages.filter(m => m.email === 'two@example.com').length, 1, '只订阅短帖不会收到长文');
    await restarted.stop();
});

test('订阅后不追发历史事件；取消订阅、删除内容以及隐藏祖先会阻止尚未发送的提醒', async t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1 });
    f.insert({ parent: root });
    setSubscription(f.db, 1, 'collection', root, true);
    await f.service.process();
    assert.equal(f.messages.length, 0);
    f.insert({ parent: root });
    setSubscription(f.db, 1, 'collection', root, false);
    await f.service.process();
    assert.equal(f.messages.length, 0);
    setSubscription(f.db, 1, 'collection', root, true);
    const removed = f.insert({ parent: root });
    f.db.prepare('DELETE FROM entries WHERE id = ?').run(removed);
    await f.service.process();
    assert.equal(f.messages.length, 0);
    f.insert({ parent: root });
    f.db.prepare("UPDATE entries SET status = 'draft' WHERE id = ?").run(root);
    await f.service.process();
    assert.equal(f.messages.length, 0);
});

test('邮件发送失败有持久化重试，取消后不重试；并行处理不会突破冷却', async t => {
    let attempts = 0;
    const f = fixture(t, { send: async () => { attempts++; if (attempts === 1) throw Object.assign(new Error('private mail details'), { code: 'EAUTH' }); } });
    setSubscription(f.db, 1, 'moment-all', 0, true);
    f.insert({ kind: 'moment', format: 'short' });
    await f.service.process();
    assert.equal(f.messages.length, 0);
    assert.equal(f.db.prepare("SELECT status FROM subscription_deliveries").get().status, 'pending');
    setSubscription(f.db, 1, 'moment-all', 0, false);
    f.advance(60000);
    await f.service.process();
    assert.equal(attempts, 1);
    setSubscription(f.db, 1, 'moment-all', 0, true);
    f.insert({ kind: 'moment', format: 'short' });
    f.insert({ kind: 'moment', format: 'article' });
    const other = f.createService();
    await Promise.all([f.service.process(), other.process()]);
    assert.equal(f.messages.length, 1);
    await other.stop();
});

test('SMTP 超时结果不确定时保留冷却，不能在一分钟重试或重启后重复打扰邮箱', async t => {
    let attempts = 0;
    const f = fixture(t, { send: async () => { attempts++; if (attempts === 1) throw Object.assign(new Error('unknown delivery result'), { code: 'ETIMEDOUT' }); } });
    setSubscription(f.db, 1, 'moment-all', 0, true);
    f.insert({ kind: 'moment' });
    await f.service.process();
    assert.equal(attempts, 1);
    const restarted = f.createService();
    f.advance(60000);
    f.insert({ kind: 'moment', format: 'short' });
    await restarted.process();
    assert.equal(attempts, 1);
    f.advance(NOTIFICATION_COOLDOWN);
    await restarted.process();
    assert.equal(attempts, 2);
    assert.equal(f.messages.length, 1);
    await restarted.stop();
});

test('API 仅信任访客会话、校验来源与目标，不可代订其他账号或给普通资源订阅', async t => {
    const f = fixture(t);
    const root = f.insert({ shape: 'collection', type: 1 });
    const app = express();
    app.use(express.json()); app.use('/api/subscriptions', createSubscriptionRoutes({ db: f.db }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const token = randomBytes(32).toString('hex');
    f.db.prepare('INSERT INTO user_sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), 1, Date.now() + 60000);
    const request = async (body, headers = {}, loggedIn = true) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/subscriptions`, {
            method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(loggedIn ? { Cookie: `pp_user_session=${token}` } : {}), ...headers },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: response.status, data: await response.json() };
    };
    assert.equal((await request(undefined, {}, false)).status, 401);
    assert.equal((await request({ scope: 'collection', targetId: root, enabled: true }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request({ scope: 'document', targetId: 1, enabled: true })).status, 400);
    assert.equal((await request({ scope: 'collection', targetId: 1, enabled: true })).status, 404);
    assert.equal((await request({ scope: 'collection', targetId: root, enabled: 'yes' })).status, 400);
    const result = await request({ scope: 'collection', targetId: root, enabled: true, userId: 2, email: 'evil@example.com' });
    assert.equal(result.status, 200);
    assert.equal(result.data.data.collections[root], true);
    assert.equal(subscriptionState(f.db, 2).collections[root], false);
    assert.ok(!JSON.stringify(result.data).includes('one@example.com'));
    const invalidBatch = await request({ changes: [{ scope: 'resource-type', targetId: 2, enabled: true }, { scope: 'resource-type', targetId: 999, enabled: true }] });
    assert.equal(invalidBatch.status, 404);
    assert.equal(subscriptionState(f.db, 1).resourceTypes[2], false, '无效分类不能使部分选择保存');
    const saved = await request({ changes: [{ scope: 'resource-type', targetId: 1, enabled: false }, { scope: 'resource-type', targetId: 2, enabled: true }] });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.data.resourceTypes[1], false);
    assert.equal(saved.data.data.collections[root], false);
    assert.equal(saved.data.data.resourceTypes[2], true);
    assert.equal((await request({ changes: [{ scope: 'resource-type', targetId: 1, enabled: true }, { scope: 'moment-short', enabled: true }] })).status, 400);
    assert.equal((await request({ changes: [{ scope: 'collection', targetId: root, enabled: true }] })).status, 400);
    assert.equal((await request({ changes: [] })).status, 400);
    const moments = await request({ changes: [{ scope: 'moment-short', enabled: true }, { scope: 'moment-article', enabled: false }] });
    assert.equal(moments.status, 200);
    assert.deepEqual(moments.data.data.moments, { all: false, short: true, article: false });
});

test('通知邮件亮色风格与安全转义；域名配置只接受 HTTP(S) 网站根地址', () => {
    const message = subscriptionMessage({ siteName: '小站', title: '<script>bad</script>', summary: '内容', label: '资源', url: 'https://example.com/entry/2', manageUrl: 'https://example.com/resource' });
    assert.ok(!message.html.includes('<script>'));
    assert.match(message.html, /&lt;script&gt;/);
    assert.match(message.html, /href="https:\/\/example.com\/entry\/2"/);
    assert.match(message.html, /#c8d5d7/);
    assert.match(message.text, /管理或取消订阅/);
    assert.equal(siteOrigin({ PUBLIC_SITE_URL: 'https://quininezzzz.top/' }), 'https://quininezzzz.top');
    assert.equal(siteOrigin({ PUBLIC_SITE_URL: 'http://localhost:5188' }), 'http://localhost:5188');
    for (const value of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/path', 'not-a-url']) assert.equal(siteOrigin({ PUBLIC_SITE_URL: value }), null);
    assert.equal(siteOrigin({ NODE_ENV: 'production' }), null);
    assert.equal(notificationPath({ id: 3, kind: 'resource', resource_kind: 'gallery' }), '/resource/gallery/3');
});
