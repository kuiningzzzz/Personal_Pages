import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, lstat, stat, rename, rm, copyFile, access } from 'node:fs/promises';
import { join, resolve, relative, sep, basename, extname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Database from '../sqlite.js';
import { writeArchive, extractArchive, digest, safeName } from './archive.js';
import { snapshot, validateSnapshot, initializeBackupDb, overwrite, merge, neutralizeImportedJobs } from './database.js';
import { withMaintenance } from '../maintenance.js';
import { validIdentifier } from '../activities/package.js';

const PUBLIC_FOLDERS = ['articles', 'emoji', 'friend_avatar', 'picture', 'source'];
const protectedName = name => ['backups', 'card.sqlite', 'comment.sqlite', 'card.sqlite-wal', 'card.sqlite-shm', 'card.sqlite-journal', 'comment.sqlite-wal', 'comment.sqlite-shm', 'comment.sqlite-journal', 'restore-journal.json', 'restore-journal.json.tmp', '.env'].includes(name) || name.startsWith('.backup-');
const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function removeWithin(root, path) {
    if (!resolve(path).startsWith(resolve(root) + sep)) throw new Error('清理路径越界');
    await rm(path, { recursive: true, force: true });
}
async function walk(root, prefix = '') {
    if (!await exists(root)) return [];
    const files = [];
    for (const item of await readdir(root, { withFileTypes: true })) {
        const path = join(root, item.name), name = prefix ? `${prefix}/${item.name}` : item.name;
        safeName(name);
        // Refuse symlinks/junctions: backups must not follow paths outside these roots.
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error(`无法备份符号链接：${name}`);
        if (info.isDirectory()) files.push(...await walk(path, name));
        else if (info.isFile()) files.push({ name, path, size: info.size });
    }
    return files;
}
async function json(path, value) { await writeFile(path, JSON.stringify(value)); }
export function createBackupStore({ cardDb, commentDb, dataRoot, publicRoot, maintenance = withMaintenance, onRestored = () => {} }) {
    dataRoot = resolve(dataRoot); publicRoot = resolve(publicRoot);
    if (dataRoot === publicRoot || dataRoot.startsWith(publicRoot + sep)) throw new Error('数据库目录不能放在公开目录内');
    const publicDataFolder = publicRoot.startsWith(dataRoot + sep) ? relative(dataRoot, publicRoot).split(sep)[0] : null;
    const reservedData = name => protectedName(name) || name === publicDataFolder;
    const root = join(dataRoot, 'backups');
    initializeBackupDb(cardDb); initializeBackupDb(commentDb);
    let active = null, last = null;
    const jobView = () => active || last;
    const progress = message => { if (active) active.message = message; };
    async function list() {
        await mkdir(root, { recursive: true });
        const result = [];
        for (const name of await readdir(root)) if (/^[a-f0-9-]{36}\.json$/.test(name)) {
            try {
                const row = JSON.parse(await readFile(join(root, name), 'utf8'));
                if (row.id === name.slice(0, -5) && await exists(join(root, `${row.id}.zip`))) result.push(row);
            } catch { /* An incomplete metadata write is not a downloadable backup. */ }
        }
        return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    async function get(id) {
        if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('备份不存在');
        const row = (await list()).find(r => r.id === id);
        if (!row) throw new Error('备份不存在');
        return { ...row, path: join(root, `${id}.zip`) };
    }
    async function generate(work, reason = 'manual') {
        const id = randomUUID(), created_at = new Date().toISOString();
        progress('正在读取数据库与资源文件…');
        const card = snapshot(cardDb), comment = snapshot(commentDb);
        const files = [];
        await mkdir(work, { recursive: true });
        for (const [name, dump] of [['card', card], ['comment', comment]]) {
            const path = join(work, `${name}.json`); await json(path, dump);
            files.push({ name: `databases/${name}.json`, path, size: (await stat(path)).size });
        }
        for (const folder of PUBLIC_FOLDERS) files.push(...await walk(join(publicRoot, folder), `public/${folder}`));
        for (const name of await readdir(dataRoot)) if (!reservedData(name)) {
            const path = join(dataRoot, name), info = await lstat(path);
            if (info.isSymbolicLink()) throw new Error(`无法备份数据目录中的符号链接：${name}`);
            if (info.isDirectory()) files.push(...await walk(path, `data/${name}`));
            else if (info.isFile()) files.push({ name: `data/${name}`, path, size: info.size });
        }
        const names = new Set();
        for (const file of files) { const name = file.name.toLocaleLowerCase('en-US'); if (names.has(name)) throw new Error('存在仅大小写不同的文件名，无法生成跨平台备份'); names.add(name); }
        const inventory = [];
        for (let i = 0; i < files.length; i++) {
            progress(`正在校验备份文件 ${i + 1} / ${files.length}…`);
            inventory.push({ name: files[i].name, size: files[i].size, sha256: await digest(files[i].path) });
        }
        const manifest = { format: 'personal-pages-backup', version: 1, id, created_at, files: inventory };
        if (Buffer.byteLength(JSON.stringify(manifest)) > 16 * 1024 ** 2 || files.reduce((sum, f) => sum + f.size, 0) > 20 * 1024 ** 3) throw new Error('备份内容超过当前备份格式的容量限制');
        const manifestPath = join(work, 'manifest.json'); await json(manifestPath, manifest);
        await mkdir(root, { recursive: true });
        const temporary = join(root, `${id}.partial`), target = join(root, `${id}.zip`);
        try {
            await writeArchive(temporary, [{ name: 'manifest.json', path: manifestPath }, ...files], (done, total) => progress(`正在生成压缩包 ${done} / ${total}…`));
            await rename(temporary, target);
            const row = { id, created_at, name: `个人主页备份-${created_at.replace(/[:.]/g, '-')}.zip`, size: (await stat(target)).size,
                files: files.length, records: Object.values(card.tables).concat(Object.values(comment.tables)).reduce((n, rows) => n + rows.length, 0), reason };
            await json(join(root, `${id}.json.tmp`), row); await rename(join(root, `${id}.json.tmp`), join(root, `${id}.json`));
            return row;
        } catch (e) { await rm(temporary, { force: true }); await rm(target, { force: true }); throw e; }
    }
    async function validate(path, extracted) {
        progress('正在解压并校验上传的备份包…');
        const files = await extractArchive(path, extracted), info = files.get('manifest.json');
        if (!info || info.size > 16 * 1024 ** 2) throw new Error('缺少有效的备份清单');
        let manifest;
        try { manifest = JSON.parse(await readFile(info.path, 'utf8')); } catch { throw new Error('备份清单无法读取'); }
        if (manifest.format !== 'personal-pages-backup' || manifest.version !== 1 || !Array.isArray(manifest.files) || files.size !== manifest.files.length + 1) throw new Error('这不是本站生成的完整备份包');
        const seen = new Set();
        for (const item of manifest.files) {
            safeName(item.name);
            const parts = item.name.split('/');
            const allowed = item.name === 'databases/card.json' || item.name === 'databases/comment.json' ||
                (parts[0] === 'public' && PUBLIC_FOLDERS.includes(parts[1]) && parts.length >= 3) ||
                (parts[0] === 'data' && !reservedData(parts[1]) && parts.length >= 2);
            if (!allowed || seen.has(item.name)) throw new Error('备份包含未允许的文件'); seen.add(item.name);
            const file = files.get(item.name);
            if (!file || file.size !== item.size || file.sha256 !== item.sha256) throw new Error(`备份文件损坏：${item.name}`);
        }
        const dumps = {};
        for (const name of ['card', 'comment']) {
            const file = files.get(`databases/${name}.json`);
            if (!file || file.size > 512 * 1024 ** 2) throw new Error('备份数据库缺失或过大');
            try { dumps[name] = JSON.parse(await readFile(file.path, 'utf8')); } catch { throw new Error('备份数据库无法读取'); }
            validateSnapshot(name === 'card' ? cardDb : commentDb, dumps[name]);
        }
        return { manifest, files, dumps };
    }
    async function prepareDatabase(db, dump, destination, mode, rewrite) {
        // Clone the site's trusted schema, never execute schema/SQL from an uploaded package.
        db.prepare('VACUUM INTO ?').run(destination);
        const candidate = new Database(destination);
        let result;
        try {
            initializeBackupDb(candidate); candidate.exec('PRAGMA foreign_keys=OFF');
            candidate.transaction(() => { result = mode === 'overwrite' ? overwrite(candidate, dump) : merge(candidate, dump, rewrite); })();
            if (candidate.prepare('PRAGMA foreign_key_check').all().length || candidate.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('备份数据库关系或完整性校验失败');
            validateContent(candidate);
            return { dump: snapshot(candidate), result };
        } finally { candidate.close(); }
    }
    function validateContent(db) {
        if (!db.prepare("SELECT name FROM sqlite_master WHERE name='entries'").get()) return;
        const rows = db.prepare('SELECT id,parent_id,kind,resource_kind,resource_type_id,pinned FROM entries').all(), byId = new Map(rows.map(r => [r.id, r]));
        for (const row of rows) {
            const seen = new Set([row.id]); let parent = row.parent_id;
            while (parent) {
                const item = byId.get(parent);
                if (!item || item.kind !== 'resource' || item.resource_kind !== 'collection' || row.kind !== 'resource' || seen.has(parent) || item.resource_type_id !== row.resource_type_id) throw new Error('备份中的合集层级关系无效');
                seen.add(parent); parent = item.parent_id;
            }
        }
        if (rows.filter(r => r.kind === 'moment' && r.pinned).length > 5 || db.prepare('SELECT COUNT(*) AS n FROM announcements WHERE pinned=1').get().n > 2) throw new Error('备份中置顶内容超出限制');
        if (!db.prepare('SELECT id FROM profile WHERE id=1').get() || !db.prepare('SELECT id FROM home_welcome WHERE id=1').get()) throw new Error('备份缺少首页设置');
        if (db.prepare("SELECT name FROM sqlite_master WHERE name='plaza_items'").get()) {
            const items = db.prepare('SELECT * FROM plaza_items').all(), byId = new Map(items.map(row => [row.id, row]));
            const tags = new Set(db.prepare('SELECT id FROM plaza_tags').all().map(row => row.id));
            for (const row of items) {
                if (row.identifier !== null && !validIdentifier(row.identifier) || !Array.isArray(JSON.parse(row.tags)) || JSON.parse(row.tags).some(id => !tags.has(id))) throw new Error('备份中的活动标识或标签无效');
                const seen = new Set([row.id]); let parent = row.parent_id;
                while (parent) { const p = byId.get(parent); if (p?.kind !== 'collection' || seen.has(parent)) throw new Error('备份中的活动合集关系无效'); seen.add(parent); parent = p.parent_id; }
                for (const id of [row.preview_version_id, row.published_version_id].filter(Boolean)) if (db.prepare('SELECT item_id FROM plaza_versions WHERE id=?').get(id)?.item_id !== row.id) throw new Error('备份中的活动版本关系无效');
            }
            for (const row of db.prepare('SELECT id FROM plaza_versions').all()) if (!/^[a-f0-9-]{36}$/.test(row.id)) throw new Error('备份中的活动版本标识无效');
        }
    }
    function mappedId(maps, table, id) { return maps?.[table]?.get(JSON.stringify([Number(id)]))?.id ?? Number(id); }
    async function restore(upload, work, mode) {
        const extracted = join(work, 'extracted');
        const { files, dumps } = await validate(upload, extracted);
        neutralizeImportedJobs(dumps.card);
        const substitutions = new Map(), planned = [], dataConflicts = [];
        // Public/feedback names are shared by incoming rows. Plan collisions before inserting rows.
        for (const [name, file] of files) {
            if (!name.startsWith('public/') && !name.startsWith('data/')) continue;
            let target = name.startsWith('public/') ? join(publicRoot, name.slice(7)) : join(dataRoot, name.slice(5));
            let destination = name;
            if (mode === 'merge' && await exists(target) && await digest(target) !== file.sha256) {
                if (name.startsWith('public/') || name.startsWith('data/feedback/')) {
                    const extension = extname(name), renamed = `${basename(name, extension)}-import-${file.sha256.slice(0, 12)}${extension}`;
                    destination = `${name.slice(0, name.lastIndexOf('/') + 1)}${renamed}`;
                    substitutions.set(name.startsWith('public/') ? `/${name.slice(7)}` : basename(name), name.startsWith('public/') ? `/${destination.slice(7)}` : renamed);
                } else dataConflicts.push(name);
            }
            planned.push({ source: file.path, name: destination, original: name, sha256: file.sha256 });
        }
        let entryMaps;
        const rewrite = (value, maps, table, column) => {
            for (const [from, to] of substitutions) { value = value.replaceAll(from, to).replaceAll(encodeURI(from), encodeURI(to)); }
            value = value.replace(/(\/(?:entry|resource\/(?:collection|gallery))\/)(\d+)(?=[/#?"\s)]|$)/g, (_, prefix, id) => prefix + mappedId(maps, 'entries', id));
            value = value.replace(/(\/activities\/(?:play|collection)\/)(\d+)(?=[/#?"\s)]|$)/g, (_, prefix, id) => prefix + mappedId(maps, 'plaza_items', id));
            if (table === 'ai_collection_sessions' && (column === 'session_id' || column === 'previous_session_id')) value = value.replace(/learning-collection-(\d+)/g, (_, id) => `learning-collection-${mappedId(maps, 'entries', id)}`);
            return value;
        };
        progress('正在检查数据库关系并准备还原内容…');
        const card = await prepareDatabase(cardDb, dumps.card, join(work, 'card.sqlite'), mode, rewrite);
        entryMaps = card.result?.maps;
        const comment = await prepareDatabase(commentDb, dumps.comment, join(work, 'comment.sqlite'), mode, rewrite);
        const install = join(work, 'install'); await mkdir(install, { recursive: true });
        let importedFiles = 0, skippedFiles = 0;
        for (const file of planned) {
            let name = file.name;
            let text;
            if (mode === 'merge') {
                name = name.replace(/^data\/activities\/external-(\d+)\//, (_, id) => `data/activities/external-${mappedId(entryMaps, 'plaza_items', id)}/`);
                name = name.replace(/^(data\/activities\/[^/]+\/storage\/users\/)user-(\d+)\//, (_, prefix, id) => `${prefix}user-${mappedId(entryMaps, 'users', id)}/`);
                name = name.replace(/^data\/ai\/collections\/(\d+)\//, (_, id) => `data/ai/collections/${mappedId(entryMaps, 'entries', id)}/`);
                name = name.replace(/learning-collection-(\d+)/g, (_, id) => `learning-collection-${mappedId(entryMaps, 'entries', id)}`);
                if (name.startsWith('data/ai/') && /\.(jsonl?|md|txt)$/i.test(name) && (await stat(file.source)).size < 20 * 1024 ** 2) {
                    text = rewrite(await readFile(file.source, 'utf8'), entryMaps);
                    text = text.replace(/learning-collection-(\d+)/g, (_, id) => `learning-collection-${mappedId(entryMaps, 'entries', id)}`)
                        .replace(/(ai(?:\/|\\\\)collections(?:\/|\\\\))(\d+)/g, (_, prefix, id) => prefix + mappedId(entryMaps, 'entries', id));
                }
                const target = name.startsWith('public/') ? join(publicRoot, name.slice(7)) : join(dataRoot, name.slice(5));
                if (await exists(target)) {
                    const incomingHash = text === undefined ? file.sha256 : createHash('sha256').update(text).digest('hex');
                    if (await digest(target) !== incomingHash && !name.startsWith('public/') && !name.startsWith('data/feedback/')) {
                        // Retain the incoming version without replacing a current native harness file.
                        name = `data/ai/imported/${files.get('manifest.json').sha256.slice(0, 12)}/${file.original.slice(5)}`;
                        const retained = join(dataRoot, name.slice(5));
                        if (await exists(retained)) { skippedFiles++; continue; }
                    } else { skippedFiles++; continue; }
                }
            }
            const target = join(install, name); await mkdir(join(target, '..'), { recursive: true });
            if (text === undefined) await copyFile(file.source, target); else await writeFile(target, text);
            importedFiles++;
        }
        progress('正在生成还原前的自动备份…');
        const safety = await generate(join(work, 'safety'), 'before-restore');
        progress('校验完成，正在应用还原…');
        const moves = [], rollback = join(work, 'rollback'); await mkdir(rollback);
        const additions = [];
        // Every operation is journaled before mutation; startup can finish rollback after a crash.
        const journal = { id: active?.id || randomUUID(), work, moves, additions };
        const journalPath = join(dataRoot, 'restore-journal.json');
        async function saveJournal() { await json(`${journalPath}.tmp`, journal); await rename(`${journalPath}.tmp`, journalPath); }
        async function planTree(target, incoming) {
            const old = join(rollback, String(moves.length));
            moves.push({ target, incoming, old, existed: await exists(target) });
        }
        try {
            if (mode === 'overwrite') {
                // Keep directory inodes: Nginx may bind-mount each public folder in Docker.
                for (const folder of PUBLIC_FOLDERS) {
                    const live = join(publicRoot, folder), incoming = join(install, 'public', folder);
                    await mkdir(live, { recursive: true });
                    const children = new Set([...(await readdir(live)), ...(await exists(incoming) ? await readdir(incoming) : [])]);
                    for (const name of children) await planTree(join(live, name), join(incoming, name));
                }
                const names = new Set([...(await readdir(dataRoot)).filter(n => !reservedData(n) && n !== 'restore-journal.json.tmp'), ...(await exists(join(install, 'data')) ? await readdir(join(install, 'data')) : [])]);
                for (const name of names) await planTree(join(dataRoot, name), join(install, 'data', name));
                await saveJournal();
                for (const { target, incoming, old, existed } of moves) {
                    if (existed) await rename(target, old);
                    if (await exists(incoming)) { await mkdir(join(target, '..'), { recursive: true }); await rename(incoming, target); }
                }
            } else {
                const installFiles = await walk(install);
                for (const file of installFiles) {
                    const target = file.name.startsWith('public/') ? join(publicRoot, file.name.slice(7)) : join(dataRoot, file.name.slice(5));
                    if (await exists(target)) throw new Error('导入文件在准备过程中发生冲突，请重试');
                    additions.push(target);
                }
                await saveJournal();
                for (let i = 0; i < installFiles.length; i++) { const target = additions[i]; await mkdir(join(target, '..'), { recursive: true }); await rename(installFiles[i].path, target); }
            }
            // SQLite's rollback journal commits both databases together through ATTACH.
            cardDb.prepare('ATTACH DATABASE ? AS backup_comments').run(join(dataRoot, 'comment.sqlite'));
            cardDb.exec('PRAGMA foreign_keys=OFF');
            try {
                cardDb.transaction(() => {
                    overwrite(cardDb, card.dump); overwrite(cardDb, comment.dump, 'backup_comments');
                    if (cardDb.prepare('PRAGMA foreign_key_check').all().length || cardDb.prepare('PRAGMA backup_comments.foreign_key_check').all().length) throw new Error('还原后数据关系校验失败');
                    cardDb.prepare("INSERT INTO backup_state VALUES('restore',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(journal.id);
                })();
            } finally { cardDb.exec('PRAGMA foreign_keys=ON'); cardDb.exec('DETACH DATABASE backup_comments'); }
            await rm(journalPath, { force: true });
        } catch (cause) {
            // If COMMIT succeeded, do not roll the files back merely because DETACH/cleanup failed.
            if (cardDb.prepare("SELECT value FROM backup_state WHERE key='restore'").get()?.value !== journal.id) await rollbackJournal(journal, dataRoot, publicRoot);
            await rm(journalPath, { force: true }); throw cause;
        }
        onRestored();
        return { mode, importedRecords: mode === 'merge' ? card.result.count + comment.result.count : Object.values(card.dump.tables).concat(Object.values(comment.dump.tables)).reduce((n, rows) => n + rows.length, 0), importedFiles, skippedFiles,
            safetyBackup: safety.id, retainedWorkspaceConflicts: dataConflicts.length, message: mode === 'merge' ? '增量导入完成，当前内容已保留' : '覆盖还原完成' };
    }
    function start(kind, operation, cleanup) {
        if (active) throw new Error('另一个备份或还原任务正在进行');
        const job = active = { id: randomUUID(), kind, status: 'running', message: '正在准备…', started_at: new Date().toISOString() };
        // Keep the response short; long-running compression/validation is observed by polling.
        setImmediate(async () => {
            const work = join(dataRoot, `.backup-${job.id}`);
            try { job.result = await maintenance(async () => { await mkdir(work, { recursive: true }); return await operation(work); }); job.status = 'completed'; job.message = job.result.message || '备份包已生成'; }
            catch (e) { job.status = 'failed'; job.message = e.message || '备份操作失败'; }
            finally {
                job.finished_at = new Date().toISOString(); last = job; active = null;
                if (!await exists(join(dataRoot, 'restore-journal.json'))) await removeWithin(dataRoot, work).catch(() => {});
                try { await cleanup?.(); } catch { /* An upload cleanup failure must not crash the server. */ }
            }
        });
        return job;
    }
    return {
        list, get, jobView,
        generate: () => start('generate', work => generate(work)),
        restore: (path, mode, cleanup) => { if (!['overwrite', 'merge'].includes(mode)) throw new Error('请选择覆盖导入或增量导入'); return start('restore', work => restore(path, work, mode), cleanup); },
        async delete(id) { if (active) throw new Error('请等待当前备份操作完成'); await get(id); await rm(join(root, `${id}.zip`), { force: true }); await rm(join(root, `${id}.json`), { force: true }); },
        busy: () => !!active,
        uploadDirectory: join(root, 'uploads')
    };
}
async function rollbackJournal(journal, dataRoot, publicRoot) {
    for (const target of journal.additions.reverse()) {
        const root = resolve(target).startsWith(resolve(publicRoot) + sep) ? publicRoot : dataRoot;
        await removeWithin(root, target);
    }
    for (const item of journal.moves.reverse()) {
        const root = resolve(item.target).startsWith(resolve(publicRoot) + sep) ? publicRoot : dataRoot;
        if (!resolve(item.old).startsWith(resolve(journal.work) + sep) || !resolve(item.target).startsWith(resolve(root) + sep)) throw new Error('还原恢复路径无效');
        if (await exists(item.old)) { await removeWithin(root, item.target); await rename(item.old, item.target); }
        else if (!item.existed) await removeWithin(root, item.target);
    }
}
// Called before the application's databases are opened and migrations run.
export async function recoverRestore(dataRoot, publicRoot) {
    dataRoot = resolve(dataRoot); publicRoot = resolve(publicRoot);
    const path = join(dataRoot, 'restore-journal.json');
    if (!await exists(path)) return;
    const journal = JSON.parse(await readFile(path, 'utf8'));
    if (!resolve(journal.work).startsWith(dataRoot + sep + '.backup-')) throw new Error('还原恢复目录无效');
    const connection = new DatabaseSync(join(dataRoot, 'card.sqlite'));
    let committed = false;
    try { if (connection.prepare("SELECT name FROM sqlite_master WHERE name='backup_state'").get()) committed = connection.prepare("SELECT value FROM backup_state WHERE key='restore'").get()?.value === journal.id; }
    finally { connection.close(); }
    if (!committed) await rollbackJournal(journal, dataRoot, publicRoot);
    await rm(path, { force: true }); await removeWithin(dataRoot, journal.work);
}
