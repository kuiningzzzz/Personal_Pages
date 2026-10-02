import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from '../sqlite.js';
import { migrateUsers } from '../auth/schema.js';
import { createUserRoutes, CODE_TTL, RESEND_DELAY, SESSION_TTL, hashPassword, verifyPassword } from '../auth/routes.js';
import { createRegistrationMailer, verificationMessage } from '../auth/mail.js';

async function fixture(t, options = {}) {
    const db = new Database(':memory:');
    migrateUsers(db);
    db.exec("CREATE TABLE profile (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO profile VALUES (1, '测试小站')");
    let now = Date.now();
    const messages = [];
    const mailer = { enabled: true, send: async message => { messages.push(message); if (options.send) await options.send(message); } };
    const createApp = () => {
        const app = express();
        app.set('trust proxy', 1);
        app.use(express.json());
        app.use('/api/auth', createUserRoutes({ db, mailer, secret: 'test-secret-for-codes', clock: () => now, ...(options.passwordHasher ? { passwordHasher: options.passwordHasher } : {}), ...(options.passwordVerifier ? { passwordVerifier: options.passwordVerifier } : {}) }));
        app.use((error, _req, res, _next) => res.status(500).json({ success: false, message: error.message }));
        return app;
    };
    let server = createApp().listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const clients = [];
    const client = () => {
        let cookie = '';
        const request = async (path, body, headers = {}) => {
            const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
                ...(body === undefined ? {} : { body: JSON.stringify(body) })
            });
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) cookie = setCookie.split(';')[0];
            return { status: response.status, body: await response.json(), headers: response.headers, cookie: setCookie };
        };
        const result = { request, get cookie() { return cookie; }, set cookie(value) { cookie = value; } };
        clients.push(result);
        return result;
    };
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
    return {
        db, messages, mailer, client, get now() { return now; }, advance: milliseconds => { now += milliseconds; },
        async restartRouter() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = createApp().listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); }
    };
}
const signup = (email, code, username = '学习访客') => ({ email, code, username, password: 'a-secure-password-123' });
const reset = (email, code, password = 'new-secure-password-456') => ({ email, code, password, confirmPassword: password });

async function registered(f, c, email = 'reset@example.com') {
    await c.request('/code', { email });
    assert.equal((await c.request('/register', signup(email, f.messages.at(-1).code))).status, 201);
    f.advance(RESEND_DELAY);
    return email;
}

test('邮箱注册、两种登录、私有会话及退出形成完整流程', async t => {
    const f = await fixture(t);
    const browser = f.client();
    const anonymous = f.client();
    assert.equal((await browser.request('/config')).body.data.emailEnabled, true);
    assert.equal((await browser.request('/session')).body.user, null);
    assert.equal((await browser.request('/login', { identity: '陌生访客', password: 'test-password' })).body.message, '此用户尚未注册');
    const sent = await browser.request('/code', { email: ' Learner@Example.com ' });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.expiresAt - sent.body.serverNow, CODE_TTL);
    assert.equal(sent.body.resendAt - sent.body.serverNow, RESEND_DELAY);
    assert.ok(!Object.hasOwn(sent.body, 'code'));
    const mail = f.messages.at(-1);
    assert.equal(mail.email, 'learner@example.com');
    assert.equal(mail.siteName, '测试小站');
    assert.match(mail.code, /^\d{6}$/);
    const storedCode = f.db.prepare('SELECT * FROM registration_codes').get();
    assert.notEqual(storedCode.code_hash, mail.code);
    const registered = await browser.request('/register', signup(mail.email, mail.code));
    assert.equal(registered.status, 201);
    assert.equal(registered.body.user.username, '学习访客');
    assert.ok(!Object.hasOwn(registered.body.user, 'password_hash'));
    assert.match(registered.cookie, /HttpOnly/);
    assert.match(registered.cookie, /SameSite=Strict/);
    assert.match(registered.cookie, /Path=\/api/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM registration_codes').get().n, 0);
    const storedUser = f.db.prepare('SELECT * FROM users').get();
    assert.match(storedUser.password_hash, /^scrypt:/);
    assert.equal(await verifyPassword(signup('', '').password, storedUser.password_hash), true);
    assert.equal(await verifyPassword('incorrect', storedUser.password_hash), false);
    assert.notEqual(f.db.prepare('SELECT token_hash FROM user_sessions').get().token_hash, browser.cookie.split('=')[1]);
    assert.equal((await anonymous.request('/session')).body.user, null);
    assert.equal((await browser.request('/session')).headers.get('cache-control'), 'no-store');
    assert.equal((await browser.request('/session')).body.user.email, mail.email);
    assert.equal((await browser.request('/code', { email: mail.email })).status, 409);
    const originalCookie = browser.cookie;
    await f.restartRouter();
    assert.equal((await browser.request('/session')).body.user.username, '学习访客', '重启路由后登录凭据仍有效');
    assert.equal((await browser.request('/logout', {})).status, 200);
    anonymous.cookie = originalCookie;
    assert.equal((await anonymous.request('/session')).body.user, null, '退出后复制的旧 cookie 也失效');
    assert.equal((await browser.request('/login', { identity: mail.email, password: 'wrong-password' })).status, 401);
    assert.equal((await browser.request('/login', { identity: 'LEARNER@EXAMPLE.COM', password: signup('', '').password })).status, 200);
    await browser.request('/logout', {});
    assert.equal((await browser.request('/login', { identity: '学习访客', password: signup('', '').password })).status, 200);
    f.advance(SESSION_TTL);
    assert.equal((await browser.request('/session')).body.user, null, '七天后登录过期');
    assert.ok(f.db.prepare('SELECT key FROM user_auth_limits').all().every(row => /^[a-f0-9]{64}$/.test(row.key)));
});

test('一分钟冷却跨路由重启保持，重发后旧验证码不能注册', async t => {
    const f = await fixture(t);
    const c = f.client();
    await c.request('/code', { email: 'resend@example.com' });
    const old = f.messages.at(-1).code;
    f.advance(RESEND_DELAY - 1);
    await f.restartRouter();
    const early = await c.request('/code', { email: 'RESEND@example.com' });
    assert.equal(early.status, 429);
    assert.equal(early.headers.get('retry-after'), '1');
    assert.equal(f.messages.length, 1);
    f.advance(1);
    assert.equal((await c.request('/code', { email: 'resend@example.com' })).status, 200);
    const latest = f.messages.at(-1).code;
    assert.notEqual(old, latest);
    assert.equal((await c.request('/register', signup('resend@example.com', old))).status, 400);
    assert.equal((await c.request('/register', signup('resend@example.com', latest))).status, 201);
});

test('验证码恰好两分钟时失效，五次猜码后正确验证码也不能使用', async t => {
    const f = await fixture(t);
    const c = f.client();
    await c.request('/code', { email: 'expiry@example.com' });
    const expired = f.messages.at(-1).code;
    f.advance(CODE_TTL);
    assert.match((await c.request('/register', signup('expiry@example.com', expired))).body.message, /失效/);
    await c.request('/code', { email: 'guess@example.com' });
    const correct = f.messages.at(-1).code;
    const wrong = correct === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await c.request('/register', signup('guess@example.com', wrong))).status, 400);
    assert.match((await c.request('/register', signup('guess@example.com', correct))).body.message, /次数过多/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
    f.advance(RESEND_DELAY);
    await c.request('/code', { email: 'guess@example.com' });
    assert.equal((await c.request('/register', signup('guess@example.com', f.messages.at(-1).code))).status, 201);
});

test('用户名规范化、密码长度、注册唯一性及登录限流', async t => {
    const f = await fixture(t);
    const c = f.client();
    await c.request('/code', { email: 'first@example.com' });
    const code = f.messages.at(-1).code;
    assert.equal((await c.request('/register', { ...signup('first@example.com', code, 'Visitor_01'), password: 'short' })).status, 400);
    assert.equal((await c.request('/register', signup('first@example.com', code, 'Ｖｉｓｉｔｏｒ_01'))).status, 201);
    assert.equal((await c.request('/login', { identity: 'visitor_01', password: signup('', '').password })).status, 200);
    assert.equal((await c.request('/register', signup('other@example.com', code, 'VISITOR_01'))).status, 409);
    assert.equal((await c.request('/register', signup('first@example.com', code, '另一用户'))).status, 409);
    for (let i = 0; i < 10; i++) assert.equal((await c.request('/login', { identity: 'never_registered', password: 'any-password' })).status, 404);
    assert.equal((await c.request('/login', { identity: 'never_registered', password: 'any-password' })).status, 429);
});

test('邮件发送在途及并发请求不会生成两个可用验证码', async t => {
    let release;
    let mailStarted;
    const started = new Promise(resolve => { mailStarted = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const f = await fixture(t, { send: async () => { mailStarted(); await gate; } });
    const c = f.client();
    const pending = c.request('/code', { email: 'pending@example.com' });
    await started;
    assert.equal((await c.request('/code', { email: 'pending@example.com' })).status, 429);
    const code = f.messages.at(-1).code;
    assert.match((await c.request('/register', signup('pending@example.com', code))).body.message, /正在发送/);
    release();
    assert.equal((await pending).status, 200);
    assert.equal(f.messages.length, 1);
    assert.equal((await c.request('/register', signup('pending@example.com', code))).status, 201);
});

test('密码计算期间发生重发、到期或并发注册，旧验证不能绕过校验', async t => {
    for (const operation of ['resend', 'expire', 'duplicate']) {
        let release;
        let hashing;
        const gate = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { hashing = resolve; });
        const f = await fixture(t, { passwordHasher: async () => { hashing(); await gate; return 'unused-test-hash'; } });
        const c = f.client();
        const email = `${operation}@example.com`;
        await c.request('/code', { email });
        const pending = c.request('/register', signup(email, f.messages.at(-1).code));
        await started;
        if (operation === 'resend') { f.advance(RESEND_DELAY); await c.request('/code', { email }); }
        if (operation === 'expire') f.advance(CODE_TTL);
        if (operation === 'duplicate') { f.db.prepare('INSERT INTO users (username, username_key, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run('别人', '别人', email, 'already-registered', '2026-10-01'); }
        release();
        const outcome = await pending;
        assert.equal(outcome.status, operation === 'duplicate' ? 409 : 400);
        assert.equal(f.db.prepare('SELECT count(*) AS n FROM users WHERE username = ?').get('学习访客').n, 0);
    }
});

test('邮件失败、未配置邮箱以及跨站请求不会产生注册或可用验证码', async t => {
    const f = await fixture(t, { send: async () => { throw Object.assign(new Error('private SMTP response'), { code: 'EAUTH' }); } });
    const c = f.client();
    const failure = await c.request('/code', { email: 'failure@example.com' });
    assert.equal(failure.status, 502);
    assert.ok(!JSON.stringify(failure.body).includes('private SMTP response'));
    const code = f.messages.at(-1).code;
    assert.match((await c.request('/register', signup('failure@example.com', code))).body.message, /发送失败/);
    assert.equal((await c.request('/code', { email: 'failure@example.com' })).status, 429);
    f.mailer.enabled = false;
    assert.equal((await c.request('/config')).body.data.emailEnabled, false);
    assert.equal((await c.request('/code', { email: 'other@example.com' })).status, 503);
    assert.equal((await c.request('/register', signup('other@example.com', code))).status, 400);
    assert.equal((await c.request('/logout', {}, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await c.request('/login', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await c.request('/logout', {}, { Origin: 'invalid-origin' })).status, 403);
    assert.equal((await c.request('/logout', {}, { 'Content-Type': 'text/plain' })).status, 415);
    const secure = await c.request('/logout', {}, { 'X-Forwarded-Proto': 'https' });
    assert.match(secure.cookie, /Secure/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('验证码邮件使用亮色色块、纯文本替代内容和安全转义', () => {
    const message = verificationMessage({ siteName: '<img src=x onerror=alert(1)>', code: '012345' });
    assert.ok(message.html.includes('&lt;img'));
    assert.ok(!message.html.includes('<img'));
    assert.ok(message.html.includes('#f4efe6'));
    assert.ok(message.html.includes('#c8d5d7'));
    assert.ok(message.html.includes('012345'));
    assert.ok(message.text.includes('012345'));
    assert.ok(message.text.includes('2 分钟'));
    assert.equal(createRegistrationMailer({}).enabled, false);
    assert.equal(createRegistrationMailer({ QQ_SMTP_USER: 'owner@qq.com', QQ_SMTP_AUTH_CODE: 'abcd efgh ijkl mnop' }).enabled, true);
    const recovery = verificationMessage({ siteName: '测试小站', code: '123456', purpose: 'password-reset' });
    assert.match(recovery.subject, /重设密码验证码/);
    assert.match(recovery.html, /重设你的密码/);
    assert.match(recovery.text, /其他设备的登录状态将失效/);
    assert.ok(!recovery.text.includes('本次注册'));
});

test('验证码重设密码后自动登录，撤销全部旧会话及旧密码，验证码只能使用一次', async t => {
    const f = await fixture(t);
    const first = f.client();
    const email = await registered(f, first);
    const second = f.client();
    assert.equal((await second.request('/login', { identity: email, password: signup('', '').password })).status, 200);
    const oldFirstCookie = first.cookie;
    const oldSecondCookie = second.cookie;
    const recovery = f.client();
    assert.equal((await recovery.request('/code', { email, purpose: 'password-reset' })).status, 200);
    const code = f.messages.at(-1).code;
    assert.equal(f.messages.at(-1).purpose, 'password-reset');
    assert.equal((await recovery.request('/reset-password', { ...reset(email, code), confirmPassword: 'different-password' })).status, 400);
    assert.equal((await recovery.request('/reset-password', reset(email, code, 'short'))).status, 400);
    assert.equal((await first.request('/session')).body.user.email, email, '发送验证码不撤销旧会话');
    const result = await recovery.request('/reset-password', reset(email, code));
    assert.equal(result.status, 200);
    assert.equal(result.body.user.email, email);
    assert.ok(!Object.hasOwn(result.body.user, 'password_hash'));
    assert.match(result.cookie, /HttpOnly/);
    assert.notEqual(recovery.cookie, oldFirstCookie);
    assert.equal((await recovery.request('/session')).body.user.email, email);
    first.cookie = oldFirstCookie;
    second.cookie = oldSecondCookie;
    assert.equal((await first.request('/session')).body.user, null);
    assert.equal((await second.request('/session')).body.user, null);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM user_sessions').get().n, 1);
    assert.equal((await recovery.request('/reset-password', reset(email, code))).status, 400);
    assert.equal((await recovery.request('/code', { email, purpose: 'password-reset' })).status, 429, '消费验证码后仍需等待重发');
    assert.equal((await first.request('/login', { identity: email, password: signup('', '').password })).status, 401);
    assert.equal((await first.request('/login', { identity: '学习访客', password: reset('', '').password })).status, 200);
});

test('重设码只允许已注册邮箱申请，注册与重设码用途隔离', async t => {
    const f = await fixture(t);
    const c = f.client();
    assert.equal((await c.request('/code', { email: 'unknown@example.com', purpose: 'password-reset' })).status, 404);
    assert.equal((await c.request('/reset-password', reset('unknown@example.com', '123456'))).body.message, '此用户尚未注册');
    assert.equal((await c.request('/code', { email: 'unknown@example.com', purpose: 'other' })).status, 400);
    assert.equal(f.messages.length, 0);
    const email = await registered(f, c);
    await c.request('/code', { email, purpose: 'password-reset' });
    // A pre-existing registration code from before account creation cannot
    // authorize resetting an account, even when its numeric code is known.
    f.db.prepare("UPDATE registration_codes SET purpose = 'register' WHERE email = ?").run(email);
    const wrongPurpose = await c.request('/reset-password', reset(email, f.messages.at(-1).code));
    assert.match(wrongPurpose.body.message, /用途不匹配/);
    assert.equal(f.db.prepare('SELECT attempts FROM registration_codes WHERE email = ?').get(email).attempts, 0);
    f.db.prepare("UPDATE registration_codes SET purpose = 'password-reset' WHERE email = ?").run(email);
    // Simulate an account being removed: a recovery code cannot create a user.
    f.db.prepare('DELETE FROM user_sessions').run();
    f.db.prepare('DELETE FROM users WHERE email = ?').run(email);
    assert.match((await c.request('/register', signup(email, f.messages.at(-1).code))).body.message, /用途不匹配/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('重设码遵守重发替换、两分钟过期、五次猜码限制，失败时不改变密码或会话', async t => {
    const f = await fixture(t);
    const c = f.client();
    const email = await registered(f, c);
    const stored = f.db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email).password_hash;
    await c.request('/code', { email, purpose: 'password-reset' });
    const old = f.messages.at(-1).code;
    assert.equal((await c.request('/code', { email, purpose: 'password-reset' })).status, 429);
    f.advance(RESEND_DELAY);
    await f.restartRouter();
    await c.request('/code', { email, purpose: 'password-reset' });
    const current = f.messages.at(-1).code;
    assert.notEqual(current, old);
    assert.equal((await c.request('/reset-password', reset(email, old))).status, 400);
    const wrong = current === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) assert.equal((await c.request('/reset-password', reset(email, wrong))).status, 400);
    assert.match((await c.request('/reset-password', reset(email, current))).body.message, /次数过多/);
    assert.equal((await c.request('/session')).body.user.email, email);
    f.advance(RESEND_DELAY);
    await c.request('/code', { email, purpose: 'password-reset' });
    f.advance(CODE_TTL);
    assert.match((await c.request('/reset-password', reset(email, f.messages.at(-1).code))).body.message, /失效/);
    assert.equal(f.db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email).password_hash, stored);
});

test('重设密码计算期间的重发、过期和并发消费不能使用已校验的旧码', async t => {
    for (const operation of ['resend', 'expire', 'consume']) {
        let release;
        let hashing;
        const gate = new Promise(resolve => { release = resolve; });
        const started = new Promise(resolve => { hashing = resolve; });
        let block = false;
        const f = await fixture(t, { passwordHasher: async password => {
            if (block) { hashing(); await gate; }
            return hashPassword(password);
        } });
        const c = f.client();
        const email = await registered(f, c);
        const stored = f.db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email).password_hash;
        await c.request('/code', { email, purpose: 'password-reset' });
        block = true;
        const pending = c.request('/reset-password', reset(email, f.messages.at(-1).code));
        await started;
        if (operation === 'resend') { f.advance(RESEND_DELAY); await c.request('/code', { email, purpose: 'password-reset' }); }
        if (operation === 'expire') f.advance(CODE_TTL);
        if (operation === 'consume') f.db.prepare('DELETE FROM registration_codes WHERE email = ?').run(email);
        release();
        assert.equal((await pending).status, 400);
        assert.equal(f.db.prepare('SELECT password_hash FROM users WHERE email = ?').get(email).password_hash, stored);
        assert.equal((await c.request('/session')).body.user.email, email);
    }
});

test('旧密码登录计算期间发生重设，不能重新建立旧密码会话', async t => {
    let release;
    let verifying;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { verifying = resolve; });
    const f = await fixture(t, { passwordVerifier: async (password, hash) => {
        const valid = await verifyPassword(password, hash);
        verifying(); await gate;
        return valid;
    } });
    const c = f.client();
    const email = await registered(f, c);
    const other = f.client();
    const oldLogin = other.request('/login', { identity: email, password: signup('', '').password });
    await started;
    await c.request('/code', { email, purpose: 'password-reset' });
    assert.equal((await c.request('/reset-password', reset(email, f.messages.at(-1).code))).status, 200);
    release();
    assert.equal((await oldLogin).status, 401);
    assert.equal((await other.request('/session')).body.user, null);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM user_sessions').get().n, 1);
});

test('现有验证码表自动迁移用途字段且重复迁移保留原数据', () => {
    const db = new Database(':memory:');
    try {
        db.exec(`CREATE TABLE registration_codes (email TEXT PRIMARY KEY, nonce TEXT NOT NULL, code_hash TEXT NOT NULL,
            sent_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0);
            INSERT INTO registration_codes VALUES ('legacy@example.com', 'nonce', 'hash', 1, 2, 0, 1)`);
        migrateUsers(db);
        migrateUsers(db);
        assert.equal(db.prepare('SELECT purpose FROM registration_codes').get().purpose, 'register');
        assert.equal(db.prepare('SELECT code_hash FROM registration_codes').get().code_hash, 'hash');
    } finally { db.close(); }
});
