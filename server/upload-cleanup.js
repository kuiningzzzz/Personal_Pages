import { existsSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { cardDb } from './db.js';

export const publicRoot = process.env.PUBLIC_DIR || (process.env.NODE_ENV === 'production'
    ? '/app/public' : join(dirname(fileURLToPath(import.meta.url)), '..', 'public'));

const uploadName = /^\d{13}-[a-f0-9]{16}(?:\.[a-z0-9]{1,11})?$/;
const folders = ['picture', 'source'];

// Files uploaded by earlier versions have the same generated name. Adopt them at startup,
// before requests can create new uploads, so they are included in the first save's sweep.
for (const folder of folders) {
    const directory = join(publicRoot, folder);
    if (!existsSync(directory) || !lstatSync(directory).isDirectory()) continue;
    for (const name of readdirSync(directory)) {
        if (!uploadName.test(name)) continue;
        const path = join(directory, name);
        if (!lstatSync(path).isFile()) continue;
        cardDb.prepare('INSERT OR IGNORE INTO managed_uploads (url) VALUES (?)').run(`/${folder}/${name}`);
    }
}

export function rememberUpload(url) {
    cardDb.prepare('INSERT OR IGNORE INTO managed_uploads (url) VALUES (?)').run(url);
}

function localFile(raw) {
    const value = String(raw || '').trim();
    if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;
    let pathname;
    try { pathname = decodeURIComponent(new URL(value, 'http://local.invalid/').pathname); }
    catch { return { invalid: true }; }
    const parts = pathname.split('/').filter(Boolean);
    if (!folders.includes(parts[0])) return null;
    const path = resolve(publicRoot, `.${pathname}`);
    const boundary = resolve(publicRoot) + sep;
    if (!path.startsWith(boundary) || parts.some(part => part === '..')) return { invalid: true };
    return { url: pathname, path };
}

export function auditAndCleanupUploads() {
    const used = new Set();
    const warnings = [];
    const inspect = (raw, place, required = false) => {
        if (!String(raw || '').trim()) {
            if (required) warnings.push(`${place}：Markdown 链接或图片的地址为空`);
            return;
        }
        const local = localFile(raw);
        if (!local) return;
        if (local.invalid) { warnings.push(`${place}：本地文件地址无效（${raw}）`); return; }
        used.add(local.url);
        if (!existsSync(local.path)) warnings.push(`${place}：本地文件不存在（${local.url}）`);
    };
    const markdown = (source, place) => {
        const tokens = marked.lexer(source || '');
        marked.walkTokens(tokens, token => {
            if (token.type === 'link' || token.type === 'image') inspect(token.href, place, true);
        });
    };

    const profile = cardDb.prepare('SELECT avatar, description FROM profile WHERE id = 1').get();
    if (profile) { inspect(profile.avatar, '首页头像'); markdown(profile.description, '首页描述'); }
    for (const card of cardDb.prepare('SELECT title, content FROM home_cards').all()) markdown(card.content, `首页卡片「${card.title}」`);
    for (const row of cardDb.prepare('SELECT id, title, summary, cover_image, body, actions FROM entries').all()) {
        const place = `帖子「${row.title || `#${row.id}`}」`;
        inspect(row.cover_image, `${place}封面`);
        markdown(row.summary, `${place}摘要`);
        markdown(row.body, `${place}正文`);
        for (const action of JSON.parse(row.actions || '[]')) inspect(action.url, `${place}按钮「${action.label}」`);
    }
    for (const image of cardDb.prepare('SELECT g.url, g.display_order, e.title FROM gallery_images g JOIN entries e ON e.id = g.entry_id').all()) {
        inspect(image.url, `图集「${image.title}」第 ${image.display_order + 1} 张图片`, true);
    }
    const settings = cardDb.prepare("SELECT data FROM site_configs WHERE key = 'page_settings'").get();
    if (settings) for (const [key, value] of Object.entries(JSON.parse(settings.data))) markdown(value, `站点文案「${key}」`);

    let deletedFiles = 0;
    for (const { url } of cardDb.prepare('SELECT url FROM managed_uploads').all()) {
        const local = localFile(url);
        if (!local || local.invalid || used.has(local.url)) continue;
        // The registry only records direct files in the two upload folders.
        const directory = join(publicRoot, url.split('/')[1] || '');
        if (!folders.includes(url.split('/')[1]) || url.split('/').length !== 3 ||
            !existsSync(directory) || !lstatSync(directory).isDirectory()) continue;
        try {
            if (existsSync(local.path)) {
                if (!lstatSync(local.path).isFile()) continue;
                unlinkSync(local.path);
                deletedFiles += 1;
            }
            cardDb.prepare('DELETE FROM managed_uploads WHERE url = ?').run(url);
        } catch (error) {
            warnings.push(`无法清理未引用文件 ${url}：${error.message}`);
        }
    }
    return { warnings, deletedFiles };
}
