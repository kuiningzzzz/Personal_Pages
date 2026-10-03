import express from 'express';

export function migrateAnnouncements(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
        pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
        published_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        CHECK(pinned=0 OR status='published')
    );
    CREATE INDEX IF NOT EXISTS announcements_published ON announcements(status,pinned,published_at DESC,id DESC);
    CREATE TABLE IF NOT EXISTS announcement_tags (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS announcement_tag_links (
        announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES announcement_tags(id) ON DELETE CASCADE,
        PRIMARY KEY(announcement_id,tag_id)
    );
    CREATE TRIGGER IF NOT EXISTS announcements_pin_insert BEFORE INSERT ON announcements
    WHEN NEW.pinned=1 AND (SELECT count(*) FROM announcements WHERE pinned=1)>=2
    BEGIN SELECT RAISE(ABORT,'最多置顶 2 条公告'); END;
    CREATE TRIGGER IF NOT EXISTS announcements_pin_update BEFORE UPDATE OF pinned ON announcements
    WHEN NEW.pinned=1 AND (SELECT count(*) FROM announcements WHERE pinned=1 AND id<>NEW.id)>=2
    BEGIN SELECT RAISE(ABORT,'最多置顶 2 条公告'); END;`);
}

const tagsFor = (db, id) => db.prepare(`SELECT t.id,t.name FROM announcement_tags t
    JOIN announcement_tag_links l ON l.tag_id=t.id WHERE l.announcement_id=? ORDER BY t.id`).all(id);
const view = (db, row) => ({ ...row, pinned: Boolean(row.pinned), tags: tagsFor(db, row.id) });
const order = 'ORDER BY julianday(published_at) DESC,id DESC';
export function listAnnouncements(db, { admin = false, expanded = false, page = 1 } = {}) {
    const where = admin ? '' : "WHERE status='published' AND pinned=0";
    const total = db.prepare(`SELECT count(*) AS n FROM announcements ${where}`).get().n;
    const totalPages = Math.max(1, Math.ceil(total / 15));
    page = expanded || admin ? Math.min(totalPages, Math.max(1, Number.parseInt(page, 10) || 1)) : 1;
    const limit = expanded || admin ? 15 : 3;
    const rows = db.prepare(`SELECT * FROM announcements ${where} ${order} LIMIT ? OFFSET ?`).all(limit, (page - 1) * 15);
    const pinned = admin ? [] : db.prepare(`SELECT * FROM announcements WHERE status='published' AND pinned=1 ${order}`).all();
    return { data: rows.map(row => view(db, row)), pinned: pinned.map(row => view(db, row)), total, totalPages, page };
}

function reject(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function saveAnnouncement(db, input, id = null) {
    return db.transaction(() => {
        const old = id === null ? null : db.prepare('SELECT * FROM announcements WHERE id=?').get(id);
        if (id !== null && !old) reject('公告不存在', 404);
        const title = String(input.title ?? '').trim(), body = String(input.body ?? '').trim();
        if (!title || title.length > 200) reject('公告标题不能为空，且不能超过 200 字');
        if (body.length > 100000) reject('公告内容不能超过 100000 字');
        if (!['draft', 'published'].includes(input.status)) reject('请选择草稿或发布状态');
        if (typeof input.pinned !== 'boolean') reject('置顶设置无效');
        const pinned = input.status === 'published' && input.pinned ? 1 : 0;
        if (pinned && db.prepare('SELECT count(*) AS n FROM announcements WHERE pinned=1 AND id<>?').get(id || 0).n >= 2) reject('最多置顶 2 条公告，请先取消一条置顶', 409);
        if (!Array.isArray(input.tag_ids)) reject('公告标签格式无效');
        const tags = [...new Set(input.tag_ids)];
        if (tags.some(tag => !Number.isSafeInteger(tag) || !db.prepare('SELECT id FROM announcement_tags WHERE id=?').get(tag))) reject('公告标签不存在，请刷新标签列表');
        const now = new Date().toISOString();
        const date = input.published_at || (old?.status === 'published' ? old.published_at : now);
        if (!Number.isFinite(Date.parse(date))) reject('发布时间无效');
        const publishedAt = new Date(date).toISOString();
        if (old) db.prepare('UPDATE announcements SET title=?,body=?,status=?,pinned=?,published_at=?,updated_at=? WHERE id=?').run(title, body, input.status, pinned, publishedAt, now, id);
        else id = Number(db.prepare('INSERT INTO announcements(title,body,status,pinned,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(title, body, input.status, pinned, publishedAt, now, now).lastInsertRowid);
        db.prepare('DELETE FROM announcement_tag_links WHERE announcement_id=?').run(id);
        for (const tag of tags) db.prepare('INSERT INTO announcement_tag_links VALUES(?,?)').run(id, tag);
        return view(db, db.prepare('SELECT * FROM announcements WHERE id=?').get(id));
    })();
}

export function createAnnouncementPublicRoutes({ db }) {
    const router = express.Router();
    router.get('/', (req, res) => res.json({ success: true, ...listAnnouncements(db, { expanded: req.query.expanded === '1', page: req.query.page }) }));
    return router;
}

// Mounted behind the administrator session and origin checks.
export function createAnnouncementAdminRoutes({ db, cleanup = () => ({}) }) {
    const router = express.Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.param('id', (req, res, next, value) => {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) return res.status(400).json({ success: false, message: '公告或标签 ID 无效' });
        next();
    });
    router.get('/', (req, res) => res.json({ success: true, ...listAnnouncements(db, { admin: true, page: req.query.page }) }));
    router.get('/tags', (_req, res) => res.json({ success: true, data: db.prepare('SELECT * FROM announcement_tags ORDER BY id').all() }));
    const saveTag = (req, res, next) => {
        try {
            const name = String(req.body?.name ?? '').trim();
            if (!name || name.length > 30) reject('标签名称不能为空，且不能超过 30 字');
            const id = req.params.id ? Number(req.params.id) : null;
            if (id !== null && !db.prepare('SELECT id FROM announcement_tags WHERE id=?').get(id)) reject('标签不存在', 404);
            if (db.prepare('SELECT id FROM announcement_tags WHERE name=? AND id<>?').get(name, id || 0)) reject('标签名称不能重复');
            if (id === null) db.prepare('INSERT INTO announcement_tags(name) VALUES(?)').run(name);
            else db.prepare('UPDATE announcement_tags SET name=? WHERE id=?').run(name, id);
            res.json({ success: true });
        } catch (error) { next(error); }
    };
    router.post('/tags', saveTag);
    router.put('/tags/:id', saveTag);
    router.delete('/tags/:id', (req, res) => {
        db.prepare('DELETE FROM announcement_tags WHERE id=?').run(Number(req.params.id));
        res.json({ success: true });
    });
    const save = (req, res, next) => {
        try { res.json({ success: true, data: saveAnnouncement(db, req.body || {}, req.params.id ? Number(req.params.id) : null), ...cleanup() }); }
        catch (error) { next(error); }
    };
    router.post('/', save);
    router.put('/:id', save);
    router.delete('/:id', (req, res) => {
        const result = db.prepare('DELETE FROM announcements WHERE id=?').run(Number(req.params.id));
        if (!result.changes) return res.status(404).json({ success: false, message: '公告不存在' });
        res.json({ success: true, ...cleanup() });
    });
    router.use((error, _req, res, next) => {
        if (!error.status) return next(error);
        res.status(error.status).json({ success: false, message: error.message });
    });
    return router;
}
