import express from 'express';

// Mounted after the administrator session and origin checks.
export function createUserAdminRoutes({ db }) {
    const router = express.Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const view = row => ({ id: row.id, username: row.username, email: row.email, created_at: row.created_at, is_owner: Boolean(row.is_owner) });
    router.get('/', (req, res) => {
        const query = String(req.query.q || '').trim().normalize('NFKC').toLowerCase().slice(0, 200);
        const filter = "WHERE (?='' OR instr(username_key,?)>0 OR instr(email,?)>0)";
        const args = [query, query, query];
        const total = db.prepare(`SELECT count(*) AS n FROM users ${filter}`).get(...args).n;
        const totalPages = Math.max(1, Math.ceil(total / 15));
        const page = Math.min(totalPages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
        const rows = db.prepare(`SELECT id,username,email,created_at,is_owner FROM users ${filter} ORDER BY created_at DESC,id DESC LIMIT 15 OFFSET ?`).all(...args, (page - 1) * 15);
        const owner = db.prepare('SELECT id,username,email,created_at,is_owner FROM users WHERE is_owner=1').get();
        res.json({ success: true, data: rows.map(view), owner: owner ? view(owner) : null, total, page, totalPages });
    });
    router.post('/:id/owner', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: '账户 ID 无效' });
        if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ success: false, message: '站主设置无效' });
        if (!db.prepare('SELECT id FROM users WHERE id=?').get(id)) return res.status(404).json({ success: false, message: '账户不存在' });
        db.transaction(() => {
            if (req.body.enabled) db.prepare('UPDATE users SET is_owner=0 WHERE is_owner=1 AND id<>?').run(id);
            db.prepare('UPDATE users SET is_owner=? WHERE id=?').run(req.body.enabled ? 1 : 0, id);
        })();
        res.json({ success: true, message: req.body.enabled ? '已设为站主' : '已取消站主身份' });
    });
    return router;
}
