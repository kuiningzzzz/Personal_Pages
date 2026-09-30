import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { cardDb } from '../db.js';
import { publicRoot, auditAndCleanupUploads, localFile } from '../upload-cleanup.js';
import { publicAncestors } from '../resource-structure.js';
import { collectionTree, directory, localReferences, allowedUrls, readSource, imageSource, pdfPage, importAsset } from './sources.js';
import { MODEL, HARNESS_VERSION, budgetReminder } from './prompt.js';

const dataRoot = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const taskRoot = join(dataRoot, 'ai');
let active = null;
let stopping = false;
export const taskStopping = id => active?.id === id && getTask(id)?.status !== 'running';
const now = () => new Date().toISOString();
export const getTask = id => cardDb.prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id);
export const settings = () => JSON.parse(cardDb.prepare("SELECT data FROM site_configs WHERE key = 'ai_learning'").get().data);
export function event(id, kind, message, data = {}) {
    cardDb.prepare('INSERT INTO ai_task_events (task_id,kind,message,data,created_at) VALUES (?,?,?,?,?)').run(id, kind, String(message).slice(0, 20000), JSON.stringify(data), now());
}
export function taskView(task, detailed = false) {
    if (!task) return null;
    const row = { ...task, links: JSON.parse(task.links), settings: JSON.parse(task.settings), usage: JSON.parse(task.usage),
        collection_title: cardDb.prepare('SELECT title FROM entries WHERE id = ?').get(task.collection_id)?.title || '合集已删除', stopping: taskStopping(task.id),
        files: cardDb.prepare('SELECT id,url,name,kind,role FROM ai_task_files WHERE task_id = ?').all(task.id) };
    if (detailed) {
        row.draft = JSON.parse(task.draft);
        row.events = cardDb.prepare('SELECT * FROM ai_task_events WHERE task_id = ? ORDER BY id DESC LIMIT 300').all(task.id).reverse().map(item => ({ ...item, data: JSON.parse(item.data) }));
    } else { delete row.draft; delete row.prompt; }
    return row;
}
function destination(id, requirePublic = false) {
    const root = collectionTree(id).find(row => row.id === id);
    if (requirePublic && (root.status !== 'published' || !publicAncestors(root))) throw new Error('目标合集及其所有上级合集必须已发布，才能直接公开报告');
    return root;
}
export function createTask(input, files) {
    const collectionId = Number(input.collection_id);
    destination(collectionId, true);
    const links = (Array.isArray(input.links) ? input.links : String(input.links || '').split(/\r?\n/)).map(value => String(value).trim()).filter(Boolean);
    if (links.length > 20 || links.some(value => { try { const u = new URL(value); return !['http:', 'https:'].includes(u.protocol) || !!u.username || !!u.password; } catch { return true; } })) throw new Error('链接必须是有效的 HTTP(S) 地址，最多 20 条');
    const prompt = String(input.prompt || '').trim();
    if (prompt.length > 20000) throw new Error('学习要求最多 20000 字');
    if (!prompt && !links.length && !files.length) throw new Error('请提供资料文件、链接或学习要求');
    const id = randomUUID();
    cardDb.transaction(() => {
        cardDb.prepare('INSERT INTO ai_tasks (id,title,prompt,links,collection_id,settings,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
            .run(id, String(input.title || '学习报告').trim().slice(0, 200), prompt, JSON.stringify(links), collectionId, JSON.stringify(settings()), now(), now());
        for (const file of files) cardDb.prepare('INSERT INTO ai_task_files (task_id,url,name,kind) VALUES (?,?,?,?)').run(id, file.url, file.name, file.kind);
        event(id, 'queued', '任务已加入队列，源资料已保护');
    })();
    setImmediate(pump);
    return taskView(getTask(id), true);
}

function sourceHeader(id) {
    const pdfs = cardDb.prepare("SELECT DISTINCT url,name FROM ai_task_files WHERE task_id = ? AND kind = 'pdf' AND role = 'input'").all(id);
    return pdfs.length ? '学习源资料：' + pdfs.map(file => `[${file.name.replace(/[\[\]\\\r\n]/g, '_')}](${file.url})`).join(' · ') + '\n\n---\n\n' : '';
}
function insertReport(task, draft, status) {
    const date = now();
    const root = destination(task.collection_id, status === 'published');
    const result = cardDb.prepare(`INSERT INTO entries (kind,format,resource_kind,parent_id,title,summary,body,tags,actions,status,resource_type_id,published_at,created_at,updated_at)
        VALUES ('resource','article','document',?,?,?,?,?,?,?,?,?,?,?)`).run(root.id, draft.title, draft.summary || '', sourceHeader(task.id) + draft.body,
            JSON.stringify(draft.tags || []), JSON.stringify(draft.actions || []), status, root.resource_type_id, date, date, date);
    return Number(result.lastInsertRowid);
}
export function failTask(id, reason, status = 'failed') {
    const task = getTask(id);
    if (!task || !['queued', 'running'].includes(task.status)) return;
    const draft = JSON.parse(task.draft);
    const failure = { title: `${task.title} · ${status === 'cancelled' ? '已取消' : '生成失败'}`, summary: String(reason).slice(0, 1000), tags: ['AI学习', '任务异常'],
        body: `# ${status === 'cancelled' ? '学习任务已取消' : '学习报告生成失败'}\n\n${reason}\n\n主模型迭代：${task.iterations} / ${task.budget}（总上限 48）。\n\n${draft.body ? '## 已保存的未完成内容\n\n' + draft.body : '尚未保存报告正文。'}` };
    mkdirSync(join(taskRoot, id), { recursive: true });
    writeFileSync(join(taskRoot, id, 'error.md'), sourceHeader(id) + failure.body, 'utf8');
    cardDb.transaction(() => {
        let resultId = null;
        try { resultId = insertReport(task, failure, 'draft'); } catch { /* Deleted destination: error.md remains downloadable in Admin. */ }
        cardDb.prepare('UPDATE ai_tasks SET status=?,error=?,result_entry_id=?,updated_at=? WHERE id=?').run(status, String(reason).slice(0, 2000), resultId, now(), id);
        event(id, status, reason);
    })();
}

export async function dispatch(id, method, args = {}, signal) {
    const task = getTask(id);
    if (!task || task.status !== 'running') throw new Error('任务已结束');
    if (method === 'step') {
        if (task.iterations >= task.budget) { failTask(id, '迭代次数用尽，未成功调用 extend_budget 或 submit_document'); return { stop: true }; }
        const iterations = task.iterations + 1;
        cardDb.prepare('UPDATE ai_tasks SET iterations=?,updated_at=? WHERE id=?').run(iterations, now(), id);
        event(id, 'step', `第 ${iterations} 次迭代 / 当前预算 ${task.budget}`);
        return { iterations, budget: task.budget, reminder: iterations === task.budget ? budgetReminder(task.budget) : '' };
    }
    event(id, 'tool', method, { ...args, body: args.body ? `[${args.body.length} 字正文]` : undefined });
    switch (method) {
        case 'list_collection': return directory(task.collection_id);
        case 'search_collection': {
            const query = String(args.query || '').toLocaleLowerCase();
            return collectionTree(task.collection_id).filter(row => `${row.title} ${row.tags} ${row.body}`.toLocaleLowerCase().includes(query)).map(row => ({ id: row.id, title: row.title, status: row.status, summary: row.summary }));
        }
        case 'read_resource': {
            const row = collectionTree(task.collection_id).find(item => item.id === Number(args.id));
            if (!row) throw new Error('该内容不属于目标合集');
            const offset = Math.max(0, Math.trunc(args.offset || 0));
            return { ...row, tags: JSON.parse(row.tags), actions: JSON.parse(row.actions), body: row.body.slice(offset, offset + 24000),
                nextOffset: offset + 24000 < row.body.length ? offset + 24000 : null,
                images: cardDb.prepare('SELECT url,caption FROM gallery_images WHERE entry_id = ? ORDER BY display_order,id').all(row.id) };
        }
        case 'read_source': return readSource(task, args, signal);
        case 'view_image': return imageSource(task, args);
        case 'view_pdf_page': return pdfPage(task, args, signal);
        case 'import_asset': return importAsset(task, args, signal);
        case 'write_document': {
            if (!String(args.title || '').trim() || !String(args.body || '').trim()) throw new Error('报告标题和正文不能为空');
            if (args.body.length > 100000) throw new Error('正文最多 100000 字，请精简后保存');
            const draft = { title: args.title.trim().slice(0, 200), body: args.body, summary: String(args.summary || '').slice(0, 1000),
                tags: [...new Set((args.tags || []).map(item => String(item).trim().slice(0, 40)).filter(Boolean))].slice(0, 20),
                actions: (args.actions || []).map(action => ({ label: String(action.label || '').slice(0, 30), url: String(action.url || '') })).slice(0, 6) };
            if (draft.actions.some(action => !action.label || !/^(https?:\/\/|\/[^/])/i.test(action.url))) throw new Error('按钮需要文字及有效 URL');
            cardDb.prepare('UPDATE ai_tasks SET draft=?,updated_at=? WHERE id=?').run(JSON.stringify(draft), now(), id);
            return { saved: true, title: draft.title, characters: draft.body.length };
        }
        case 'read_document': return JSON.parse(task.draft);
        case 'extend_budget': {
            if (task.budget >= 48) throw new Error('已达到 48 次总上限，请提交报告');
            const budget = Math.min(48, task.budget + 8);
            cardDb.prepare('UPDATE ai_tasks SET budget=?,updated_at=? WHERE id=?').run(budget, now(), id);
            event(id, 'budget', `已增加 8 次迭代，当前预算 ${budget}`);
            return { budget, remaining: budget - task.iterations };
        }
        case 'submit_document': {
            const draft = JSON.parse(task.draft);
            if (!draft.body || !draft.title) throw new Error('请先用 write_document 保存完整报告');
            let emptyLink = false;
            marked.walkTokens(marked.lexer(draft.body), token => { if (['link','image'].includes(token.type) && !String(token.href || '').trim()) emptyLink = true; });
            if (emptyLink) throw new Error('报告包含地址为空的 Markdown 链接或图片，请修正后再提交');
            const permitted = allowedUrls(task);
            const refs = new Set([...localReferences(draft.body), ...(draft.actions || []).map(action => action.url), ...cardDb.prepare("SELECT url FROM ai_task_files WHERE task_id=? AND kind='pdf' AND role='input'").all(id).map(file => file.url)]);
            for (const url of refs) {
                const local = localFile(url);
                if (!local) continue;
                if (!permitted.has(url)) throw new Error(`本地链接不属于任务资料或目标合集：${url}`);
                if (local.invalid) throw new Error(`本地链接无效：${url}`);
                const { access } = await import('node:fs/promises');
                try { await access(local.path); } catch { throw new Error(`本地文件不存在：${url}`); }
            }
            // Idempotent transaction: retries after an uncertain response cannot publish duplicates.
            const entryId = cardDb.transaction(() => {
                const current = getTask(id);
                if (current.status === 'published') return current.result_entry_id;
                if (current.status !== 'running') throw new Error('任务已结束');
                const entryId = insertReport(current, draft, 'published');
                cardDb.prepare("UPDATE ai_tasks SET status='published',result_entry_id=?,updated_at=? WHERE id=?").run(entryId, now(), id);
                event(id, 'published', '报告已公开发布', { entryId });
                return entryId;
            })();
            auditAndCleanupUploads();
            return { submitted: true, entryId, url: `/entry/${entryId}` };
        }
        default: throw new Error('未知学习工具');
    }
}

export function cancelTask(id) {
    const task = getTask(id);
    if (!task || !['queued', 'running'].includes(task.status)) throw new Error('只有排队或运行中的任务可以取消');
    failTask(id, '管理员取消了任务', 'cancelled');
    if (active?.id === id) {
        active.controller.abort();
        if (active.child.connected) active.child.send({ type: 'cancel' });
    }
}

export function retryTask(id) {
    const task = getTask(id);
    if (!task || !['failed', 'cancelled'].includes(task.status)) throw new Error('只有失败或取消的任务可以重试');
    if (active?.id === id) throw new Error('任务正在停止，请稍后重试');
    destination(task.collection_id, true);
    cardDb.prepare("UPDATE ai_tasks SET status='queued',iterations=0,budget=16,error='',result_entry_id=NULL,settings=?,usage='{}',updated_at=? WHERE id=?").run(JSON.stringify(settings()), now(), id);
    event(id, 'queued', '重新开始学习，保留源资料和已保存草稿');
    setImmediate(pump);
}

async function pump() {
    if (active || stopping) return;
    const task = cardDb.prepare("SELECT * FROM ai_tasks WHERE status='queued' ORDER BY created_at LIMIT 1").get();
    if (!task) return;
    if (!process.env.DEEPSEEK_API_KEY) { failTask(task.id, '服务器根目录 .env 中未配置 DEEPSEEK_API_KEY'); setImmediate(pump); return; }
    cardDb.prepare("UPDATE ai_tasks SET status='running',updated_at=? WHERE id=?").run(now(), task.id);
    event(task.id, 'running', `启动 DeepSeek Harness ${HARNESS_VERSION} / ${MODEL}`);
    mkdirSync(join(taskRoot, task.id), { recursive: true });
    const childEnv = Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    childEnv.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    const child = fork(fileURLToPath(new URL('./worker.js', import.meta.url)), [], { env: childEnv, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const controller = new AbortController();
    active = { id: task.id, child, controller };
    const timeout = setTimeout(() => { failTask(task.id, '学习任务超过设定时间上限'); controller.abort(); if (child.connected) child.send({ type: 'cancel' }); }, JSON.parse(task.settings).taskTimeoutMinutes * 60000);
    child.on('message', async message => {
        if (message.type === 'rpc') {
            try { const value = await dispatch(task.id, message.method, message.args, controller.signal); if (child.connected) child.send({ type: 'reply', requestId: message.requestId, value }); }
            catch (error) { if (child.connected) child.send({ type: 'reply', requestId: message.requestId, error: error.message }); }
        } else if (message.type === 'event') {
            if (getTask(task.id)?.status === 'running') event(task.id, message.kind, message.message, message.data);
        } else if (message.type === 'usage') {
            if (getTask(task.id)) cardDb.prepare('UPDATE ai_tasks SET usage=? WHERE id=?').run(JSON.stringify(message.usage), task.id);
        } else if (message.type === 'error') failTask(task.id, message.message);
    });
    let diagnostics = '';
    child.stderr.on('data', bytes => { diagnostics = (diagnostics + bytes.toString()).replaceAll(process.env.DEEPSEEK_API_KEY, '[redacted]').slice(-4000); });
    child.on('error', error => failTask(task.id, error.message));
    child.on('exit', () => {
        clearTimeout(timeout); controller.abort();
        failTask(task.id, diagnostics || 'Agent 已结束但未成功提交报告');
        active = null; setImmediate(pump);
    });
    child.send({ type: 'start', task: { ...task, settings: JSON.parse(task.settings), links: JSON.parse(task.links), draft: JSON.parse(task.draft) },
        workspace: join(taskRoot, task.id), directory: directory(task.collection_id),
        files: cardDb.prepare("SELECT url,name,kind FROM ai_task_files WHERE task_id=? AND role='input'").all(task.id) });
}

export function startTasks() {
    for (const task of cardDb.prepare("SELECT id FROM ai_tasks WHERE status='running'").all()) failTask(task.id, '服务器重启中断了学习任务；资料和草稿已保留，可点击重试');
    setImmediate(pump);
}
export async function stopTasks() {
    stopping = true;
    if (active) {
        active.controller.abort();
        failTask(active.id, '服务器关闭中断了学习任务；资料和草稿已保留');
        const child = active.child;
        await new Promise(resolveStop => {
            const forced = setTimeout(() => { child.kill(); resolveStop(); }, 12000);
            child.once('exit', () => { clearTimeout(forced); resolveStop(); });
            if (child.connected) child.send({ type: 'cancel' }); else child.kill();
        });
    }
}
