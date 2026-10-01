import express from 'express';
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export const CODE_TTL = 2 * 60 * 1000;
export const RESEND_DELAY = 60 * 1000;
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'pp_user_session';
const derive = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const digest = token => createHash('sha256').update(token).digest('hex');
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);
const normalizeUsername = value => typeof value === 'string' ? value.trim().normalize('NFKC') : '';
const usernameKey = value => normalizeUsername(value).toLowerCase();
const publicUser = row => ({ id: row.id, username: row.username, email: row.email, createdAt: row.created_at });
const equalHex = (a, b) => Boolean(a && b && a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')));

export async function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const key = await derive(password, salt, 64, scryptOptions);
    return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
    const [algorithm, salt, hash] = stored.split(':');
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
    return equalHex((await derive(password, salt, 64, scryptOptions)).toString('hex'), hash);
}

// Dependency injection keeps tests entirely offline: fake mail + controllable
// time, without adding a test transport or a verification-code API to production.
export function createUserRoutes({ db, mailer, secret, clock = Date.now, passwordHasher = hashPassword, passwordVerifier = verifyPassword }) {
    const router = express.Router();
    const keyFor = value => createHmac('sha256', secret).update(value).digest('hex');
    const codeHash = (email, nonce, code, purpose = 'register') => keyFor(`${purpose === 'register' ? 'code' : 'password-reset-code'}:${email}:${nonce}:${code}`);
    let lastCleanup = 0;
    const error = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
    const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
    const tokenFor = req => {
        const match = String(req.get('cookie') || '').match(/(?:^|;\s*)pp_user_session=([a-f0-9]{64})(?:;|$)/);
        return match?.[1];
    };
    const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api', maxAge: SESSION_TTL });
    const clearCookie = (req, res) => {
        const { maxAge, ...options } = cookieOptions(req);
        res.clearCookie(COOKIE, options);
    };
    const openSession = (req, res, row) => {
        const token = randomBytes(32).toString('hex');
        const previous = tokenFor(req);
        db.transaction(() => {
            if (previous) db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(digest(previous));
            db.prepare('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(digest(token), row.id, clock() + SESSION_TTL);
        })();
        res.cookie(COOKIE, token, cookieOptions(req));
    };
    const throttle = (res, scope, value, max, window) => {
        const key = keyFor(`${scope}:${value}`);
        const now = clock();
        const state = db.prepare('SELECT count, expires_at FROM user_auth_limits WHERE key = ?').get(key);
        if (state && state.expires_at > now && state.count >= max) {
            res.set('Retry-After', String(Math.ceil((state.expires_at - now) / 1000)));
            error(res, 429, '请求过于频繁，请稍后再试', { retryAt: state.expires_at, serverNow: now });
            return false;
        }
        db.prepare(`INSERT INTO user_auth_limits (key, count, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET count = excluded.count, expires_at = excluded.expires_at`)
            .run(key, state && state.expires_at > now ? state.count + 1 : 1, state && state.expires_at > now ? state.expires_at : now + window);
        return true;
    };
    const checkCode = (email, supplied, purpose = 'register') => {
        const row = db.prepare('SELECT * FROM registration_codes WHERE email = ?').get(email);
        if (!row || row.expires_at <= clock()) return { error: '验证码已失效，请重新获取' };
        if (row.purpose !== purpose) return { error: '验证码用途不匹配，请重新获取' };
        if (row.delivered < 0) return { error: '验证码发送失败，请重新获取' };
        if (!row.delivered) return { error: '验证码正在发送，请稍后再试' };
        if (row.attempts >= 5) return { error: '验证码错误次数过多，请重新获取' };
        if (!equalHex(row.code_hash, codeHash(email, row.nonce, supplied, purpose))) {
            db.prepare('UPDATE registration_codes SET attempts = attempts + 1 WHERE email = ? AND nonce = ?').run(email, row.nonce);
            return { error: row.attempts >= 4 ? '验证码错误次数过多，请重新获取' : '验证码不正确' };
        }
        return row;
    };

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (clock() - lastCleanup >= 60 * 1000) {
            const now = clock();
            db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(now);
            db.prepare('DELETE FROM user_auth_limits WHERE expires_at <= ?').run(now);
            db.prepare('DELETE FROM registration_codes WHERE expires_at <= ? AND sent_at + ? <= ?').run(now, RESEND_DELAY, now);
            lastCleanup = now;
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            const origin = req.get('origin');
            if (req.get('sec-fetch-site') === 'cross-site') return error(res, 403, '请求来源无效');
            if (origin) {
                try { if (new URL(origin).origin !== `${req.protocol}://${req.get('host')}`) return error(res, 403, '请求来源无效'); }
                catch { return error(res, 403, '请求来源无效'); }
            }
            if (!req.is('application/json')) return error(res, 415, '请使用 JSON 请求');
        }
        next();
    });

    router.get('/config', (_req, res) => res.json({ success: true, data: { emailEnabled: mailer.enabled, codeTtlSeconds: CODE_TTL / 1000, resendSeconds: RESEND_DELAY / 1000 } }));
    router.get('/session', (req, res) => {
        const token = tokenFor(req);
        const row = token ? db.prepare(`SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(digest(token), clock()) : null;
        if (token && !row) clearCookie(req, res);
        res.json({ success: true, user: row ? publicUser(row) : null });
    });

    router.post('/code', asyncRoute(async (req, res) => {
        const email = normalizeEmail(req.body?.email);
        const purpose = req.body?.purpose ?? 'register';
        if (!['register', 'password-reset'].includes(purpose)) return error(res, 400, '验证码用途无效');
        if (!validEmail(email)) return error(res, 400, '请填写有效的邮箱地址');
        if (!mailer.enabled) return error(res, 503, '邮箱验证服务尚未配置，请稍后再来');
        if (!throttle(res, 'code-ip', req.ip, 10, 15 * 60 * 1000)) return;
        const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (purpose === 'register' && user) return error(res, 409, '该邮箱已注册，请直接登录');
        if (purpose === 'password-reset' && !user) return error(res, 404, '此用户尚未注册');
        const now = clock();
        const previous = db.prepare('SELECT sent_at FROM registration_codes WHERE email = ?').get(email);
        const resendKey = keyFor(`code-resend:${email}`);
        const cooldown = db.prepare('SELECT expires_at FROM user_auth_limits WHERE key = ?').get(resendKey);
        const retryAt = Math.max(previous ? previous.sent_at + RESEND_DELAY : 0, cooldown?.expires_at || 0);
        if (retryAt > now) {
            res.set('Retry-After', String(Math.ceil((retryAt - now) / 1000)));
            return error(res, 429, '请等待一分钟后再获取验证码', { retryAt, serverNow: now });
        }
        if (!throttle(res, 'code-email', email, 20, 24 * 60 * 60 * 1000)) return;
        if (!throttle(res, 'code-global', 'site', 100, 60 * 60 * 1000)) return;
        // Consuming a code must not erase its resend cooldown.
        db.prepare(`INSERT INTO user_auth_limits (key, count, expires_at) VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET count = 1, expires_at = excluded.expires_at`).run(resendKey, now + RESEND_DELAY);
        const nonce = randomBytes(16).toString('hex');
        // Choose a different number as well, so a superseded code never happens
        // to match the replacement six-digit code by chance.
        const old = db.prepare('SELECT nonce, code_hash, purpose FROM registration_codes WHERE email = ?').get(email);
        let code;
        do { code = String(randomInt(0, 1000000)).padStart(6, '0'); }
        while (old && equalHex(old.code_hash, codeHash(email, old.nonce, code, old.purpose)));
        db.prepare(`INSERT INTO registration_codes (email, nonce, code_hash, sent_at, expires_at, attempts, delivered, purpose) VALUES (?, ?, ?, ?, ?, 0, 0, ?)
            ON CONFLICT(email) DO UPDATE SET nonce = excluded.nonce, code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at, attempts = 0, delivered = 0, purpose = excluded.purpose`)
            .run(email, nonce, codeHash(email, nonce, code, purpose), now, now + CODE_TTL, purpose);
        try {
            const siteName = db.prepare('SELECT name FROM profile WHERE id = 1').get()?.name || '个人主页';
            await mailer.send({ email, code, siteName, purpose });
        } catch (cause) {
            db.prepare('UPDATE registration_codes SET delivered = -1, code_hash = ? WHERE email = ? AND nonce = ?').run('', email, nonce);
            // Only a diagnostic category: never log the recipient, code, SMTP
            // response, message body, or credentials.
            console.warn('邮箱验证码发送失败:', String(cause.code || 'MAIL_DELIVERY_FAILED'));
            return error(res, 502, '验证码发送失败，请稍后重试或联系站点管理员');
        }
        const deliveredAt = clock();
        const result = db.prepare('UPDATE registration_codes SET delivered = 1, expires_at = ? WHERE email = ? AND nonce = ?').run(deliveredAt + CODE_TTL, email, nonce);
        if (!result.changes) return error(res, 409, '该验证码已被新请求替换，请使用最新邮件中的验证码');
        res.json({ success: true, message: '验证码已发送，请留意收件箱或垃圾邮件', email, serverNow: deliveredAt, expiresAt: deliveredAt + CODE_TTL, resendAt: now + RESEND_DELAY });
    }));

    router.post('/register', asyncRoute(async (req, res) => {
        if (!throttle(res, 'register-ip', req.ip, 20, 15 * 60 * 1000)) return;
        const username = normalizeUsername(req.body?.username);
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username)) return error(res, 400, '用户名需为 2–24 个汉字、字母、数字、下划线或连字符');
        if (!validEmail(email)) return error(res, 400, '请填写有效的邮箱地址');
        if (typeof password !== 'string' || [...password].length < 8 || [...password].length > 128) return error(res, 400, '密码长度需为 8–128 个字符');
        if (!/^\d{6}$/.test(code)) return error(res, 400, '请填写 6 位邮箱验证码');
        if (db.prepare('SELECT id FROM users WHERE username_key = ?').get(usernameKey(username))) return error(res, 409, '这个用户名已被使用，请换一个');
        if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return error(res, 409, '该邮箱已注册，请直接登录');
        const verified = checkCode(email, code);
        if (verified.error) return error(res, 400, verified.error);
        const passwordHash = await passwordHasher(password);
        const outcome = db.transaction(() => {
            // Recheck after async password hashing: resend, expiration, and
            // simultaneous registration must not reuse an already checked code.
            const current = checkCode(email, code);
            if (current.error) return current;
            if (db.prepare('SELECT id FROM users WHERE email = ? OR username_key = ?').get(email, usernameKey(username))) return { error: '邮箱或用户名已注册，请检查后重试', conflict: true };
            const created = db.prepare('INSERT INTO users (username, username_key, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
                .run(username, usernameKey(username), email, passwordHash, new Date(clock()).toISOString());
            db.prepare('DELETE FROM registration_codes WHERE email = ?').run(email);
            return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(created.lastInsertRowid));
        })();
        if (outcome.error) return error(res, outcome.conflict ? 409 : 400, outcome.error);
        openSession(req, res, outcome);
        res.status(201).json({ success: true, user: publicUser(outcome) });
    }));

    router.post('/reset-password', asyncRoute(async (req, res) => {
        if (!throttle(res, 'reset-ip', req.ip, 20, 15 * 60 * 1000)) return;
        const email = normalizeEmail(req.body?.email);
        const password = req.body?.password;
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        if (!validEmail(email)) return error(res, 400, '请填写有效的邮箱地址');
        if (typeof password !== 'string' || [...password].length < 8 || [...password].length > 128) return error(res, 400, '密码长度需为 8–128 个字符');
        if (password !== req.body?.confirmPassword) return error(res, 400, '两次输入的新密码不一致');
        if (!/^\d{6}$/.test(code)) return error(res, 400, '请填写 6 位邮箱验证码');
        if (!db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return error(res, 404, '此用户尚未注册');
        const verified = checkCode(email, code, 'password-reset');
        if (verified.error) return error(res, 400, verified.error);
        const passwordHash = await passwordHasher(password);
        const outcome = db.transaction(() => {
            const current = checkCode(email, code, 'password-reset');
            if (current.error) return current;
            const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
            if (!row) return { error: '此用户尚未注册', missing: true };
            db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.id);
            db.prepare('DELETE FROM registration_codes WHERE email = ?').run(email);
            db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(row.id);
            for (const identity of [email, row.username_key]) {
                db.prepare('DELETE FROM user_auth_limits WHERE key = ?').run(keyFor(`login-identity:${identity}`));
            }
            return row;
        })();
        if (outcome.error) return error(res, outcome.missing ? 404 : 400, outcome.error);
        openSession(req, res, outcome);
        res.json({ success: true, message: '密码已重设，已为你登录；其他设备需重新登录', user: publicUser(outcome) });
    }));

    router.post('/login', asyncRoute(async (req, res) => {
        const identity = typeof req.body?.identity === 'string' ? req.body.identity.trim() : '';
        const password = req.body?.password;
        if (!identity || identity.length > 254 || typeof password !== 'string' || !password || [...password].length > 128) return error(res, 400, '请填写用户名或邮箱，以及登录密码');
        if (!throttle(res, 'login-ip', req.ip, 30, 15 * 60 * 1000)) return;
        if (!throttle(res, 'login-identity', identity.includes('@') ? normalizeEmail(identity) : usernameKey(identity), 10, 15 * 60 * 1000)) return;
        const row = identity.includes('@') ? db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(identity)) : db.prepare('SELECT * FROM users WHERE username_key = ?').get(usernameKey(identity));
        if (!row) return error(res, 404, '此用户尚未注册');
        if (!await passwordVerifier(password, row.password_hash)) return error(res, 401, '密码不正确，请重新输入');
        // A password reset may finish while scrypt is running. Never recreate
        // an old-password session after that reset revoked existing sessions.
        if (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(row.id)?.password_hash !== row.password_hash) return error(res, 401, '密码已更新，请使用新密码登录');
        db.prepare('DELETE FROM user_auth_limits WHERE key = ?').run(keyFor(`login-identity:${identity.includes('@') ? normalizeEmail(identity) : usernameKey(identity)}`));
        openSession(req, res, row);
        res.json({ success: true, user: publicUser(row) });
    }));
    router.post('/logout', (req, res) => {
        const token = tokenFor(req);
        if (token) db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(digest(token));
        clearCookie(req, res);
        res.json({ success: true });
    });
    return router;
}
