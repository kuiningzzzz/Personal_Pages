import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = process.env.PUBLIC_DIR || (process.env.NODE_ENV === 'production' ? '/app/public' : join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public'));

function articleBody(link) {
    try {
        const path = new URL(String(link || ''), 'http://localhost').searchParams.get('src');
        if (!path?.startsWith('/articles/') || path.includes('..') || !path.endsWith('.md')) return '';
        return readFileSync(join(publicDir, path.slice(1)), 'utf8');
    } catch { return ''; }
}

export function migrateContentV2(db) {
    if (db.prepare('SELECT key FROM site_configs WHERE key = ?').get('content_v2_migrated')) return;
    const rows = db.prepare("SELECT type, data, created_at FROM card_configs WHERE type IN ('tutorials', 'projects') ORDER BY display_order, id").all();
    const types = Object.fromEntries(db.prepare('SELECT name, id FROM resource_types').all().map(row => [row.name, row.id]));
    const insert = db.prepare(`INSERT INTO entries (kind,title,summary,body,tags,resource_type_id,actions,status,published_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const now = new Date().toISOString();
    db.transaction(() => {
        if (!db.prepare('SELECT id FROM entries LIMIT 1').get()) {
            for (const row of rows) {
                let card;
                try { card = JSON.parse(row.data); } catch { continue; }
                if (!card.title) continue;
                const kind = row.type === 'tutorials' ? 'moment' : 'resource';
                const category = String(card.category || '').trim();
                const date = /^\d{4}-\d{2}-\d{2}$/.test(card.date || '') ? new Date(card.date) : null;
                const published = date && !Number.isNaN(date.getTime()) ? date.toISOString() : now;
                const body = articleBody(card.link) || String(card.desc || '');
                const actions = [];
                if (card.downloadUrl) actions.push({ label: 'Download', url: card.downloadUrl });
                if (card.repoUrl) actions.push({ label: 'Website', url: card.repoUrl });
                if (!body && /^https?:\/\//.test(card.link || '')) actions.push({ label: 'ReadMore', url: card.link });
                const typeId = kind === 'resource' ? (category === '我的项目' ? types['开源项目'] : types['工具']) : null;
                const status = String(card.date || '').includes('施工中') || String(card.title).includes('施工中') ? 'draft' : 'published';
                insert.run(kind, String(card.title), String(card.desc || ''), body, JSON.stringify(category ? [category] : []), typeId,
                    JSON.stringify(actions), status, published, now, now);
            }
        }
        db.prepare('INSERT INTO site_configs (key, data) VALUES (?, ?)').run('content_v2_migrated', JSON.stringify({ at: now, imported: rows.length }));
    })();
    console.log(`✓ 旧教程与项目迁移完成（找到 ${rows.length} 条）`);
}
