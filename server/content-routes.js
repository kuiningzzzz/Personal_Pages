import express from 'express';
import { cardDb } from './db.js';
import { imagesFor, publicAncestors } from './resource-structure.js';

const router = express.Router();
const parse = (value, fallback = []) => { try { return JSON.parse(value); } catch { return fallback; } };
const entrySelect = `SELECT e.*, rt.name AS resource_type_name,
    (SELECT COUNT(*) FROM entries child WHERE child.parent_id = e.id AND child.status = 'published') AS child_count,
    (SELECT COUNT(*) FROM gallery_images g WHERE g.entry_id = e.id) AS image_count,
    (SELECT url FROM gallery_images g WHERE g.entry_id = e.id ORDER BY display_order, id LIMIT 1) AS gallery_cover
    FROM entries e LEFT JOIN resource_types rt ON rt.id = e.resource_type_id`;
const entry = ({ gallery_cover, ...row }) => ({ ...row, cover_image: row.cover_image || (row.resource_kind === 'gallery' ? gallery_cover || '' : ''), tags: parse(row.tags), actions: parse(row.actions) });

router.get('/profile', (_req, res) => {
    const profile = cardDb.prepare('SELECT avatar, name, description FROM profile WHERE id = 1').get();
    const cards = cardDb.prepare('SELECT id, title, content FROM home_cards ORDER BY display_order, id').all();
    res.json({ success: true, data: { profile, cards } });
});

router.get('/resource-types', (_req, res) => {
    res.json({ success: true, data: cardDb.prepare('SELECT id, name, slug FROM resource_types ORDER BY display_order, id').all() });
});

router.get('/settings', (_req, res) => {
    const row = cardDb.prepare('SELECT data FROM site_configs WHERE key = ?').get('page_settings');
    res.json({ success: true, data: parse(row?.data, {}) });
});

router.get('/entries', (req, res) => {
    const kind = req.query.kind === 'resource' ? 'resource' : 'moment';
    const query = String(req.query.q || '').trim().slice(0, 200).toLocaleLowerCase();
    const terms = query.split(/\s+/u).filter(Boolean);
    const type = Number(req.query.type) || null;
    const format = kind === 'moment' && ['short', 'article'].includes(req.query.format) ? req.query.format : null;
    const sort = req.query.sort === 'latest' ? 'latest' : 'relevance';
    let page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, Number.parseInt(req.query.limit, 10) || 15));
    const parentId = kind === 'resource' && req.query.parent ? Number(req.query.parent) : null;
    if (parentId !== null) {
        if (!Number.isSafeInteger(parentId) || parentId <= 0) return res.status(400).json({ success: false, message: '合集地址无效' });
        const parent = cardDb.prepare("SELECT * FROM entries WHERE id = ? AND kind = 'resource' AND resource_kind = 'collection' AND status = 'published'").get(parentId);
        if (!parent || publicAncestors(parent) === null) return res.status(404).json({ success: false, message: '合集不存在' });
    }
    const rootType = kind === 'resource' && parentId === null ? type : null;
    let rows = cardDb.prepare(`${entrySelect}
        WHERE e.kind = ? AND e.status = 'published' AND (? IS NULL OR e.resource_type_id = ?)
        AND (e.kind != 'resource' OR e.parent_id IS ?) AND (? IS NULL OR e.format = ?)`)
        .all(kind, rootType, rootType, parentId, format, format)
        .map(entry);
    if (terms.length) {
        rows = rows.map(row => {
            const title = row.title.toLocaleLowerCase();
            const tags = row.tags.join(' ').toLocaleLowerCase();
            const captions = row.resource_kind === 'gallery' ? imagesFor(row.id).map(image => image.caption).join(' ') : '';
            const body = `${row.summary} ${row.body} ${captions}`.toLocaleLowerCase();
            const matches = terms.map(term => ({ title: title.includes(term), tags: tags.includes(term), body: body.includes(term) }));
            return { ...row, score: matches.every(match => match.title || match.tags || match.body)
                ? matches.reduce((sum, match) => sum + (match.title ? 5 : 0) + (match.tags ? 3 : 0) + (match.body ? 1 : 0), 0) : 0 };
        }).filter(row => row.score > 0);
    }
    rows.sort((a, b) => {
        if (terms.length && sort === 'relevance' && a.score !== b.score) return b.score - a.score;
        return b.published_at.localeCompare(a.published_at) || b.id - a.id;
    });
    const total = rows.length;
    // Mail links to short posts open the page containing that post, without
    // inserting an extra item or displacing another item from the first page.
    const locatedIndex = kind === 'moment' && !terms.length && req.query.locate
        ? rows.findIndex(row => row.id === Number(req.query.locate) && row.format === 'short') : -1;
    if (locatedIndex >= 0) page = Math.floor(locatedIndex / limit) + 1;
    page = Math.min(page, Math.max(1, Math.ceil(total / limit)));
    // 列表仅返回摘要；正文仍用于搜索，详情接口返回完整内容。
    const data = rows.slice((page - 1) * limit, page * limit).map(({ body, actions, ...rest }) => ({ ...rest, body: rest.format === 'short' ? body : '', actions: kind === 'resource' ? actions : [] }));
    res.json({ success: true, data, total, page, limit });
});

router.get('/entries/:id', (req, res) => {
    const row = cardDb.prepare(`${entrySelect} WHERE e.id = ? AND e.status = 'published'`).get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: '内容不存在' });
    const ancestors = publicAncestors(row);
    if (ancestors === null) return res.status(404).json({ success: false, message: '内容不存在' });
    res.json({ success: true, data: { ...entry(row), ancestors, images: row.resource_kind === 'gallery' ? imagesFor(row.id) : [] } });
});

export default router;
