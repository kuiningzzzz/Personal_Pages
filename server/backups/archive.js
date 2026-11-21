import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, statfs } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setImmediate as yieldThread } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';
import ZipStream from 'zip-stream';
import { BACKUP_LIMITS } from '../../shared/backup-limits.js';

export const MAX_UPLOAD = BACKUP_LIMITS.uploadBytes;
const gib = value => `${Math.ceil(value / 1024 ** 3)}GB`;
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

// Includes implicit parents, to detect file/directory and case-only collisions.
export function pathIndex() {
    const seen = new Set(), files = new Set(), directories = new Set();
    return name => {
        safeName(name);
        const directory = name.endsWith('/'), key = name.replace(/\/$/, '').toLocaleLowerCase('en-US');
        if (seen.has(key)) throw new Error(`备份包含重复路径：${name}`);
        if (!directory && directories.has(key) || directory && files.has(key)) throw new Error(`备份文件和目录冲突：${name}`);
        const parts = key.split('/');
        for (let i = 1; i < parts.length; i++) {
            const parent = parts.slice(0, i).join('/');
            if (files.has(parent)) throw new Error(`备份文件和目录冲突：${name}`);
            directories.add(parent);
        }
        seen.add(key); (directory ? directories : files).add(key);
    };
}

export async function writeArchive(path, files, progress = () => {}, { limits = BACKUP_LIMITS, forceZip64Format = false } = {}) {
    if (files.length > limits.files) throw new Error(`备份文件数量超过 ${limits.files} 个`);
    const checkPath = pathIndex();
    for (const file of files) checkPath(file.name);
    const zip = new ZipStream({ zlib: { level: 3 }, forceZip64: forceZip64Format || files.length >= 0xffff });
    let activeInput, failure, written = 0;
    const output = createWriteStream(path, { flags: 'wx', mode: 0o600 });
    const cap = new Transform({ transform(bytes, _encoding, cb) {
        written += bytes.length;
        cb(written > limits.uploadBytes ? new Error(`完整备份包超过 ${gib(limits.uploadBytes)} 限制`) : null, bytes);
    } });
    zip.on('error', error => { failure ||= error; activeInput?.destroy(); });
    const complete = pipeline(zip, cap, output); complete.catch(error => { failure ||= error; });
    try {
        // Only one entry is queued at a time. Pipes apply backpressure; the
        // writer retains just central-directory metadata for the final index.
        for (let i = 0; i < files.length; i++) {
            if (failure) throw failure;
            const item = files[i];
            const store = /\.(?:mp3|mp4|png|jpe?g|webp|gif|zip|pdf)$/i.test(item.name);
            activeInput = createReadStream(item.path);
            // Remove per-entry error listeners immediately. Racing every entry
            // against one pending completion promise would retain N callbacks.
            await new Promise((resolveEntry, reject) => {
                const onError = error => reject(error);
                zip.once('error', onError);
                zip.entry(activeInput, { name: item.name, store, mode: 0o100600 }, error => {
                    zip.removeListener('error', onError);
                    error ? reject(error) : resolveEntry();
                });
            });
            progress(i + 1, files.length);
            if (i && i % 1000 === 0) await yieldThread();
        }
        zip.finalize(); await complete;
    } catch (error) {
        activeInput?.destroy(); zip.destroy(error);
        await complete.catch(() => {}); throw error;
    }
}

// Central-directory boundaries avoid mistaking nested ZIP payloads for entries.
// Old fflate archives use unknown-length stored streams with data descriptors;
// scanning their payloads for ZIP signatures causes false duplicate errors.
export async function extractArchive(path, root, { limits = BACKUP_LIMITS, progress = () => {} } = {}) {
    if ((await stat(path)).size > limits.uploadBytes) throw new Error(`备份包超过 ${gib(limits.uploadBytes)} 限制`);
    await mkdir(root, { recursive: true }); root = resolve(root);
    const space = await statfs(root), available = space.bavail * space.bsize;
    const reserve = Math.min(1024 ** 3, Math.max(64 * 1024 ** 2, available * 0.02));
    const budget = Math.max(0, available - reserve);
    const files = new Map(), checkPath = pathIndex();
    let total = 0, allocated = 0, count = 0, lastProgress = 0;
    const zip = await yauzl.openPromise(path, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true });
    try {
        if (!zip.entryCount || zip.entryCount > limits.entries) throw new Error(`备份条目数量超过 ${limits.entries} 个或压缩包为空`);
        for await (const entry of zip.eachEntry()) {
            const name = entry.fileName; checkPath(name);
            const directory = name.endsWith('/'), type = (entry.externalFileAttributes >>> 16) & 0xf000;
            if (type && type !== (directory ? 0x4000 : 0x8000)) throw new Error(`备份不支持符号链接或特殊文件：${name}`);
            if (!entry.canDecodeFileData() || entry.generalPurposeBitFlag & 1) throw new Error(`备份文件加密或压缩方式不受支持：${name}`);
            if (directory) continue;
            if (++count > limits.files) throw new Error(`备份文件数量超过 ${limits.files} 个`);
            if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || total + entry.uncompressedSize > limits.expandedBytes) throw new Error(`备份解压后超过 ${gib(limits.expandedBytes)} 限制`);
            allocated += Math.max(space.bsize, Math.ceil(entry.uncompressedSize / space.bsize) * space.bsize);
            if (allocated > budget) throw new Error('服务器磁盘可用空间不足，无法完整解压备份；当前网站数据未被替换');
            if (name === 'manifest.json' && entry.uncompressedSize > limits.manifestBytes || /^databases\/(card|comment)\.json$/.test(name) && entry.uncompressedSize > limits.databaseBytes) throw new Error(`备份清单或数据库文件过大：${name}`);
            const target = resolve(root, name);
            if (!target.startsWith(root + sep)) throw new Error('备份文件路径越界');
            await mkdir(dirname(target), { recursive: true });
            const hash = createHash('sha256'); let size = 0, checksum = 0;
            const watcher = new Transform({ transform(bytes, _encoding, cb) {
                size += bytes.length; total += bytes.length;
                if (total > limits.expandedBytes || size > entry.uncompressedSize) return cb(new Error('备份解压大小超出限制或声明值'));
                hash.update(bytes); checksum = crc32(bytes, checksum);
                if (Date.now() - lastProgress > 300) { progress({ files: count, entries: zip.entryCount, bytes: total }); lastProgress = Date.now(); }
                cb(null, bytes);
            } });
            await pipeline(await zip.openReadStreamPromise(entry), watcher, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
            if (size !== entry.uncompressedSize || checksum !== entry.crc32) throw new Error(`备份文件校验失败：${name}`);
            // Keep only metadata, not file handles, promises or hash objects.
            files.set(name, { path: target, size, complete: true, sha256: hash.digest('hex') });
            if (Date.now() - lastProgress > 300) { progress({ files: count, entries: zip.entryCount, bytes: total }); lastProgress = Date.now(); }
        }
        if (!files.size) throw new Error('备份包不完整');
        progress({ files: count, entries: zip.entryCount, bytes: total });
        return files;
    } finally {
        const closed = once(zip, 'close'); zip.close(); await closed;
    }
}
