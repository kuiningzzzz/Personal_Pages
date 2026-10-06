import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export function storageName(key) {
    if (typeof key !== 'string' || !key || key.length > 100) throw new Error('存档键需为 1～100 字');
    return `${createHash('sha256').update(key).digest('hex')}.json`;
}
export async function readJsonRecord(folder, key) {
    try {
        const raw = await readFile(join(folder, storageName(key))), record = JSON.parse(raw.toString('utf8'));
        return { value: record.value ?? null, revision: record.revision || createHash('sha256').update(raw).digest('hex') };
    } catch (error) { if (error.code === 'ENOENT') return { value: null, revision: null }; throw error; }
}
function conflict() { const error = new Error('存档已被其他页面更新，请重新读取后再保存'); error.status = 409; throw error; }
export async function writeJsonRecord(folder, key, value, options = {}) {
    const name = storageName(key);
    const compare = Object.hasOwn(options, 'expectedRevision');
    if (compare && options.expectedRevision !== null && (typeof options.expectedRevision !== 'string' || options.expectedRevision.length > 100)) throw new Error('存档版本标识无效');
    if (compare && (await readJsonRecord(folder, key)).revision !== options.expectedRevision) conflict();
    if (options.remove) { await rm(join(folder, name), { force: true }); return { value: null, revision: null }; }
    const record = { key, value: value ?? null, revision: randomUUID() }, bytes = Buffer.from(JSON.stringify(record));
    if (bytes.length > 512 * 1024) throw new Error('单份存档最多 512KB');
    await mkdir(folder, { recursive: true });
    const names = await readdir(folder), maxFiles = options.maxFiles || 200, maxBytes = options.maxBytes || 20 * 1024 ** 2;
    if (names.length >= maxFiles && !names.includes(name)) throw new Error('存档文件数量已达上限');
    let total = bytes.length;
    for (const entry of names) if (entry !== name) total += (await stat(join(folder, entry))).size;
    if (total > maxBytes) throw new Error('活动存储空间已满');
    const path = join(folder, name), temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, bytes); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
    return { value: record.value, revision: record.revision };
}
export async function listJsonRecords(folder, { prefix = '', cursor = '', limit = 50 } = {}) {
    if (typeof prefix !== 'string' || prefix.length > 100 || typeof cursor !== 'string' || cursor.length > 100 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('共享空间分页参数无效');
    let files;
    try { files = await readdir(folder, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return { entries: [], cursor: null }; throw error; }
    const records = [];
    for (const file of files) if (file.isFile() && /^[a-f0-9]{64}\.json$/.test(file.name)) {
        const raw = await readFile(join(folder, file.name)), record = JSON.parse(raw.toString('utf8'));
        if (typeof record.key === 'string' && record.key.startsWith(prefix) && record.key > cursor) records.push({ key: record.key, value: record.value ?? null, revision: record.revision || createHash('sha256').update(raw).digest('hex') });
    }
    records.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const entries = []; let bytes = 0;
    for (const record of records) {
        const size = Buffer.byteLength(JSON.stringify(record));
        if (entries.length >= limit || entries.length && bytes + size > 768 * 1024) break;
        entries.push(record); bytes += size;
    }
    return { entries, cursor: entries.length < records.length ? entries.at(-1).key : null };
}
