import express from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { sessionUser } from '../auth/routes.js';
import { FEEDBACK_CATEGORIES, MAX_IMAGE_SIZE, MAX_IMAGE_TOTAL, feedbackRoot, feedbackQuota, imageFormat, feedbackImagePath, feedbackView } from './store.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const field = (value, max, label, required = false) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if ((required && !text) || [...text].length > max) throw new Error(`${label}${required ? '需为 1–' : '最多 '}${max} 字`);
    return text;
};
export function createFeedbackRoutes({ db, clock = Date.now, root = feedbackRoot }) {
    const router = express.Router();
    const upload = multer({ storage: multer.memoryStorage(), limits: { files: 4, fileSize: MAX_IMAGE_SIZE, fields: 5, fieldSize: 40000 },
        fileFilter: (_req, file, cb) => ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new Error('图片格式不支持')) }).array('images', 4);
    router.post('/', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const origin = req.get('origin');
        try { if (req.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).origin !== `${req.protocol}://${req.get('host')}`)) throw new Error(); }
        catch { return fail(res, 403, '请求来源无效'); }
        const user = sessionUser(db, req, clock());
        if (!user) return fail(res, 401, '登录/注册后即可向我反馈');
        const quota = feedbackQuota(db, user.id, clock());
        if (quota) return fail(res, 429, '半小时内最多提交 3 次反馈，请稍后再试', { retryAt: quota });
        if (!req.is('multipart/form-data')) return fail(res, 415, '请通过反馈表单提交');
        upload(req, res, error => {
            if (error) return fail(res, 400, error.code === 'LIMIT_FILE_SIZE' ? '每张图片最多 5 MB' : '上传失败：最多 4 张图片，支持 PNG、JPEG、GIF、WebP');
            const written = [];
            try {
                const currentUser = sessionUser(db, req, clock());
                if (!currentUser) return fail(res, 401, '登录已失效，请重新登录后提交');
                const category = req.body.category;
                if (!Object.hasOwn(FEEDBACK_CATEGORIES, category)) throw new Error('请选择一种反馈类型');
                const musical = category === 'music';
                const body = musical ? '' : field(req.body.body, 10000, '反馈内容', true);
                const song = musical ? field(req.body.song, 200, '歌名', true) : '';
                const artist = musical ? field(req.body.artist, 200, '歌手名', true) : '';
                const notes = musical ? field(req.body.notes, 5000, '其他备注') : '';
                if (musical && req.files.length) throw new Error('音乐推荐无需上传图片');
                if (req.files.reduce((sum, file) => sum + file.size, 0) > MAX_IMAGE_TOTAL) throw new Error('图片合计最多 10 MB');
                const images = req.files.map(file => {
                    const format = imageFormat(file.buffer);
                    if (!format || format.mime !== file.mimetype) throw new Error('请上传有效的 PNG、JPEG、GIF 或 WebP 图片');
                    return { file, format, filename: randomBytes(16).toString('hex') + format.extension };
                });
                const now = clock();
                const result = db.transaction(() => {
                    const retryAt = feedbackQuota(db, currentUser.id, now);
                    if (retryAt) return { retryAt };
                    if (images.length) mkdirSync(root, { recursive: true });
                    for (const image of images) {
                        const path = feedbackImagePath(root, image.filename);
                        writeFileSync(path, image.file.buffer, { flag: 'wx' }); written.push(path);
                    }
                    const id = Number(db.prepare('INSERT INTO visitor_feedback(user_id,username,email,category,body,song,artist,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
                        .run(currentUser.id, currentUser.username, currentUser.email, category, body, song, artist, notes, now).lastInsertRowid);
                    for (const image of images) db.prepare('INSERT INTO feedback_images(feedback_id,filename,name,mime_type,size) VALUES (?,?,?,?,?)')
                        .run(id, image.filename, Buffer.from(image.file.originalname, 'latin1').toString('utf8').replace(/[\r\n]/g, ' ').slice(0, 200), image.format.mime, image.file.size);
                    return { id };
                })();
                if (result.retryAt) return fail(res, 429, '半小时内最多提交 3 次反馈，请稍后再试', { retryAt: result.retryAt });
                res.status(201).json({ success: true, message: '反馈已提交，感谢您的反馈！', id: result.id });
            } catch (cause) {
                for (const path of written) try { unlinkSync(path); } catch { /* Preserve the original validation error. */ }
                fail(res, 400, cause.message || '反馈提交失败，请稍后再试');
            }
        });
    });
    return router;
}

// Mounted behind the existing admin session and origin checks.
export function createFeedbackAdminRoutes({ db, clock = Date.now, root = feedbackRoot }) {
    const router = express.Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.get('/', (req, res) => {
        const read = req.query.status === 'read' ? 1 : 0;
        const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
        const total = db.prepare('SELECT count(*) AS total FROM visitor_feedback WHERE is_read=?').get(read).total;
        const rows = db.prepare('SELECT * FROM visitor_feedback WHERE is_read=? ORDER BY created_at DESC,id DESC LIMIT 15 OFFSET ?').all(read, (page - 1) * 15);
        res.json({ success: true, data: rows.map(row => feedbackView(db, row)), total, page, totalPages: Math.max(1, Math.ceil(total / 15)) });
    });
    router.post('/:id/approve', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1 || !db.prepare('SELECT id FROM visitor_feedback WHERE id=?').get(id)) return fail(res, 404, '反馈不存在');
        db.prepare('UPDATE visitor_feedback SET is_read=1,read_at=COALESCE(read_at,?) WHERE id=?').run(clock(), id);
        res.json({ success: true, message: '已审批，反馈已移至已处理列表' });
    });
    router.get('/images/:id', (req, res) => {
        const image = db.prepare('SELECT * FROM feedback_images WHERE id=?').get(req.params.id);
        if (!image) return fail(res, 404, '图片不存在');
        res.set({ 'Content-Type': image.mime_type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
        res.sendFile(feedbackImagePath(root, image.filename), error => { if (error && !res.headersSent) fail(res, 404, '图片无法读取'); });
    });
    return router;
}
