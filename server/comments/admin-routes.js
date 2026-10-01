import express from 'express';
import { normalizeEmail, validEmail } from '../auth/routes.js';
import { removeComment } from './store.js';

export function createModerationRoutes({ db, clock = Date.now }) {
    // Mounted after the existing Admin session and origin checks.
    const router = express.Router();
    const fail = (res, status, message) => res.status(status).json({ success: false, message });
    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(req.method)) {
            if (req.get('sec-fetch-site') === 'cross-site') return fail(res, 403, '请求来源无效');
            const origin = req.get('origin');
            if (origin) {
                try { if (new URL(origin).origin !== `${req.protocol}://${req.get('host')}`) throw new Error(); }
                catch { return fail(res, 403, '请求来源无效'); }
            }
            if (!req.is('application/json')) return fail(res, 415, '请使用 JSON 请求');
        }
        next();
    });
    router.get('/reports', (req, res) => {
        const status = req.query.status === 'resolved' ? 'resolved' : 'pending';
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const rows = db.prepare(`SELECT r.*, u.username AS reporter_name, u.email AS reporter_email,
            c.reports_muted, c.root_id AS comment_root_id FROM comment_reports r LEFT JOIN users u ON u.id=r.reporter_id
            LEFT JOIN entry_comments c ON c.id=r.comment_id WHERE r.status=? ORDER BY r.id DESC LIMIT 20 OFFSET ?`).all(status, (page - 1) * 20);
        res.json({ success: true, data: rows.map(row => ({ ...row, reasons: JSON.parse(row.reasons) })),
            total: db.prepare('SELECT COUNT(*) AS n FROM comment_reports WHERE status=?').get(status).n, page });
    });
    router.post('/reports/:id', (req, res) => {
        const actions = ['delete', 'delete-ban', 'keep', 'keep-mute'];
        const action = req.body?.action;
        if (!actions.includes(action)) return fail(res, 400, '请选择有效的处理方式');
        const report = db.prepare('SELECT * FROM comment_reports WHERE id=?').get(Number(req.params.id));
        if (!report) return fail(res, 404, '举报记录不存在');
        if (report.status !== 'pending') return fail(res, 409, '这条举报已处理，请刷新列表');
        const now = new Date(clock()).toISOString();
        db.transaction(() => {
            if (action === 'delete-ban') {
                db.prepare(`INSERT INTO user_blacklist (email,reason,created_at) VALUES (?,?,?)
                    ON CONFLICT(email) DO UPDATE SET reason=excluded.reason`).run(report.author_email, `评论举报处理：${report.reasons}`, now);
                db.prepare('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email=?)').run(report.author_email);
            }
            if (action === 'delete' || action === 'delete-ban') {
                if (report.comment_id) removeComment(db, report.comment_id, action, clock);
            } else if (action === 'keep-mute' && report.comment_id) {
                db.prepare('UPDATE entry_comments SET reports_muted=1 WHERE id=?').run(report.comment_id);
            }
            // A decision applies to all pending reports on the same comment.
            db.prepare(`UPDATE comment_reports SET status='resolved', action=?, resolved_at=? WHERE status='pending' AND (id=? OR comment_id=?)`)
                .run(action, now, report.id, report.comment_id);
        })();
        res.json({ success: true, message: '举报已处理' });
    });
    router.get('/blacklist', (_req, res) => res.json({ success: true, data: db.prepare('SELECT * FROM user_blacklist ORDER BY created_at DESC, email').all() }));
    router.post('/blacklist', (req, res) => {
        const email = normalizeEmail(req.body?.email);
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
        if (!validEmail(email)) return fail(res, 400, '请填写有效的邮箱地址');
        db.transaction(() => {
            db.prepare(`INSERT INTO user_blacklist (email,reason,created_at) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET reason=excluded.reason`)
                .run(email, reason, new Date(clock()).toISOString());
            db.prepare('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email=?)').run(email);
        })();
        res.json({ success: true, message: '邮箱已加入黑名单' });
    });
    router.delete('/blacklist', (req, res) => {
        const email = normalizeEmail(req.body?.email);
        if (!validEmail(email)) return fail(res, 400, '请填写有效的邮箱地址');
        db.prepare('DELETE FROM user_blacklist WHERE email=?').run(email);
        res.json({ success: true, message: '已解除封禁，该用户需要重新登录' });
    });
    return router;
}
