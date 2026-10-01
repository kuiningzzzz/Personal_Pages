import express from 'express';
import { sessionUser } from '../auth/routes.js';
import { commentableEntry, commentList, commentReplies, findComment, publicComment, removeComment, REPORT_REASONS, commentPath } from './store.js';

export function createCommentRoutes({ db, clock = Date.now }) {
    const router = express.Router();
    const fail = (res, status, message) => res.status(status).json({ success: false, message });
    const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
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
        req.visitor = sessionUser(db, req, clock());
        if (!['GET', 'HEAD'].includes(req.method) && !req.visitor) return fail(res, 401, '登录/注册后即可参与评论');
        next();
    });
    const limit = (req, res, scope, max, window) => {
        const key = `${scope}:${req.visitor.id}`;
        const now = clock();
        const row = db.prepare('SELECT * FROM user_auth_limits WHERE key = ?').get(key);
        if (row?.expires_at > now && row.count >= max) { fail(res, 429, '操作过于频繁，请稍后再试'); return false; }
        db.prepare(`INSERT INTO user_auth_limits VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count=excluded.count, expires_at=excluded.expires_at`)
            .run(key, row?.expires_at > now ? row.count + 1 : 1, row?.expires_at > now ? row.expires_at : now + window);
        return true;
    };
    const target = (req, res) => {
        const row = positive(req.params.id) ? findComment(db, Number(req.params.id), req.visitor?.id) : null;
        if (!row || !commentableEntry(db, row.entry_id)) { fail(res, 404, '评论不存在'); return null; }
        return row;
    };
    router.get('/:entryId', (req, res) => {
        if (!positive(req.params.entryId) || !commentableEntry(db, Number(req.params.entryId))) return fail(res, 404, '这里暂不提供评论');
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        res.json({ success: true, ...commentList(db, Number(req.params.entryId), req.visitor?.id, {
            sort: req.query.sort === 'latest' ? 'latest' : 'likes', page, focus: positive(req.query.focus) ? Number(req.query.focus) : null
        }) });
    });
    router.get('/:entryId/replies/:rootId', (req, res) => {
        const root = positive(req.params.rootId) ? findComment(db, Number(req.params.rootId), req.visitor?.id) : null;
        if (!root || root.root_id !== null || root.entry_id !== Number(req.params.entryId) || !commentableEntry(db, root.entry_id)) return fail(res, 404, '评论不存在');
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        res.json({ success: true, data: commentReplies(db, root.id, req.visitor?.id, 30, (page - 1) * 30), total: root.reply_count, page });
    });
    router.post('/:entryId', (req, res) => {
        const entryId = Number(req.params.entryId);
        const entry = positive(entryId) ? commentableEntry(db, entryId) : null;
        if (!entry) return fail(res, 404, '这里暂不提供评论');
        const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
        if (!body || [...body].length > 2000) return fail(res, 400, '评论需为 1–2000 个字符');
        const replyId = req.body?.replyTo;
        const reply = replyId == null ? null : positive(replyId) ? findComment(db, Number(replyId)) : null;
        if (replyId != null && (!reply || reply.entry_id !== entryId)) return fail(res, 400, '回复对象不存在或不属于当前内容');
        if (!limit(req, res, 'comment-fast', 1, 5000) || !limit(req, res, 'comment-create', 30, 10 * 60000)) return;
        const id = db.transaction(() => {
            const result = db.prepare(`INSERT INTO entry_comments (entry_id,user_id,root_id,reply_to_id,reply_to_name,body,created_at) VALUES (?,?,?,?,?,?,?)`)
                .run(entryId, req.visitor.id, reply ? reply.root_id || reply.id : null, reply?.id || null, reply?.username || '', body, new Date(clock()).toISOString());
            const id = Number(result.lastInsertRowid);
            if (reply && reply.user_id !== req.visitor.id) db.prepare("INSERT INTO discussion_mail_queue (kind,comment_id,user_id) VALUES ('reply',?,?)").run(id, reply.user_id);
            return id;
        })();
        res.status(201).json({ success: true, data: publicComment(findComment(db, id, req.visitor.id), req.visitor.id) });
    });
    router.post('/items/:id/like', (req, res) => {
        const row = target(req, res); if (!row) return;
        if (typeof req.body?.enabled !== 'boolean') return fail(res, 400, '点赞设置无效');
        if (!limit(req, res, 'comment-like', 120, 60000)) return;
        if (req.body.enabled) db.prepare('INSERT OR IGNORE INTO comment_likes (comment_id,user_id) VALUES (?,?)').run(row.id, req.visitor.id);
        else db.prepare('DELETE FROM comment_likes WHERE comment_id=? AND user_id=?').run(row.id, req.visitor.id);
        res.json({ success: true, data: publicComment(findComment(db, row.id, req.visitor.id), req.visitor.id) });
    });
    router.delete('/items/:id', (req, res) => {
        const row = target(req, res); if (!row) return;
        if (row.user_id !== req.visitor.id) return fail(res, 403, '只能撤回自己的评论');
        db.transaction(() => removeComment(db, row.id, 'withdrawn', clock))();
        res.json({ success: true });
    });
    router.post('/items/:id/report', (req, res) => {
        const row = target(req, res); if (!row) return;
        const reasons = Array.isArray(req.body?.reasons) ? [...new Set(req.body.reasons)] : [];
        const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        if (!reasons.length || reasons.some(reason => !REPORT_REASONS.includes(reason)) || [...description].length > 2000
            || (reasons.includes('其他描述') && !description)) return fail(res, 400, '请选择举报原因；选择其他描述时请填写说明');
        if (row.reports_muted) return res.json({ success: true, message: '举报已提交，感谢你的反馈' });
        if (!limit(req, res, 'comment-report', 10, 3600000)) return;
        if (!row.reports_muted && !db.prepare('SELECT id FROM comment_reports WHERE comment_id=? AND reporter_id=?').get(row.id, req.visitor.id)) {
            const entry = commentableEntry(db, row.entry_id);
            db.transaction(() => {
                const result = db.prepare(`INSERT INTO comment_reports (comment_id,reporter_id,entry_id,author_name,author_email,body,entry_title,entry_path,reasons,description,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(row.id, req.visitor.id, entry.id, row.username, row.email, row.body, entry.title,
                    commentPath(entry, row.id), JSON.stringify(reasons), description, new Date(clock()).toISOString());
                db.prepare("INSERT INTO discussion_mail_queue (kind,report_id) VALUES ('report',?)").run(Number(result.lastInsertRowid));
            })();
        }
        res.json({ success: true, message: '举报已提交，感谢你的反馈' });
    });
    return router;
}
