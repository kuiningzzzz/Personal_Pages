import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { Zip, ZipDeflate, ZipPassThrough, Unzip, UnzipInflate } from 'fflate';

export const MAX_UPLOAD = 2 * 1024 ** 3;
const MAX_EXPANDED = 20 * 1024 ** 3;
const MAX_FILES = 60000;
export function safeName(name) {
    if (typeof name !== 'string' || name.length > 1000 || name.includes('\\') || name.startsWith('/') || name.includes(':') || /[\x00-\x1f]/.test(name)) throw new Error('备份包含无效文件路径');
    const parts = name.replace(/\/$/, '').split('/');
    if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('备份包含不安全的文件路径');
    return name;
}
export async function digest(path) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    return hash.digest('hex');
}
export async function writeArchive(path, files, progress = () => {}) {
    if (files.length > MAX_FILES) throw new Error('备份文件数量超过 60000 个，请分批整理后备份');
    const output = createWriteStream(path, { flags: 'wx' });
    const complete = finished(output); complete.catch(() => {});
    let error, blocked = false, written = 0;
    output.on('error', cause => { error = cause; });
    const zip = new Zip((cause, bytes, final) => {
        if (cause) { error = cause; output.destroy(cause); return; }
        written += bytes.length;
        if (written > MAX_UPLOAD) { error = new Error('完整备份包超过 2GB，请先整理大型资源文件'); output.destroy(error); return; }
        blocked = !output.write(bytes) || blocked;
        if (final) output.end();
    });
    async function flush() { if (error) throw error; if (blocked) { await once(output, 'drain'); blocked = false; } }
    try {
        for (let i = 0; i < files.length; i++) {
            const item = files[i]; safeName(item.name);
            // Compressed media is stored; database snapshots, Markdown and sessions are deflated.
            const file = /\.(?:mp3|mp4|png|jpe?g|webp|gif|zip|pdf)$/i.test(item.name) ? new ZipPassThrough(item.name) : new ZipDeflate(item.name, { level: 3 });
            zip.add(file);
            for await (const bytes of createReadStream(item.path, { highWaterMark: 65536 })) { file.push(bytes); await flush(); }
            file.push(new Uint8Array(), true); await flush();
            progress(i + 1, files.length);
        }
        zip.end(); await complete;
    } catch (cause) { zip.terminate(); output.destroy(); await complete.catch(() => {}); throw cause; }
}

// Extract to a new private directory, never to the live public/data directories.
// Input and output are streamed; expansion limits apply to actual bytes, not ZIP claims.
export async function extractArchive(path, root) {
    await mkdir(root, { recursive: true });
    const seen = new Set(), files = new Map(), handles = new Set();
    let failure, total = 0, writes = [];
    const unzip = new Unzip(file => {
        try {
            safeName(file.name);
            const key = file.name.toLocaleLowerCase('en-US');
            if (seen.has(key) || seen.size >= MAX_FILES) throw new Error('备份包含重复文件或文件数量过多');
            seen.add(key);
            if (file.name.endsWith('/')) return;
            const target = resolve(root, file.name);
            if (!target.startsWith(resolve(root) + sep)) throw new Error('备份文件路径越界');
            const record = { path: target, size: 0, hash: createHash('sha256'), complete: false, handle: null, chain: mkdir(dirname(target), { recursive: true }).then(() => open(target, 'wx')).then(h => { record.handle = h; handles.add(h); }) };
            files.set(file.name, record);
            file.ondata = (cause, bytes, final) => {
                if (cause) { failure ||= cause; return; }
                total += bytes.length; record.size += bytes.length;
                if (total > MAX_EXPANDED || record.size > MAX_EXPANDED) { failure ||= new Error('备份解压后超过 20GB 限制'); return; }
                record.hash.update(bytes);
                record.chain = record.chain.then(async () => {
                    if (failure) return;
                    let offset = 0;
                    while (offset < bytes.length) offset += (await record.handle.write(bytes, offset, bytes.length - offset)).bytesWritten;
                    if (final) { await record.handle.close(); handles.delete(record.handle); record.complete = true; record.sha256 = record.hash.digest('hex'); }
                });
                record.chain.catch(cause => { failure ||= cause; });
                writes.push(record.chain);
            };
            file.start();
        } catch (cause) { failure ||= cause; }
    });
    unzip.register(UnzipInflate);
    try {
        for await (const bytes of createReadStream(path, { highWaterMark: 16384 })) {
            unzip.push(bytes, false); await Promise.all(writes); writes = [];
            if (failure) throw failure;
        }
        unzip.push(new Uint8Array(), true); await Promise.all(writes);
        if (failure) throw failure;
        if (!files.size || [...files.values()].some(f => !f.complete)) throw new Error('备份包不完整');
        // ZIP headers alone are not sufficient: require a complete end-of-central-directory.
        const h = await open(path, 'r');
        try {
            const size = (await stat(path)).size, tail = Buffer.alloc(Math.min(size, 65557));
            await h.read(tail, 0, tail.length, size - tail.length);
            let valid = false;
            for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length && tail.readUInt16LE(i + 4) === 0 && tail.readUInt16LE(i + 6) === 0) { valid = true; break; }
            if (!valid) throw new Error('备份包损坏或被截断');
        } finally { await h.close(); }
        return files;
    } finally { await Promise.allSettled([...handles].map(h => h.close())); }
}
