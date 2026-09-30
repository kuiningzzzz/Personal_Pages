import { readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { join, sep, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import ipaddr from 'ipaddr.js';
import { marked } from 'marked';
import { cardDb } from '../db.js';
import { publicRoot, localFile, rememberUpload } from '../upload-cleanup.js';
import { runPdf } from './pdf-process.js';

export function collectionTree(collectionId) {
    const root = cardDb.prepare("SELECT * FROM entries WHERE id = ? AND kind = 'resource' AND resource_kind = 'collection'").get(collectionId);
    if (!root) throw new Error('目标合集不存在或已不再是合集');
    const rows = cardDb.prepare("SELECT * FROM entries WHERE kind = 'resource'").all();
    const found = new Set([root.id]);
    let changed = true;
    while (changed) { changed = false; for (const row of rows) if (found.has(row.parent_id) && !found.has(row.id)) { found.add(row.id); changed = true; } }
    return rows.filter(row => found.has(row.id));
}

export function directory(collectionId) {
    return collectionTree(collectionId).map(row => ({ id: row.id, parent_id: row.id === collectionId ? null : row.parent_id,
        title: row.title, type: row.resource_kind, status: row.status, tags: JSON.parse(row.tags), summary: row.summary }));
}

export function localReferences(body = '') {
    const urls = new Set();
    marked.walkTokens(marked.lexer(body), token => {
        if (['image', 'link'].includes(token.type) && localFile(token.href)) urls.add(token.href);
        if (token.type === 'html') for (const match of token.text.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) if (localFile(match[1])) urls.add(match[1]);
    });
    return urls;
}

export function allowedUrls(task) {
    const urls = new Set(cardDb.prepare('SELECT url FROM ai_task_files WHERE task_id = ?').all(task.id).map(row => row.url));
    for (const row of collectionTree(task.collection_id)) {
        for (const url of localReferences(row.body + '\n' + row.summary)) urls.add(url);
        if (row.cover_image) urls.add(row.cover_image);
        for (const action of JSON.parse(row.actions)) urls.add(action.url);
        for (const image of cardDb.prepare('SELECT url FROM gallery_images WHERE entry_id = ?').all(row.id)) urls.add(image.url);
    }
    return urls;
}

export async function sourcePath(task, url) {
    if (!allowedUrls(task).has(url)) throw new Error('只能读取任务资料或目标合集内引用的文件');
    const local = localFile(url);
    if (!local || local.invalid) throw new Error('需要本地文件 URL；公网网址请使用 web_fetch');
    const path = await realpath(local.path);
    if (!path.startsWith(await realpath(publicRoot) + sep)) throw new Error('文件路径越界');
    return path;
}

export async function readSource(task, args, signal) {
    const path = await sourcePath(task, args.url);
    if (extname(path).toLowerCase() === '.pdf') {
        const result = await runPdf('read', path, { page: args.page, count: args.count }, { signal });
        return { url: args.url, ...result, hint: '图表、公式和扫描页请用 view_pdf_page 查看原图。继续读取时指定 page。' };
    }
    if (!['.txt', '.md', '.json', '.csv', '.log', '.yaml', '.yml', '.tex', '.js', '.py', '.cpp', '.c', '.h', '.sh'].includes(extname(path).toLowerCase())) throw new Error('此文件不能作为文本读取；图片请调用 view_image，PDF 使用 read_source');
    const bytes = await readFile(path);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('文本文件超过 10 MB');
    const text = bytes.toString('utf8');
    const offset = Math.max(0, Math.trunc(args.offset || 0));
    return { url: args.url, text: text.slice(offset, offset + 24000), offset, totalChars: text.length, nextOffset: offset + 24000 < text.length ? offset + 24000 : null };
}

export async function storeAsset(task, bytes, extension, name, role = 'derived') {
    const folder = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension) ? 'picture' : 'source';
    await mkdir(join(publicRoot, folder), { recursive: true });
    const url = `/${folder}/${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
    await writeFile(join(publicRoot, url.slice(1)), bytes);
    cardDb.transaction(() => {
        rememberUpload(url);
        cardDb.prepare('INSERT INTO ai_task_files (task_id,url,name,kind,role) VALUES (?,?,?,?,?)').run(task.id, url, name, extension === '.pdf' ? 'pdf' : folder === 'picture' ? 'image' : 'text', role);
    })();
    return url;
}

export async function pdfPage(task, args, signal) {
    const path = await sourcePath(task, args.url);
    if (extname(path).toLowerCase() !== '.pdf') throw new Error('请选择 PDF 文件');
    const pageNumber = Math.trunc(args.page || 1);
    const name = `${args.url} 第 ${pageNumber} 页`;
    const previous = cardDb.prepare("SELECT url FROM ai_task_files WHERE task_id = ? AND name = ? AND role = 'derived'").get(task.id, name);
    if (previous) return imageSource(task, previous);
    const { bytes } = await runPdf('render', path, { page: pageNumber }, { signal });
    signal?.throwIfAborted();
    const url = await storeAsset(task, bytes, '.png', name);
    return { url, name, mimeType: 'image/png', base64: bytes.toString('base64') };
}

export async function imageSource(task, args) {
    const path = await sourcePath(task, args.url);
    const bytes = await readFile(path);
    if (bytes.length > 24 * 1024 * 1024) throw new Error('图片过大，请上传小于 24 MB 的图片');
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mimeType = types[extname(path).toLowerCase()];
    if (!mimeType) throw new Error('图片格式支持 PNG、JPEG、GIF、WebP');
    return { url: args.url, name: args.name || args.url, mimeType, base64: bytes.toString('base64') };
}

// Resolve and pin each hop, so redirects and DNS changes cannot reach private services.
export async function downloadPublic(url, signal, redirects = 0) {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || redirects > 4) throw new Error('只支持公网 HTTP(S) 地址');
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => {
        const ip = ipaddr.process(address);
        return ip.range() !== 'unicast';
    })) throw new Error('不能访问本机、内网或特殊网络地址');
    const pinned = addresses[0];
    const result = await new Promise((resolveRequest, reject) => {
        const request = (parsed.protocol === 'https:' ? https : http).get(parsed, {
            signal, timeout: 60000, headers: { 'User-Agent': 'PersonalPages-Learning/1.0' },
            lookup: (_host, options, cb) => options.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family)
        }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) { response.resume(); resolveRequest({ redirect: new URL(response.headers.location, parsed).href }); return; }
            if (response.statusCode !== 200) { response.resume(); reject(new Error(`下载失败：HTTP ${response.statusCode}`)); return; }
            const chunks = []; let size = 0;
            response.on('data', chunk => { size += chunk.length; if (size > 50 * 1024 * 1024) request.destroy(new Error('下载文件超过 50 MB')); else chunks.push(chunk); });
            response.on('error', reject);
            response.on('end', () => resolveRequest({ bytes: Buffer.concat(chunks), mime: String(response.headers['content-type'] || '').split(';')[0], url: parsed.href }));
        });
        request.on('timeout', () => request.destroy(new Error('下载超时')));
        request.on('error', reject);
    });
    return result.redirect ? downloadPublic(result.redirect, signal, redirects + 1) : result;
}

export async function importAsset(task, args, signal) {
    const result = await downloadPublic(args.url, signal);
    const mimeTypes = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'text/plain': '.txt', 'text/markdown': '.md' };
    const extension = mimeTypes[result.mime];
    if (!extension) throw new Error('只能导入 PDF、常见图片或纯文本文件；网页内容请使用 web_fetch');
    if (extension === '.pdf' && !result.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('文件不是有效 PDF');
    const url = await storeAsset(task, result.bytes, extension, String(args.name || new URL(args.url).pathname.split('/').pop() || '联网资料').slice(0, 200), extension === '.pdf' ? 'input' : 'derived');
    return { url, bytes: result.bytes.length, originalUrl: result.url };
}
