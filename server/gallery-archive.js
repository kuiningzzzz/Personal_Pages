import express from 'express';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, realpath, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { Zip, ZipPassThrough } from 'fflate';
import { downloadPublic } from './public-download.js';

class ArchiveError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}
const safeName = value => String(value || '').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '图集';
const mimeExtensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' };

async function imageSource(url, publicRoot, fetchRemote, signal) {
    const parsed = new URL(url, 'https://gallery.invalid');
    if (/^(https?:)?\/\//i.test(url)) {
        const result = await fetchRemote(url.startsWith('//') ? `https:${url}` : url, signal);
        if (!result.mime.toLowerCase().startsWith('image/')) throw new ArchiveError('外链没有返回图片');
        let name = basename(decodeURIComponent(new URL(result.url).pathname)) || '图片';
        if (!extname(name)) name += mimeExtensions[result.mime] || '.img';
        return { name, bytes: result.bytes };
    }
    if (!url.startsWith('/') || url.startsWith('//')) throw new ArchiveError('图片地址无效');
    let pathname;
    try { pathname = decodeURIComponent(parsed.pathname); } catch { throw new ArchiveError('图片地址无效'); }
    if (!/^\/(picture|source)\//.test(pathname)) throw new ArchiveError('本地图片地址无效');
    const root = await realpath(publicRoot);
    const candidate = resolve(root, `.${pathname}`);
    if (!candidate.startsWith(root + sep)) throw new ArchiveError('本地图片地址越界');
    const path = await realpath(candidate);
    if (!path.startsWith(root + sep)) throw new ArchiveError('本地图片地址越界');
    if (!(await stat(path)).isFile()) throw new ArchiveError('本地图片不存在');
    return { name: basename(path), path };
}

export async function buildGalleryZip({ images, path, publicRoot, signal, fetchRemote = downloadPublic, maxBytes = 2 * 1024 ** 3 }) {
    if (!images.length) throw new ArchiveError('图集里还没有图片');
    const output = createWriteStream(path, { signal });
    const completion = finished(output, { cleanup: true });
    completion.catch(() => {});
    let blocked = false, size = 0;
    const zip = new Zip((error, bytes, final) => {
        if (error) { output.destroy(error); return; }
        blocked = !output.write(bytes) || blocked;
        if (final) output.end();
    });
    const flush = async () => {
        if (output.errored) throw output.errored;
        if (blocked) { await once(output, 'drain', { signal }); blocked = false; }
    };
    try {
        for (let i = 0; i < images.length; i++) {
            signal?.throwIfAborted();
            try {
                const source = await imageSource(images[i].url, publicRoot, fetchRemote, signal);
                const file = new ZipPassThrough(`${String(i + 1).padStart(4, '0')}-${safeName(source.name)}`);
                zip.add(file);
                const chunks = source.path ? createReadStream(source.path, { signal }) : (function* () {
                    for (let offset = 0; offset < source.bytes.length; offset += 64 * 1024) yield source.bytes.subarray(offset, offset + 64 * 1024);
                })();
                for await (const chunk of chunks) {
                    signal?.throwIfAborted();
                    size += chunk.length;
                    if (size > maxBytes) throw new ArchiveError('图包超过 2 GB，暂时无法整体下载', 413);
                    file.push(chunk);
                    await flush();
                }
                file.push(new Uint8Array(), true);
                await flush();
            } catch (error) {
                if (signal?.aborted) throw new ArchiveError('打包已取消或超时，请重试', 408);
                const reason = error instanceof ArchiveError ? error.message : error.code === 'ENOENT' ? '本地图片不存在' : '图片读取失败，请检查图片链接';
                throw new ArchiveError(`第 ${i + 1} 张图片：${reason}`, error.status || 422);
            }
        }
        zip.end();
        await completion;
    } catch (error) {
        zip.terminate(); output.destroy();
        await completion.catch(() => {});
        throw error;
    }
}

export function createGalleryArchiveRoutes({ db, publicRoot, imagesFor, publicAncestors, fetchRemote = downloadPublic }) {
    const router = express.Router();
    const archives = new Map();
    let active = 0, allocated = 0;
    const gallery = id => {
        const row = db.prepare("SELECT * FROM entries WHERE id=? AND kind='resource' AND resource_kind='gallery' AND status='published'").get(id);
        return row && publicAncestors(row) !== null ? row : null;
    };
    router.post('/entries/:id/gallery-archive', async (req, res) => {
        try {
            if (req.get('sec-fetch-site') === 'cross-site' || (req.get('origin') && new URL(req.get('origin')).host !== req.get('host'))) {
                return res.status(403).json({ success: false, message: '请求来源无效' });
            }
        } catch { return res.status(403).json({ success: false, message: '请求来源无效' }); }
        const row = gallery(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: '图集不存在' });
        const images = imagesFor(row.id);
        if (!images.length) return res.status(400).json({ success: false, message: '图集里还没有图片' });
        if (active >= 2 || allocated >= 4) return res.status(429).json({ success: false, message: '图包打包繁忙，请稍后再试' });
        active++; allocated++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); timeout.unref();
        const abort = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', abort);
        let folder, retained = false;
        try {
            folder = await mkdtemp(join(tmpdir(), 'personal-pages-gallery-'));
            const path = join(folder, 'images.zip');
            await buildGalleryZip({ images, path, publicRoot, fetchRemote, signal: controller.signal });
            controller.signal.throwIfAborted();
            const token = randomBytes(24).toString('hex');
            let disposed = false;
            const dispose = async () => {
                if (disposed) return;
                disposed = true; allocated--; archives.delete(token); clearTimeout(expiry);
                await rm(folder, { recursive: true, force: true });
            };
            const expiry = setTimeout(() => { dispose().catch(() => {}); }, 5 * 60 * 1000); expiry.unref();
            archives.set(token, { id: row.id, path, filename: `${safeName(row.title)}.zip`, dispose, expiry });
            retained = true;
            res.set('Cache-Control', 'no-store').json({ success: true, downloadUrl: `/api/content/entries/${row.id}/gallery-archive/${token}` });
        } catch (error) {
            if (!res.destroyed) res.status(error.status || 500).json({ success: false, message: error instanceof ArchiveError ? error.message : '图包打包失败，请稍后重试' });
        } finally {
            active--; clearTimeout(timeout); res.off('close', abort);
            if (!retained) { allocated--; if (folder) await rm(folder, { recursive: true, force: true }).catch(() => {}); }
        }
    });
    router.get('/entries/:id/gallery-archive/:token', (req, res) => {
        const archive = archives.get(req.params.token);
        if (!archive || archive.id !== Number(req.params.id)) return res.status(404).json({ success: false, message: '图包不存在或已过期，请重新下载' });
        if (!gallery(req.params.id)) {
            archive.dispose().catch(() => {});
            return res.status(404).json({ success: false, message: '图包不存在或已过期，请重新下载' });
        }
        archives.delete(req.params.token); clearTimeout(archive.expiry);
        res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' });
        res.download(archive.path, archive.filename, error => {
            archive.dispose().catch(() => {});
            if (error && !res.headersSent && !res.destroyed) res.status(500).json({ success: false, message: '图包下载失败，请重试' });
        });
    });
    return router;
}
