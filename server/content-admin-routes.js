import express from 'express';
import session from 'express-session';
import multer from 'multer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { cardDb, commentDb, DATA_DIR } from './db.js';
import { createBackupStore } from './backups/store.js';
import { createBackupRoutes } from './backups/routes.js';
import { auditAndCleanupUploads, publicRoot, rememberUpload } from './upload-cleanup.js';
import { imagesFor, saveResourceExtras, validateStructure } from './resource-structure.js';
import aiRoutes from './ai/routes.js';
import { createModerationRoutes } from './comments/admin-routes.js';
import { createFeedbackAdminRoutes } from './feedback/routes.js';
import { createUserAdminRoutes } from './auth/admin-routes.js';
import { createAnnouncementAdminRoutes } from './announcements.js';
import { validateMomentPin, setMomentPin } from './moment-pins.js';
import { activities, activityRoutes } from './activities/index.js';
import { homePlaylist, validatePlaylist, savePlaylist, homeWelcome, validateWelcome, saveWelcome } from './home-music.js';

const router = express.Router();
const password = process.env.ADMIN_PASSWORD || '';
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
if (!password) console.warn('ADMIN_PASSWORD 未设置，管理后台登录已禁用');
router.use(session({ secret: sessionSecret, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: 'auto', maxAge: 7 * 24 * 60 * 60 * 1000 } }));

const attempts = new Map();
router.post('/login', (req, res) => {
    const ip = req.ip;
    const state = attempts.get(ip) || { count: 0, until: 0 };
    if (state.until > Date.now()) return res.status(429).json({ success: false, message: '尝试过多，请稍后再试' });
    const supplied = String(req.body.password || '');
    const valid = password && supplied.length === password.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(password));
    if (!valid) {
        state.count += 1;
        if (state.count >= 8) { state.until = Date.now() + 15 * 60 * 1000; state.count = 0; }
        attempts.set(ip, state);
        return res.status(401).json({ success: false, message: password ? '密码错误' : '服务器尚未配置管理员密码' });
    }
    attempts.delete(ip);
    req.session.regenerate(error => {
        if (error) return res.status(500).json({ success: false, message: '登录失败' });
        req.session.admin = true;
        res.json({ success: true });
    });
});
router.get('/session', (req, res) => res.json({ success: true, authenticated: req.session.admin === true }));
router.post('/logout', (req, res) => req.session.destroy(() => res.json({ success: true })));
router.use((req, res, next) => req.session.admin ? next() : res.status(401).json({ success: false, message: '请先登录' }));
router.use((req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ success: false, message: '请求来源无效' });
    next();
});

const clean = (value, max = 10000) => String(value ?? '').trim().slice(0, max);
router.use('/moderation', createModerationRoutes({ db: cardDb }));
router.use('/feedback', createFeedbackAdminRoutes({ db: cardDb }));
router.use('/users', createUserAdminRoutes({ db: cardDb }));
router.use('/announcements', createAnnouncementAdminRoutes({ db: cardDb, cleanup: auditAndCleanupUploads }));
router.use('/ai', aiRoutes);
router.use('/activities', activityRoutes.admin);
router.use('/backups', createBackupRoutes(createBackupStore({ cardDb, commentDb, dataRoot: DATA_DIR, publicRoot, activityRuntime: activities, onRestored: () => activities.restored() })));
const normalizeTags = value => [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 40)).filter(Boolean))].slice(0, 20);
const normalizeActions = value => (Array.isArray(value) ? value : []).map(action => ({
    label: String(action.label ?? '').trim(), url: clean(action.url, 2048)
})).filter(action => action.label && /^(https?:\/\/|\/[^/])/i.test(action.url)).slice(0, 6);

router.get('/profile', (_req, res) => res.json({ success: true, data: {
    profile: cardDb.prepare('SELECT avatar, name, description FROM profile WHERE id = 1').get(),
    cards: cardDb.prepare('SELECT id, title, content FROM home_cards ORDER BY display_order, id').all(),
    playlist: homePlaylist(cardDb), welcome: homeWelcome(cardDb)
} }));
router.put('/profile', (req, res) => {
    const profile = req.body.profile || {};
    const cards = req.body.cards;
    if (!clean(profile.name, 120) || !clean(profile.avatar, 2048) || !Array.isArray(cards)) return res.status(400).json({ success: false, message: '头像、名称和卡片列表不能为空' });
    if (cards.length > 100 || cards.some(card => !clean(card.title, 120))) return res.status(400).json({ success: false, message: '卡片标题不能为空，最多 100 张' });
    if (req.body.playlist !== undefined) {
        const error = validatePlaylist(req.body.playlist);
        if (error) return res.status(400).json({ success: false, message: error });
    }
    if (req.body.welcome !== undefined) {
        const error = validateWelcome(req.body.welcome);
        if (error) return res.status(400).json({ success: false, message: error });
    }
    cardDb.transaction(() => {
        cardDb.prepare('UPDATE profile SET avatar = ?, name = ?, description = ? WHERE id = 1').run(clean(profile.avatar, 2048), clean(profile.name, 120), clean(profile.description, 2000));
        cardDb.prepare('DELETE FROM home_cards').run();
        const insert = cardDb.prepare('INSERT INTO home_cards (title, content, display_order) VALUES (?, ?, ?)');
        cards.forEach((card, index) => insert.run(clean(card.title, 120), clean(card.content, 50000), index));
        if (req.body.playlist !== undefined) savePlaylist(cardDb, req.body.playlist);
        if (req.body.welcome !== undefined) saveWelcome(cardDb, req.body.welcome);
    })();
    res.json({ success: true, ...auditAndCleanupUploads() });
});

router.get('/resource-types', (_req, res) => res.json({ success: true, data: cardDb.prepare('SELECT id, name, slug FROM resource_types ORDER BY display_order, id').all() }));
router.get('/settings', (_req, res) => res.json({ success: true, data: JSON.parse(cardDb.prepare('SELECT data FROM site_configs WHERE key = ?').get('page_settings').data) }));
router.put('/settings', (req, res) => {
    const fields = ['momentsDescription', 'resourceDescription', 'activitiesMessage', 'icpNumber'];
    const data = Object.fromEntries(fields.map(field => [field, clean(req.body?.[field], 500)]));
    cardDb.prepare("UPDATE site_configs SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'page_settings'").run(JSON.stringify(data));
    res.json({ success: true, data, ...auditAndCleanupUploads() });
});
router.put('/resource-types', (req, res) => {
    const types = req.body.types;
    if (!Array.isArray(types) || types.length > 50 || types.some(type => !clean(type.name, 50))) return res.status(400).json({ success: false, message: '资源分类格式无效' });
    const names = types.map(type => clean(type.name, 50));
    if (new Set(names).size !== names.length) return res.status(400).json({ success: false, message: '资源分类名称不能重复' });
    cardDb.transaction(() => {
        // 先释放旧名称，允许交换分类名称或复用将删除分类的名称。
        cardDb.prepare('SELECT id FROM resource_types').all().forEach(row => {
            cardDb.prepare('UPDATE resource_types SET name = ? WHERE id = ?').run(`__renaming_${row.id}`, row.id);
        });
        const ids = [];
        types.forEach((type, index) => {
            const id = Number(type.id);
            const slug = clean(type.slug, 80) || `type-${Date.now()}-${index}`;
            if (id && cardDb.prepare('SELECT id FROM resource_types WHERE id = ?').get(id)) {
                cardDb.prepare('UPDATE resource_types SET name = ?, display_order = ? WHERE id = ?').run(names[index], index, id);
                ids.push(id);
            } else {
                const result = cardDb.prepare('INSERT INTO resource_types (name, slug, display_order) VALUES (?, ?, ?)').run(names[index], slug, index);
                ids.push(Number(result.lastInsertRowid));
            }
        });
        const old = cardDb.prepare('SELECT id FROM resource_types').all();
        old.forEach(row => { if (!ids.includes(row.id)) cardDb.prepare('DELETE FROM resource_types WHERE id = ?').run(row.id); });
    })();
    res.json({ success: true, data: cardDb.prepare('SELECT id, name, slug FROM resource_types ORDER BY display_order, id').all(), ...auditAndCleanupUploads() });
});

router.get('/entries', (req, res) => {
    const kind = req.query.kind === 'resource' ? 'resource' : 'moment';
    const rows = cardDb.prepare('SELECT * FROM entries WHERE kind = ? ORDER BY published_at DESC, id DESC').all(kind)
        .map(row => ({ ...row, pinned: Boolean(row.pinned), tags: JSON.parse(row.tags), actions: JSON.parse(row.actions), images: imagesFor(row.id) }));
    res.json({ success: true, data: rows });
});

function validateEntry(input, id = null) {
    const structure = validateStructure(input, id);
    if (structure.error) return structure;
    const kind = input.kind === 'resource' ? 'resource' : 'moment';
    const pin = validateMomentPin(cardDb, { ...input, kind }, id);
    if (pin.error) return pin;
    const format = kind === 'moment' && input.format === 'short' ? 'short' : 'article';
    const title = clean(input.title, 200);
    if (!title && format !== 'short') return { error: '标题不能为空' };
    if (format === 'short' && !clean(input.body, 100000)) return { error: '短帖正文不能为空' };
    if (format === 'short' && [...String(input.body ?? '').trim()].length > 500) return { error: '短帖正文不能超过 500 字' };
    const coverImage = clean(input.cover_image, 2048);
    if (coverImage && !/^(https?:\/\/|\/[^/])/i.test(coverImage)) return { error: '封面图片地址无效' };
    const resourceTypeId = kind !== 'resource' ? null : structure.parentId !== null
        ? cardDb.prepare('SELECT resource_type_id FROM entries WHERE id=?').get(structure.parentId).resource_type_id
        : Number(input.resource_type_id) || null;
    if (kind === 'resource' && resourceTypeId && !cardDb.prepare('SELECT id FROM resource_types WHERE id = ?').get(resourceTypeId)) return { error: '请选择有效的资源类型' };
    const date = input.published_at ? new Date(input.published_at) : new Date();
    if (Number.isNaN(date.getTime())) return { error: '发布时间格式错误' };
    const images = [];
    if (structure.resourceKind === 'gallery') {
        if (!Array.isArray(input.images) || input.images.length > 500) return { error: '图集图片列表无效，最多 500 张' };
        for (const [index, image] of input.images.entries()) {
            const url = clean(image?.url, 2048);
            if (!/^(https?:\/\/|\/[^/])/i.test(url)) return { error: `第 ${index + 1} 张图片地址无效` };
            images.push({ url, caption: clean(image?.caption, 500),
                width: Math.min(50000, Math.max(0, Number.parseInt(image?.width, 10) || 0)),
                height: Math.min(50000, Math.max(0, Number.parseInt(image?.height, 10) || 0)) });
        }
    }
    return { kind, format, title, summary: clean(input.summary, 1000), coverImage, body: clean(input.body, 100000),
        tags: JSON.stringify(normalizeTags(input.tags)), resourceTypeId, actions: JSON.stringify(kind === 'resource' ? normalizeActions(input.actions) : []),
        status: input.status === 'draft' ? 'draft' : 'published', pinned: pin.pinned, publishedAt: date.toISOString(), ...structure, images };
}
router.post('/entries', (req, res) => {
    const data = validateEntry(req.body);
    if (data.error) return res.status(data.status || 400).json({ success: false, message: data.error });
    const now = new Date().toISOString();
    const id = cardDb.transaction(() => {
        const result = cardDb.prepare(`INSERT INTO entries (kind,format,title,summary,cover_image,body,tags,resource_type_id,actions,status,published_at,created_at,updated_at,resource_kind,parent_id,pinned)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(data.kind, data.format, data.title, data.summary, data.coverImage, data.body, data.tags, data.resourceTypeId, data.actions, data.status, data.publishedAt, now, now, data.resourceKind, data.parentId, data.pinned);
        const id = Number(result.lastInsertRowid);
        saveResourceExtras(id, data);
        return id;
    })();
    res.status(201).json({ success: true, id, ...auditAndCleanupUploads() });
});
router.put('/entries/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!cardDb.prepare('SELECT id FROM entries WHERE id = ?').get(id)) return res.status(404).json({ success: false, message: '内容不存在' });
    const data = validateEntry(req.body, id);
    if (data.error) return res.status(data.status || 400).json({ success: false, message: data.error });
    const result = cardDb.transaction(() => {
        const result = cardDb.prepare(`UPDATE entries SET kind=?,format=?,title=?,summary=?,cover_image=?,body=?,tags=?,resource_type_id=?,actions=?,status=?,published_at=?,updated_at=?,resource_kind=?,parent_id=?,pinned=? WHERE id=?`)
            .run(data.kind, data.format, data.title, data.summary, data.coverImage, data.body, data.tags, data.resourceTypeId, data.actions, data.status, data.publishedAt, new Date().toISOString(), data.resourceKind, data.parentId, data.pinned, id);
        saveResourceExtras(id, data);
        return result;
    })();
    res.status(result.changes ? 200 : 404).json({ success: !!result.changes, message: result.changes ? '已保存' : '内容不存在', ...(result.changes ? auditAndCleanupUploads() : {}) });
});
router.post('/entries/:id/pin', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.enabled !== 'boolean') return res.status(400).json({ success: false, message: '置顶设置无效' });
    try {
        const pinned = setMomentPin(cardDb, id, req.body.enabled);
        res.json({ success: true, pinned });
    } catch (error) {
        if (!error.status) throw error;
        res.status(error.status).json({ success: false, message: error.message });
    }
});
router.delete('/entries/:id', (req, res) => {
    const result = cardDb.prepare('DELETE FROM entries WHERE id = ?').run(req.params.id);
    res.status(result.changes ? 200 : 404).json({ success: !!result.changes, ...(result.changes ? auditAndCleanupUploads() : {}) });
});

const upload = multer({ storage: multer.diskStorage({
    destination: (req, file, cb) => {
        const subdir = file.mimetype.startsWith('image/') ? 'picture' : 'source';
        const folder = join(publicRoot, subdir);
        mkdirSync(folder, { recursive: true });
        cb(null, folder);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${extname(file.originalname).toLowerCase().slice(0, 12)}`)
}), limits: { fileSize: 200 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
    const extension = extname(file.originalname).toLowerCase();
    if (['.html', '.htm', '.svg', '.js', '.mjs', '.css', '.xml'].includes(extension)) return cb(new Error('不支持上传可执行网页文件'));
    if (file.mimetype.startsWith('image/') && !['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(extension)) return cb(new Error('图片格式不支持'));
    cb(null, true);
} });
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: '请选择文件' });
    const dir = req.file.mimetype.startsWith('image/') ? 'picture' : 'source';
    const url = `/${dir}/${req.file.filename}`;
    rememberUpload(url);
    res.json({ success: true, url, name: req.file.originalname });
});

export default router;
