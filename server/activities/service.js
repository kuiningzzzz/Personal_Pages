import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { unpackActivity, validIdentifier } from './package.js';
import { activityOpen } from './schema.js';

const now = () => new Date().toISOString();
export function createActivityService({ db, root, docker, clock = Date.now, onRemoved = () => {} }) {
    root = resolve(root); let tail = Promise.resolve(), busy = 0, paused = false, interval, needsPrune = false, initialized = false;
    const retries = new Map();
    needsPrune = !!db.prepare('SELECT id FROM plaza_versions WHERE backend_enabled=1 LIMIT 1').get() || !!(db.prepare("SELECT name FROM sqlite_master WHERE name='backup_state'").get() && db.prepare("SELECT value FROM backup_state WHERE key='restore'").get());
    const jobs = [];
    const item = id => db.prepare('SELECT * FROM plaza_items WHERE id=?').get(id);
    const version = id => db.prepare('SELECT * FROM plaza_versions WHERE id=?').get(id);
    const directory = (v, i = item(v.item_id)) => { if (!validIdentifier(i?.identifier) || !/^[a-f0-9-]{36}$/.test(v.id)) throw new Error('活动标识无效'); return join(root, i.identifier, 'versions', v.id); };
    async function removePath(path) { if (!resolve(path).startsWith(root + sep)) throw new Error('活动清理路径越界'); await rm(path, { recursive: true, force: true }); }
    function log(id, message) {
        const v = version(id); if (!v) return;
        const logs = JSON.parse(v.logs); logs.push({ time: now(), text: String(message).slice(0, 8000) });
        db.prepare('UPDATE plaza_versions SET logs=? WHERE id=?').run(JSON.stringify(logs.slice(-200)), id);
    }
    function enqueue(kind, itemId, action) {
        if (paused) throw new Error('备份进行中，请稍后操作');
        const job = { id: randomUUID(), kind, itemId, status: 'queued', message: '等待执行', created_at: now() }; jobs.push(job); if (jobs.length > 40) jobs.shift(); busy++;
        tail = tail.then(async () => {
            job.status = 'running'; job.message = '正在执行…';
            try { await action(job); job.status = 'completed'; job.message = '操作完成'; }
            catch (e) { job.status = 'failed'; job.message = e.message; }
            finally { busy--; job.finished_at = now(); }
        });
        return job;
    }
    async function allocate(v, requested) {
        const reserved = new Set(db.prepare('SELECT backend_port FROM plaza_versions WHERE id<>? AND backend_port IS NOT NULL').all(v.id).map(r => r.backend_port));
        if (requested !== undefined) {
            if (!Number.isSafeInteger(requested) || requested < 40000 || requested > 65535) throw new Error('后端端口必须在 40000～65535 之间');
            if (requested === v.backend_port) return requested;
            if (reserved.has(requested) || !await docker.free(requested)) throw new Error('该端口已被占用，不能保存');
            return requested;
        }
        if (v.backend_port && !reserved.has(v.backend_port)) {
            const info = await docker.inspect(v);
            if (info?.State?.Running || await docker.free(v.backend_port)) return v.backend_port;
        }
        for (let port = 40000; port <= 65535; port++) if (!reserved.has(port) && await docker.free(port)) return port;
        throw new Error('没有可分配的活动端口');
    }
    async function prepare(v, i, running) {
        if (!v.backend_enabled) { db.prepare("UPDATE plaza_versions SET build_status='ready',runtime_status='stopped',error='' WHERE id=?").run(v.id); return; }
        try {
            const port = await allocate(v); db.prepare("UPDATE plaza_versions SET backend_port=?,build_status='building',error='' WHERE id=?").run(port, v.id);
            log(v.id, '开始构建活动后端镜像'); await docker.build(v, directory(v, i), text => log(v.id, text));
            db.prepare("UPDATE plaza_versions SET build_status='ready' WHERE id=?").run(v.id);
            v = version(v.id); i = item(i.id);
            if (running) {
                db.prepare("UPDATE plaza_versions SET runtime_status='starting' WHERE id=?").run(v.id);
                try { await docker.start(v, i, join(root, i.identifier, 'storage', 'backend')); }
                catch (e) {
                    if (!/allocated|address already in use|ports are not available|bind:/i.test(e.message)) throw e;
                    await docker.stop(v, true); v.backend_port = null;
                    const next = await allocate(v); db.prepare('UPDATE plaza_versions SET backend_port=? WHERE id=?').run(next, v.id);
                    await docker.start(version(v.id), i, join(root, i.identifier, 'storage', 'backend'));
                }
                db.prepare("UPDATE plaza_versions SET runtime_status='running',error='' WHERE id=?").run(v.id); log(v.id, '后端已就绪');
            } else { await docker.stop(v); db.prepare("UPDATE plaza_versions SET runtime_status='stopped' WHERE id=?").run(v.id); }
            retries.delete(v.id);
        } catch (e) {
            retries.set(v.id, clock() + 60000);
            db.prepare("UPDATE plaza_versions SET build_status=CASE WHEN build_status='ready' THEN 'ready' ELSE 'failed' END,runtime_status='error',error=? WHERE id=?").run(e.message.slice(0, 2000), v.id);
            log(v.id, e.message); await docker.stop(v).catch(() => {}); throw e;
        }
    }
    async function importPackage(path) {
        const temporary = join(root, 'imports', randomUUID()); await mkdir(temporary, { recursive: true });
        try {
            const manifest = await unpackActivity(path, join(temporary, 'files'));
            let i = db.prepare('SELECT * FROM plaza_items WHERE identifier=?').get(manifest.id);
            if (i && (i.kind !== 'activity' || i.source !== 'package')) throw new Error('标识符已被其他活动占用');
            if (i && db.prepare('SELECT id FROM plaza_versions WHERE item_id=? AND version=?').get(i.id, manifest.version)) throw new Error('该版本已上传');
            const id = randomUUID(), destination = join(root, manifest.id, 'versions', id);
            await mkdir(join(destination, '..'), { recursive: true }); await rename(join(temporary, 'files'), destination);
            try {
                await rename(path, join(destination, 'release.zip'));
                db.transaction(() => {
                    if (!i) {
                        const result = db.prepare("INSERT INTO plaza_items(kind,identifier,title,created_at,updated_at,display_order) VALUES('activity',?,?,?,?,?)").run(manifest.id, manifest.id, now(), now(), nextOrder(null));
                        i = item(Number(result.lastInsertRowid));
                    }
                    db.prepare('INSERT INTO plaza_versions(id,item_id,version,manifest,backend_enabled,created_at) VALUES(?,?,?,?,?,?)').run(id, i.id, manifest.version, JSON.stringify(manifest), manifest.backend ? 1 : 0, now());
                })();
            } catch (e) { await removePath(destination); throw e; }
            return { itemId: i.id, versionId: id };
        } finally { await removePath(temporary); }
    }
    const nextOrder = parent => Number(db.prepare('SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM plaza_items WHERE parent_id IS ?').get(parent).n);
    function validate(input, id) {
        const title = String(input.title || '').trim(), parent = input.parent_id === null || input.parent_id === '' || input.parent_id === undefined ? null : Number(input.parent_id);
        if (!title || title.length > 150) throw new Error('请填写名称，最多 150 字');
        if (parent !== null && (!Number.isSafeInteger(parent) || item(parent)?.kind !== 'collection')) throw new Error('活动合集不存在');
        const visited = new Set([id]); let cursor = parent;
        while (cursor) { if (visited.has(cursor)) throw new Error('合集不能循环嵌套'); visited.add(cursor); cursor = item(cursor)?.parent_id; }
        if (!Array.isArray(input.tags)) throw new Error('活动标签无效');
        const tags = [...new Set(input.tags.map(Number))], allowed = new Set(db.prepare('SELECT id FROM plaza_tags').all().map(t => t.id));
        if (!Array.isArray(input.tags) || tags.some(t => !allowed.has(t))) throw new Error('活动标签无效');
        const schedule = input.schedule === 'timed' ? 'timed' : 'permanent';
        if (schedule === 'timed' && (!Number.isFinite(Date.parse(input.starts_at)) || !Number.isFinite(Date.parse(input.ends_at)) || Date.parse(input.starts_at) >= Date.parse(input.ends_at))) throw new Error('限时活动需设置有效的起止时间');
        if (!String(input.entry_label || '').trim()) throw new Error('请填写入口文案');
        let env; try { env = typeof input.backend_env === 'string' ? JSON.parse(input.backend_env) : input.backend_env || {}; } catch { throw new Error('后端环境变量需填写 JSON 对象'); }
        if (!env || Array.isArray(env) || Object.keys(env).length > 50 || Object.entries(env).some(([k, v]) => !/^[A-Z_][A-Z0-9_]{0,79}$/.test(k) || typeof v !== 'string' || v.length > 4096 || ['PORT', 'HOST', 'ACTIVITY_DATA_DIR'].includes(k))) throw new Error('后端环境变量格式无效，PORT/HOST/ACTIVITY_DATA_DIR 由主站管理');
        if (input.source === 'external' && input.kind !== 'collection') { let url; try { url = new URL(input.external_url); } catch { throw new Error('请填写完整的外部网址'); } if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('外部网址仅支持 HTTP/HTTPS'); }
        return { title, parent, tags, schedule, env };
    }
    function save(id, input) {
        const current = item(id); if (!current) throw new Error('活动不存在');
        const v = validate({ ...input, source: current.source, kind: current.kind }, id);
        db.prepare(`UPDATE plaza_items SET title=?,parent_id=?,summary=?,cover=?,tags=?,entry_label=?,pause_music=?,login_required=?,schedule=?,starts_at=?,ends_at=?,external_url=?,backend_env=?,display_order=?,updated_at=? WHERE id=?`)
            .run(v.title, v.parent, String(input.summary || '').slice(0, 5000), String(input.cover || '').slice(0, 2048), JSON.stringify(v.tags), String(input.entry_label).trim().slice(0, 100), input.pause_music ? 1 : 0, input.login_required ? 1 : 0, v.schedule, v.schedule === 'timed' ? new Date(input.starts_at).toISOString() : null, v.schedule === 'timed' ? new Date(input.ends_at).toISOString() : null, String(input.external_url || ''), JSON.stringify(v.env), current.parent_id === v.parent ? current.display_order : nextOrder(v.parent), now(), id);
    }
    function activate(id, state, versionId) {
        if (!['pending', 'preview', 'published'].includes(state)) throw new Error('发布状态无效');
        const current = item(id); if (!current) throw new Error('活动不存在');
        validate({ ...current, tags: JSON.parse(current.tags), source: current.source }, id);
        const selected = current.kind === 'activity' && current.source === 'package' ? version(versionId) : null;
        if (current.source === 'package' && current.kind === 'activity' && selected?.item_id !== id) throw new Error('请选择该活动的版本');
        if (state === 'published' && current.kind === 'activity' && (selected ? current.preview_version_id !== selected.id && current.published_version_id !== selected.id : current.state === 'pending')) throw new Error('请先进入预览状态调试，再发布');
        return enqueue('activate', id, async () => {
            const i = item(id); if (!i) throw new Error('活动已移除');
            if (selected && state !== 'pending') await prepare(version(selected.id), i, state === 'preview' || activityOpen(i, clock()) && ancestorsPublished(i));
            db.transaction(() => {
                if (state === 'pending') {
                    db.prepare("UPDATE plaza_items SET state='pending',preview_version_id=NULL,published_version_id=NULL,updated_at=? WHERE id=?").run(now(), id);
                    db.prepare("UPDATE plaza_versions SET state='archived' WHERE item_id=? AND state IN ('published','preview')").run(id);
                } else if (state === 'preview') {
                    if (selected) {
                        db.prepare("UPDATE plaza_versions SET state='archived' WHERE item_id=? AND state='preview' AND id<>? AND id IS NOT ?").run(id, selected.id, i.published_version_id);
                        if (selected.id !== i.published_version_id) db.prepare("UPDATE plaza_versions SET state='preview' WHERE id=?").run(selected.id);
                    }
                    db.prepare("UPDATE plaza_items SET state=CASE WHEN state='published' THEN state ELSE 'preview' END,preview_version_id=?,updated_at=? WHERE id=?").run(selected?.id || null, now(), id);
                } else {
                    db.prepare("UPDATE plaza_versions SET state='archived' WHERE item_id=? AND id<>?").run(id, selected?.id || '');
                    if (selected) db.prepare("UPDATE plaza_versions SET state='published' WHERE id=?").run(selected.id);
                    db.prepare("UPDATE plaza_items SET state='published',published_version_id=?,preview_version_id=NULL,updated_at=? WHERE id=?").run(selected?.id || null, now(), id);
                }
            })();
            await reconcileItem(item(id));
        });
    }
    async function reconcileItem(i) {
        const versions = db.prepare('SELECT * FROM plaza_versions WHERE item_id=?').all(i.id);
        for (const v of versions.filter(v => v.backend_enabled)) {
            const preview = i.preview_version_id === v.id && i.state !== 'pending';
            const published = i.published_version_id === v.id && i.state === 'published';
            if (preview || published) {
                const running = preview || activityOpen(i, clock()) && ancestorsPublished(i);
                if ((retries.get(v.id) || 0) > clock()) continue;
                const info = await docker.inspect(v);
                if (v.build_status !== 'ready' || !await docker.imageReady(v) || running && (!info?.State?.Running || !docker.configured(info, v, i))) await prepare(v, i, running);
                else if (!running && v.runtime_status !== 'stopped') { await docker.stop(v); db.prepare("UPDATE plaza_versions SET runtime_status='stopped' WHERE id=?").run(v.id); }
                else if (!running && info?.State?.Running) { await docker.stop(v); db.prepare("UPDATE plaza_versions SET runtime_status='stopped' WHERE id=?").run(v.id); }
                else if (running && v.runtime_status !== 'running') db.prepare("UPDATE plaza_versions SET runtime_status='running',error='' WHERE id=?").run(v.id);
            } else if (v.runtime_status !== 'stopped' || (await docker.inspect(v))?.State?.Running) { await docker.stop(v); db.prepare("UPDATE plaza_versions SET runtime_status='stopped' WHERE id=?").run(v.id); }
        }
    }
    function ancestorsPublished(i) { const seen = new Set([i.id]); let parent = i.parent_id; while (parent) { const p = item(parent); if (!p || p.state !== 'published' || seen.has(parent)) return false; seen.add(parent); parent = p.parent_id; } return true; }
    function reconcile() {
        if (busy || paused) return;
        const rows = db.prepare("SELECT * FROM plaza_items WHERE kind='activity' AND source='package'").all();
        if (!rows.length && !needsPrune) return;
        enqueue('schedule', null, async () => {
            const all = new Set(db.prepare('SELECT id FROM plaza_versions').all().map(v => v.id));
            let pruneError;
            if (needsPrune) { try { await docker.prune(all); needsPrune = false; } catch (e) { pruneError = e; } }
            for (const i of rows) { try { await reconcileItem(item(i.id)); } catch (e) { for (const v of db.prepare('SELECT * FROM plaza_versions WHERE item_id=? AND backend_enabled=1').all(i.id)) if (v.id === i.preview_version_id || v.id === i.published_version_id) { if (v.error !== e.message) log(v.id, e.message); db.prepare("UPDATE plaza_versions SET runtime_status='error',error=? WHERE id=?").run(e.message.slice(0, 2000), v.id); retries.set(v.id, clock() + 60000); } } }
            if (pruneError) throw pruneError;
        });
    }
    function changePort(id, versionId, port) {
        const v = version(versionId); if (v?.item_id !== id || !v.backend_enabled) throw new Error('该版本没有后端');
        return enqueue('port', id, async () => {
            const requested = await allocate(version(versionId), port), previous = version(versionId), i = item(id);
            if (requested === previous.backend_port) return;
            const running = (await docker.inspect(previous))?.State?.Running;
            if (running) db.prepare("UPDATE plaza_versions SET runtime_status='starting' WHERE id=?").run(versionId);
            await docker.stop(previous, true);
            db.prepare('UPDATE plaza_versions SET backend_port=? WHERE id=?').run(requested, versionId);
            try { if (running) { await docker.start(version(versionId), i, join(root, i.identifier, 'storage', 'backend')); db.prepare("UPDATE plaza_versions SET runtime_status='running',error='' WHERE id=?").run(versionId); } log(versionId, `后端端口已更新：${previous.backend_port} → ${requested}`); }
            catch (e) { await docker.stop(version(versionId), true).catch(() => {}); db.prepare('UPDATE plaza_versions SET backend_port=? WHERE id=?').run(previous.backend_port, versionId); if (running) { try { await docker.start(previous, i, join(root, i.identifier, 'storage', 'backend')); db.prepare("UPDATE plaza_versions SET runtime_status='running',error='' WHERE id=?").run(versionId); } catch (restoreError) { db.prepare("UPDATE plaza_versions SET runtime_status='error',error=? WHERE id=?").run(`端口更新失败，恢复旧端口失败：${restoreError.message}`.slice(0, 2000), versionId); } } log(versionId, e.message); throw e; }
        });
    }
    function remove(id, versionId) {
        const i = item(id); if (!i) throw new Error('活动不存在');
        if (!versionId && db.prepare('SELECT id FROM plaza_items WHERE parent_id=? LIMIT 1').get(id)) throw new Error('请先移出或删除合集中的活动');
        if (versionId && (i.published_version_id === versionId || i.preview_version_id === versionId)) throw new Error('请先切换版本或撤回活动，再删除当前使用中的版本');
        if (versionId && version(versionId)?.item_id !== id) throw new Error('版本不存在');
        return enqueue('delete', id, async () => {
            const latest = item(id); if (!latest) throw new Error('活动已移除');
            if (versionId && [latest.published_version_id, latest.preview_version_id].includes(versionId)) throw new Error('不能删除当前使用中的版本');
            if (!versionId && db.prepare('SELECT id FROM plaza_items WHERE parent_id=? LIMIT 1').get(id)) throw new Error('请先清空活动合集');
            const versions = db.prepare('SELECT * FROM plaza_versions WHERE item_id=?').all(id).filter(v => !versionId || v.id === versionId);
            for (const v of versions) { if (v.backend_enabled && (v.backend_port || v.build_status !== 'pending' || v.runtime_status !== 'stopped')) await docker.remove(v); await removePath(directory(v, i)); db.prepare('DELETE FROM plaza_versions WHERE id=?').run(v.id); }
            if (!versionId) { await removePath(join(root, i.identifier || `external-${i.id}`)); db.prepare('DELETE FROM plaza_items WHERE id=?').run(id); }
            onRemoved();
        });
    }
    return {
        db, root, docker, item, version, directory, importPackage, save, activate, remove, changePort, allocate, jobs: () => jobs,
        create(kind, source, input) {
            if (kind === 'activity' && source !== 'external') throw new Error('网页包活动请通过上传创建');
            const id = Number(db.prepare('INSERT INTO plaza_items(kind,source,title,display_order,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(kind, source, String(input.title || (kind === 'collection' ? '新合集' : '新活动')), nextOrder(null), now(), now()).lastInsertRowid);
            try { save(id, { tags: [], entry_label: '进入活动', ...input }); } catch (e) { db.prepare('DELETE FROM plaza_items WHERE id=?').run(id); throw e; } return id;
        },
        async validatePort(id, versionId, port) { const v = version(versionId); if (v?.item_id !== id || !v.backend_enabled) throw new Error('活动版本无效'); return allocate(v, port); },
        reconcile,
        start() { paused = false; if (!initialized) { initialized = true; db.prepare("UPDATE plaza_versions SET error=CASE WHEN build_status='building' THEN '上次构建被中断，请重新进入预览' ELSE error END,build_status=CASE WHEN build_status='building' THEN 'pending' ELSE build_status END,runtime_status='stopped' WHERE backend_enabled=1").run(); } if (!interval) { interval = setInterval(reconcile, 15000); interval.unref(); } reconcile(); },
        restored() { needsPrune = true; retries.clear(); },
        async idle() { await tail; },
        async stop() { paused = true; clearInterval(interval); interval = null; await tail; },
        async pause() { if (busy) throw new Error('活动后端正在构建或更新，请完成后再备份或还原'); paused = true; for (const v of db.prepare("SELECT * FROM plaza_versions WHERE backend_enabled=1 AND runtime_status<>'stopped'").all()) { await docker.stop(v, true); db.prepare("UPDATE plaza_versions SET runtime_status='stopped' WHERE id=?").run(v.id); } },
        busy: () => busy > 0
    };
}
