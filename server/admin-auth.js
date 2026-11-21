import express from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export const DAY = 86400000;
const COOKIE = 'pp_admin_session';
const hash = value => createHash('sha256').update(value).digest('hex');
export function initializeAdminAuth(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS failures(id INTEGER PRIMARY KEY,ip TEXT NOT NULL,created_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS failure_time ON failures(created_at);
        CREATE TABLE IF NOT EXISTS bans(subject TEXT PRIMARY KEY,until INTEGER NOT NULL);`);
}
export function otpVerifier({ url = process.env.QPA_VERIFY_URL, client = process.env.QPA_CLIENT_ID, token = process.env.QPA_PROJECT_TOKEN, request = fetch } = {}) {
    return async code => {
        if (!url || !client || !token || new URL(url).protocol !== 'https:') throw new Error('OTP_UNAVAILABLE');
        const response = await request(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
            headers: { Authorization: `Bearer ${token}`, 'X-Client-ID': client, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        if (response.status !== 200) throw new Error('OTP_UNAVAILABLE');
        const result = await response.json();
        if (typeof result.valid !== 'boolean') throw new Error('OTP_UNAVAILABLE');
        return result.valid === true;
    };
}
export function createAdminAuth({ db, password = process.env.ADMIN_PASSWORD || '', verifyOtp = otpVerifier(), clock = Date.now }) {
    initializeAdminAuth(db);
    const router = express.Router();
    const cookie = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api/admin' });
    const clear = (req, res) => res.clearCookie(COOKIE, cookie(req));
    const token = req => String(req.get('cookie') || '').match(/(?:^|;\s*)pp_admin_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    const session = req => { const raw = token(req); return raw && db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(raw), clock()); };
    const blocked = ip => db.prepare('SELECT until FROM bans WHERE subject IN (?,?) AND until>? ORDER BY until DESC LIMIT 1').get('global', `ip:${ip}`, clock());
    function failure(ip) {
        db.transaction(() => {
            db.prepare('INSERT INTO failures(ip,created_at) VALUES(?,?)').run(ip, clock());
            if (db.prepare('SELECT count(*) AS n FROM failures WHERE ip=? AND created_at>?').get(ip, clock() - 7 * DAY).n >= 3)
                db.prepare('INSERT OR REPLACE INTO bans VALUES(?,?)').run(`ip:${ip}`, clock() + 7 * DAY);
            if (db.prepare('SELECT count(*) AS n FROM failures WHERE created_at>?').get(clock() - DAY).n > 10)
                db.prepare('INSERT OR REPLACE INTO bans VALUES(?,?)').run('global', clock() + DAY);
        })();
    }
    let lastCleanup = 0;
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (clock() - lastCleanup > 60000) {
            db.prepare('DELETE FROM failures WHERE created_at<=?').run(clock() - 7 * DAY);
            db.prepare('DELETE FROM bans WHERE until<=?').run(clock());
            db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(clock()); lastCleanup = clock();
        }
        const ban = blocked(req.ip);
        if (ban) { clear(req, res); res.set('Retry-After', String(Math.ceil((ban.until - clock()) / 1000))); return res.status(429).json({ success: false, authenticated: false, message: '管理功能暂时锁定，请稍后再试', retryAt: ban.until }); }
        if (!['GET', 'HEAD'].includes(req.method)) {
            try { if (req.get('sec-fetch-site') === 'cross-site' || req.get('origin') && new URL(req.get('origin')).origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ success: false, message: '请求来源无效' }); }
            catch { return res.status(403).json({ success: false, message: '请求来源无效' }); }
        }
        next();
    });
    router.post('/login', async (req, res) => {
        if (!password) return res.status(503).json({ success: false, message: '管理员登录尚未配置' });
        const supplied = req.body?.password, code = req.body?.code;
        const validPassword = typeof supplied === 'string' && supplied.length <= 1024 && timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash(password)));
        let valid = false;
        if (validPassword && typeof code === 'string' && /^\d{6}$/.test(code)) {
            try { valid = await verifyOtp(code); }
            catch { return res.status(503).json({ success: false, message: '密钥验证服务暂不可用，请检查配置或稍后重试' }); }
        }
        if (!valid) { failure(req.ip); return res.status(401).json({ success: false, message: '管理员密码或实时密钥错误' }); }
        if (blocked(req.ip)) return res.status(429).json({ success: false, message: '管理功能暂时锁定，请稍后再试' });
        const previous = token(req); if (previous) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(previous));
        const raw = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(raw), clock(), clock() + 3 * DAY);
        res.cookie(COOKIE, raw, { ...cookie(req), maxAge: 3 * DAY }).json({ success: true });
    });
    router.get('/session', (req, res) => {
        const row = session(req);
        if (!row || clock() - row.created_at >= 2 * DAY) {
            if (row) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
            clear(req, res); return res.json({ success: true, authenticated: false });
        }
        res.json({ success: true, authenticated: true });
    });
    router.post('/logout', (req, res) => { const raw = token(req); if (raw) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(raw)); clear(req, res); res.json({ success: true }); });
    router.use((req, res, next) => { if (session(req)) return next(); clear(req, res); res.status(401).json({ success: false, message: '请重新登录管理后台' }); });
    return router;
}
