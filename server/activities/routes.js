import express from 'express';
import multer from 'multer';
import { randomUUID, createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, rm, stat, rename } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import http from 'node:http';
import { sessionUser } from '../auth/routes.js';
import { activityOpen } from './schema.js';

const route = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
const guestPattern = /^[a-f0-9-]{36}$/;
export function createActivityRoutes({ service, secret, sdkPath, clock = Date.now, cleanup = () => ({}) }) {
    const { db } = service;
    const admin = express.Router(), publicRoutes = express.Router();
    const locks = new Map();
    async function withStorageLock(folder, work) { const before = locks.get(folder) || Promise.resolve(), job = before.catch(() => {}).then(work); locks.set(folder, job); try { return await job; } finally { if (locks.get(folder) === job) locks.delete(folder); } }
    const adminItem = (row, selectedVersion) => ({ ...row, tags: JSON.parse(row.tags), versions: db.prepare('SELECT * FROM plaza_versions WHERE item_id=? ORDER BY created_at DESC,id').all(row.id).map(v => ({ ...v, manifest: undefined, logs: v.id === selectedVersion ? JSON.parse(v.logs) : [], has_logs: v.logs !== '[]' })) });
    const publicItem = row => ({ id: row.id, kind: row.kind, parent_id: row.parent_id, title: row.title, summary: row.summary,cover: row.cover,
        tags: JSON.parse(row.tags),entry_label: row.entry_label, pause_music: !!row.pause_music,login_required: !!row.login_required,
        schedule: row.schedule, starts_at: row.starts_at,ends_at: row.ends_at,open: activityOpen(row, clock()),display_order: row.display_order });
    function ancestors(i, preview = false) {
        const result = [], seen = new Set([i.id]); let parent = i.parent_id;
        while (parent) { const p = service.item(parent); if (!p || p.kind !== 'collection' || seen.has(parent) || !preview && p.state !== 'published') throw new Error('活动不可用'); seen.add(parent); result.unshift({ id: p.id,title: p.title }); parent = p.parent_id; }
        return result;
    }
    const sourceAllowed = (req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) {
            let valid = true; const origin = req.get('origin');
            try { if (origin) valid = new URL(origin).host === req.get('host'); } catch { valid = false; }
            if (!valid) return res.status(403).json({ success: false,message: '请求来源无效' });
        } next();
    };
    const sign = data => { const body = Buffer.from(JSON.stringify(data)).toString('base64url'); return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`; };
    function verify(raw) {
        const [body, signature] = String(raw || '').split('.');
        if (!body || !signature || body.length > 2000) throw new Error('活动访问凭证无效');
        const expected = createHmac('sha256', secret).update(body).digest('base64url');
        if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error('活动访问凭证无效');
        const data = JSON.parse(Buffer.from(body, 'base64url')); if (data.expires < clock()) throw new Error('活动访问已过期，请重新进入');
        const i = service.item(data.itemId), v = data.versionId ? service.version(data.versionId) : null;
        if (!i || i.kind !== 'activity' || data.versionId && v?.item_id !== i.id) throw new Error('活动不存在');
        if (!data.preview) {
            if (i.state !== 'published') throw new Error('活动尚未发布'); ancestors(i);
            if (i.source === 'package' && i.published_version_id !== v?.id) throw new Error('活动版本已更新，请重新进入');
            if (!activityOpen(i, clock())) throw new Error('不在开放时段，无法进入');
        } else if (i.state === 'pending' || i.source === 'package' && i.preview_version_id !== v?.id) throw new Error('预览已结束，请重新进入');
        return { data, item: i, version: v };
    }
    function authorize(req) {
        const result = verify(req.get('x-activity-ticket') || req.query.ticket);
        const user = sessionUser(db, req, clock());
        if (result.data.userId && user?.id !== result.data.userId || !result.data.preview && result.item.login_required && !user) { const e = new Error('请登录后再进入活动'); e.status = 401; throw e; }
        return { ...result, user };
    }
    const runtime = (req, i, v, ticket) => ({ id: i.identifier || String(i.id), itemId: i.id,versionId: v?.id || null,backendPort: v?.backend_port || null,
        backendBaseUrl: v?.backend_enabled ? `${req.protocol}://${req.get('host')}/api/plaza/${i.id}/backend/${v.backend_port}` : null,
        sdkVersion: 1, ticket });
    function launch(req, id, preview) {
        const i = service.item(id); if (!i || i.kind !== 'activity') { const e = new Error('活动不存在'); e.status = 404; throw e; }
        ancestors(i, preview);
        if (preview && i.state === 'pending') throw new Error('请先进入预览状态');
        if (!preview && i.state !== 'published') throw new Error('活动尚未发布');
        if (!preview && !activityOpen(i, clock())) throw new Error('不在开放时段，无法进入');
        const user = sessionUser(db, req, clock());
        if (!preview && i.login_required && !user) { const e = new Error('登录/注册后即可进入此活动'); e.status = 401; throw e; }
        const selected = preview ? req.body.versionId || i.preview_version_id : i.published_version_id;
        const v = selected ? service.version(selected) : null;
        if (i.source === 'package' && (v?.item_id !== i.id || preview && i.preview_version_id !== v.id || !preview && i.published_version_id !== v.id)) throw new Error('请先将该版本设为预览或发布状态');
        if (v?.backend_enabled && v.runtime_status !== 'running') { const e = new Error(preview && v.error || '活动后端正在准备或暂时不可用，请稍后重试'); e.status = 503; throw e; }
        const guest = guestPattern.test(req.body.guestId) ? req.body.guestId : randomUUID();
        const ticket = sign({ itemId: i.id,versionId: v?.id || null,preview,userId: user?.id || null,guest,expires: clock() + 12 * 60 * 60 * 1000 });
        return { ...publicItem(i),ancestors: ancestors(i, preview),source: i.source,
            url: i.source === 'external' ? i.external_url : `/api/plaza/run/${ticket}/${v.id}/frontend/index.html`, runtime: runtime(req, i, v, ticket) };
    }
    admin.use(sourceAllowed);
    admin.get('/', (req, res) => res.json({ success: true,data: db.prepare('SELECT * FROM plaza_items ORDER BY display_order,id').all().map(row => adminItem(row, req.query.version)),tags: db.prepare('SELECT * FROM plaza_tags ORDER BY id').all(),jobs: service.jobs() }));
    admin.post('/tags', route(async (req, res) => { const name = String(req.body.name || '').trim(); if (!name || name.length > 40) throw new Error('标签需为 1～40 字'); const result = db.prepare('INSERT INTO plaza_tags(name) VALUES(?)').run(name); res.json({ success: true,id: Number(result.lastInsertRowid) }); }));
    admin.put('/tags/:id', route(async (req, res) => { const name = String(req.body.name || '').trim(); if (!name || name.length > 40) throw new Error('标签需为 1～40 字'); db.prepare('UPDATE plaza_tags SET name=? WHERE id=?').run(name, req.params.id); res.json({ success: true }); }));
    admin.delete('/tags/:id', route(async (req, res) => {
        const id = Number(req.params.id); db.transaction(() => { db.prepare('DELETE FROM plaza_tags WHERE id=?').run(id); for (const i of db.prepare('SELECT id,tags FROM plaza_items').all()) db.prepare('UPDATE plaza_items SET tags=? WHERE id=?').run(JSON.stringify(JSON.parse(i.tags).filter(t => t !== id)), i.id); })(); res.json({ success: true });
    }));
    admin.post('/items', route(async (req, res) => { res.json({ success: true,id: service.create(req.body.kind === 'collection' ? 'collection' : 'activity', 'external', req.body) }); }));
    admin.put('/items/:id', route(async (req, res) => { service.save(Number(req.params.id), req.body); service.reconcile(); res.json({ success: true, ...cleanup() }); }));
    admin.post('/items/:id/state', route(async (req, res) => res.status(202).json({ success: true,data: service.activate(Number(req.params.id), req.body.state, req.body.versionId) })));
    admin.post('/items/:id/launch', route(async (req, res) => res.json({ success: true,data: launch(req, Number(req.params.id), true) })));
    admin.post('/items/:id/versions/:version/port', route(async (req, res) => { const id = Number(req.params.id), port = Number(req.body.port); await service.validatePort(id, req.params.version, port); res.status(202).json({ success: true,data: service.changePort(id, req.params.version, port) }); }));
    admin.delete('/items/:id/versions/:version', route(async (req, res) => res.status(202).json({ success: true,data: service.remove(Number(req.params.id), req.params.version) })));
    admin.delete('/items/:id', route(async (req, res) => res.status(202).json({ success: true,data: service.remove(Number(req.params.id)) })));
    admin.post('/order', route(async (req, res) => {
        const parent = req.body.parent_id == null ? null : Number(req.body.parent_id), ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length > 5000 || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id))) throw new Error('排序数据无效');
        const current = db.prepare("SELECT id FROM plaza_items WHERE parent_id IS ? AND state='published'").all(parent).map(i => i.id);
        if (current.length !== ids.length || current.some(id => !ids.includes(id))) throw new Error('列表发生变化，请刷新后重新排序');
        db.transaction(() => ids.forEach((id, index) => db.prepare('UPDATE plaza_items SET display_order=? WHERE id=?').run(index, id)))(); res.json({ success: true });
    }));
    const uploads = join(service.root, 'imports');
    const upload = multer({ storage: multer.diskStorage({ destination: (_req, _file, cb) => { mkdirSync(uploads, { recursive: true }); cb(null, uploads); },filename: (_req, _file, cb) => cb(null, `${randomUUID()}.zip`) }), limits: { fileSize: 2 * 1024 ** 3,files: 1 } });
    admin.post('/upload', upload.single('file'), route(async (req, res) => { if (!req.file || !/\.zip$/i.test(req.file.originalname)) { if (req.file) await rm(req.file.path, { force: true }); throw new Error('请选择活动 ZIP 发布包'); } try { res.status(201).json({ success: true,data: await service.importPackage(req.file.path) }); } finally { await rm(req.file.path, { force: true }).catch(() => {}); } }));

    publicRoutes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    publicRoutes.get('/sdk.js', (_req, res) => res.type('text/javascript').sendFile(sdkPath));
    publicRoutes.get('/items', route(async (req, res) => {
        const parent = req.query.parent ? Number(req.query.parent) : null;
        if (parent !== null) { const p = service.item(parent); if (p?.kind !== 'collection' || p.state !== 'published') throw new Error('合集不存在'); ancestors(p); }
        const rows = db.prepare("SELECT * FROM plaza_items WHERE state='published' AND parent_id IS ? ORDER BY display_order,id").all(parent);
        res.json({ success: true,data: rows.map(publicItem),tags: db.prepare('SELECT * FROM plaza_tags ORDER BY id').all(),ancestors: parent === null ? [] : ancestors(service.item(parent)),parent: parent === null ? null : publicItem(service.item(parent)) });
    }));
    publicRoutes.post('/:id/launch', sourceAllowed, route(async (req, res) => res.json({ success: true,data: launch(req, Number(req.params.id), false) })));
    publicRoutes.get('/run/:ticket/:version/frontend/*', route(async (req, res) => {
        const { data, item: i,version: v } = verify(req.params.ticket);
        if (!v || v.id !== req.params.version || v.id !== data.versionId) throw new Error('活动版本无效');
        const root = join(service.directory(v, i), 'frontend'), relative = req.params[0] || 'index.html', path = resolve(root, relative);
        if (!path.startsWith(resolve(root) + sep) || relative.includes('\\') || relative.split('/').some(p => p.startsWith('.'))) throw new Error('文件路径无效');
        res.set({ 'Access-Control-Allow-Origin': '*','X-Content-Type-Options': 'nosniff','Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-downloads allow-pointer-lock; frame-ancestors 'self'",'Cache-Control': 'private, no-store' });
        if (extname(path).toLowerCase() === '.html') {
            const config = { ...runtime(req, i, v, undefined), parentOrigin: `${req.protocol}://${req.get('host')}` };
            const injected = `<script>window.ActivityRuntime=${JSON.stringify(config).replaceAll('<', '\\u003c')};</script><script src="/api/plaza/sdk.js"></script>`;
            const html = await readFile(path, 'utf8'); res.type('html').send(/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => match + injected) : injected + html);
        } else res.sendFile(path);
    }));
    publicRoutes.get('/:id/runtime', route(async (req, res) => { const { item: i,version: v } = authorize(req); if (i.id !== Number(req.params.id)) throw new Error('活动权限不匹配'); res.json({ success: true,data: { ...runtime(req, i, v, undefined),open: activityOpen(i, clock()),runtimeStatus: v?.runtime_status || 'stopped' } }); }));
    publicRoutes.get('/:id/user', route(async (req, res) => { const { item: i,user } = authorize(req); if (i.id !== Number(req.params.id)) throw new Error('活动权限不匹配'); res.json({ success: true,data: { loggedIn: !!user,user: user ? { id: user.id,username: user.username,isOwner: !!user.is_owner } : null } }); }));

    async function storage(req) {
        const a = authorize(req); if (a.item.id !== Number(req.params.id)) throw new Error('活动权限不匹配');
        const identifier = a.item.identifier || `external-${a.item.id}`, actor = a.data.userId ? `user-${a.data.userId}` : `guest-${a.data.guest}`;
        const directory = join(service.root, identifier, 'storage', 'users', actor); await mkdir(directory, { recursive: true }); return directory;
    }
    const key = req => { const value = String(req.params.key || ''); if (!value || value.length > 100) throw new Error('存档键需为 1～100 字'); return createHash('sha256').update(value).digest('hex'); };
    publicRoutes.get('/:id/storage/:key', route(async (req, res) => { const folder = await storage(req); let value = null; try { value = JSON.parse(await readFile(join(folder, `${key(req)}.json`), 'utf8')).value; } catch (e) { if (e.code !== 'ENOENT') throw e; } res.json({ success: true,data: value }); }));
    publicRoutes.put('/:id/storage/:key', sourceAllowed, route(async (req, res) => {
        const folder = await storage(req), bytes = Buffer.from(JSON.stringify({ key: req.params.key,value: req.body.value ?? null }));
        if (bytes.length > 512 * 1024) throw new Error('单份存档最多 512KB');
        await withStorageLock(folder, async () => { await quota(folder, bytes.length, `${key(req)}.json`); const path = join(folder, `${key(req)}.json`), temporary = `${path}.${randomUUID()}.tmp`; try { await writeFile(temporary, bytes); await rename(temporary, path); } finally { await rm(temporary, { force: true }); } }); res.json({ success: true });
    }));
    publicRoutes.delete('/:id/storage/:key', sourceAllowed, route(async (req, res) => { const folder = await storage(req); await withStorageLock(folder, () => rm(join(folder, `${key(req)}.json`), { force: true })); res.json({ success: true }); }));
    const fileUpload = multer({ storage: multer.memoryStorage(),limits: { fileSize: 10 * 1024 ** 2,files: 1 } });
    publicRoutes.post('/:id/files', sourceAllowed, (req, _res, next) => { try { const a = authorize(req); if (a.item.id !== Number(req.params.id)) throw new Error('活动权限不匹配'); next(); } catch (e) { next(e); } }, fileUpload.single('file'), route(async (req, res) => { if (!req.file) throw new Error('请选择文件'); const folder = await storage(req), id = randomUUID(); await withStorageLock(folder, async () => { await quota(folder, req.file.size, null); await writeFile(join(folder, `${id}.bin`), req.file.buffer); }); res.json({ success: true,data: { id,name: req.file.originalname,size: req.file.size } }); }));
    publicRoutes.get('/:id/files/:file', route(async (req, res) => { if (!guestPattern.test(req.params.file)) throw new Error('文件标识无效'); const path = join(await storage(req), `${req.params.file}.bin`); res.set('X-Content-Type-Options', 'nosniff').type('application/octet-stream').sendFile(path); }));
    publicRoutes.delete('/:id/files/:file', sourceAllowed, route(async (req, res) => { if (!guestPattern.test(req.params.file)) throw new Error('文件标识无效'); const folder = await storage(req); await withStorageLock(folder, () => rm(join(folder, `${req.params.file}.bin`), { force: true })); res.json({ success: true }); }));
    publicRoutes.all('/:id/backend/:port/*', sourceAllowed, route(async (req, res) => {
        const auth = authorize(req);
        if (auth.item.id !== Number(req.params.id) || !auth.version?.backend_enabled || auth.version.runtime_status !== 'running') throw new Error('活动后端不可用');
        if (auth.version.backend_port !== Number(req.params.port)) return res.status(409).json({ success: false,message: '后端端口已变更，请刷新运行配置' });
        proxy(req, res, auth, '/' + (req.params[0] || ''), service.docker.target(auth.version));
    }));
    const errors = (error, _req, res, _next) => { if (!res.headersSent) res.status(error.status || (error.code === 'ENOENT' ? 404 : error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)).json({ success: false,message: error.code === 'ENOENT' ? '活动文件不存在' : error.code === 'LIMIT_FILE_SIZE' ? '上传文件过大' : error.message || '活动操作失败' }); };
    admin.use(errors); publicRoutes.use(errors);
    function upgrade(req, socket, head) {
        const url = new URL(req.url, 'http://local'), match = /^\/api\/plaza\/(\d+)\/backend\/(\d+)\/(.*)$/.exec(url.pathname);
        if (!match) return false;
        try {
            req.get = name => req.headers[name.toLowerCase()]; req.query = Object.fromEntries(url.searchParams);
            const auth = authorize(req);
            if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new Error('请求来源无效');
            if (auth.item.id !== Number(match[1]) || !auth.version?.backend_enabled || auth.version.runtime_status !== 'running' || auth.version.backend_port !== Number(match[2])) throw new Error('活动后端不可用');
            url.searchParams.delete('ticket');
            const headers = { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': req.headers['sec-websocket-key'], 'sec-websocket-version': '13', ...identityHeaders(auth) };
            if (req.headers['sec-websocket-protocol']) headers['sec-websocket-protocol'] = req.headers['sec-websocket-protocol'];
            const upstream = http.request({ ...service.docker.target(auth.version), path: '/' + match[3] + (url.searchParams.size ? `?${url.searchParams}` : ''), headers });
            upstream.setTimeout(15000, () => upstream.destroy());
            upstream.on('upgrade', (response, remote, bytes) => {
                upstream.setTimeout(0);
                const allowed = ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-protocol'];
                socket.write(`HTTP/1.1 101 Switching Protocols\r\n${allowed.filter(key => response.headers[key]).map(key => `${key}: ${response.headers[key]}\r\n`).join('')}\r\n`);
                if (bytes.length) socket.write(bytes); if (head.length) remote.write(head);
                remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy()); socket.on('close', () => remote.destroy()); remote.on('close', () => socket.destroy()); remote.pipe(socket); socket.pipe(remote);
            });
            upstream.on('response', () => socket.destroy()); upstream.on('error', () => socket.destroy()); socket.on('close', () => upstream.destroy()); upstream.end();
        } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
        return true;
    }
    return { admin, publicRoutes, verify, authorize, upgrade };
}
async function quota(folder, extra, replacing) {
    const names = await readdir(folder); let total = extra;
    if (names.length >= 200 && !names.includes(replacing)) throw new Error('存档文件数量已达上限');
    for (const name of names) if (name !== replacing) total += (await stat(join(folder, name))).size;
    if (total > 20 * 1024 ** 2) throw new Error('该用户在此活动中的存储空间已满（20MB）');
}
function proxy(req, res, auth, path, target) {
    const query = new URL(req.originalUrl, 'http://local').searchParams; query.delete('ticket');
    const headers = { 'content-type': req.get('content-type') || 'application/octet-stream',accept: req.get('accept') || '*/*',
        ...identityHeaders(auth) };
    let body;
    if (req.body !== undefined && /json/i.test(req.get('content-type') || '')) body = Buffer.from(JSON.stringify(req.body));
    else if (req.body && /urlencoded/i.test(req.get('content-type') || '')) body = Buffer.from(new URLSearchParams(req.body).toString());
    if (body) headers['content-length'] = body.length; else if (req.get('content-length')) headers['content-length'] = req.get('content-length');
    const upstream = http.request({ ...target,method: req.method,path: path + (query.size ? `?${query}` : ''),headers }, response => {
        res.status(response.statusCode); for (const key of ['content-type','content-disposition','cache-control']) if (response.headers[key]) res.set(key, response.headers[key]); response.pipe(res);
    });
    upstream.setTimeout(30000, () => upstream.destroy(new Error('活动后端请求超时')));
    upstream.on('error', () => { if (!res.headersSent) res.status(502).json({ success: false,message: '暂时无法连接活动后端' }); else res.destroy(); });
    req.once('aborted', () => upstream.destroy()); res.once('close', () => { if (!res.writableEnded) upstream.destroy(); });
    if (body) upstream.end(body); else req.pipe(upstream);
}
function identityHeaders(auth) { return { 'x-activity-user': Buffer.from(JSON.stringify(auth.user ? { id: auth.user.id,username: auth.user.username } : null)).toString('base64url'), 'x-activity-id': String(auth.item.id) }; }
