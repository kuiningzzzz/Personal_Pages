import express from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { extname, join, resolve, sep } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { cardDb } from '../db.js';
import { publicRoot, rememberUpload, auditAndCleanupUploads } from '../upload-cleanup.js';
import { publicAncestors } from '../resource-structure.js';
import { MODEL, HARNESS_VERSION } from './prompt.js';
import { INITIAL_BUDGET, BUDGET_INCREMENT, MAX_BUDGET } from './budget.js';
import { createTask, getTask, taskView, settings, cancelTask, retryTask, taskRoot, taskStopping } from './tasks.js';

const router = express.Router();
router.get('/config', (_req, res) => res.json({ success: true, data: { ...settings(), model: MODEL, harnessVersion: HARNESS_VERSION, initialIterations: INITIAL_BUDGET, iterationIncrement: BUDGET_INCREMENT, maxIterations: MAX_BUDGET, keyConfigured: !!process.env.DEEPSEEK_API_KEY } }));
router.put('/config', (req, res) => {
    const maxOutputTokens = Number(req.body.maxOutputTokens);
    const taskTimeoutMinutes = Number(req.body.taskTimeoutMinutes);
    const reportInstructions = String(req.body.reportInstructions || '').trim();
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 4096 || maxOutputTokens > 32768 || !Number.isInteger(taskTimeoutMinutes) || taskTimeoutMinutes < 5 || taskTimeoutMinutes > 120 || reportInstructions.length > 10000) return res.status(400).json({ success: false, message: '输出上限需为 4096–32768，任务时限为 5–120 分钟，附加要求最多 10000 字' });
    const data = { maxOutputTokens, taskTimeoutMinutes, reportInstructions };
    cardDb.prepare("UPDATE site_configs SET data=?,updated_at=CURRENT_TIMESTAMP WHERE key='ai_learning'").run(JSON.stringify(data));
    res.json({ success: true, data });
});
router.get('/collections', (_req, res) => {
    const rows = cardDb.prepare("SELECT * FROM entries WHERE kind='resource' AND resource_kind='collection' ORDER BY title").all();
    res.json({ success: true, data: rows.map(row => ({ id: row.id, title: row.title, parent_id: row.parent_id, status: row.status,
        publishable: row.status === 'published' && !!publicAncestors(row), path: [...(publicAncestors(row) || []).map(parent => parent.title), row.title].join(' / ') })) });
});
router.get('/tasks', (_req, res) => res.json({ success: true, data: cardDb.prepare('SELECT * FROM ai_tasks ORDER BY created_at DESC LIMIT 100').all().map(row => taskView(row)) }));
router.get('/tasks/:id', (req, res) => {
    const task = taskView(getTask(req.params.id), true);
    res.status(task ? 200 : 404).json(task ? { success: true, data: task } : { success: false, message: '任务不存在' });
});
const extensions = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.md']);
const upload = multer({ storage: multer.diskStorage({
    destination: (_req, file, cb) => { const folder = join(publicRoot, ['.png','.jpg','.jpeg','.gif','.webp'].includes(extname(file.originalname).toLowerCase()) ? 'picture' : 'source'); mkdirSync(folder, { recursive: true }); cb(null, folder); },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(8).toString('hex')}${extname(file.originalname).toLowerCase()}`)
}), limits: { fileSize: 50 * 1024 * 1024, files: 12, fields: 6, fieldSize: 100000 },
fileFilter: (_req, file, cb) => extensions.has(extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('学习资料支持 PDF、PNG、JPEG、GIF、WebP、TXT、Markdown')) });
router.post('/tasks', (req, res) => {
    upload.array('files', 12)(req, res, error => {
        const removeUploaded = () => { for (const file of req.files || []) try { unlinkSync(file.path); } catch { /* Multer may already remove files. */ } };
        if (error) { removeUploaded(); return res.status(400).json({ success: false, message: error.message }); }
        try {
            if (!process.env.DEEPSEEK_API_KEY) throw new Error('请先在项目根目录 .env 配置 DEEPSEEK_API_KEY 并重启后端');
            const files = (req.files || []).map(file => {
                const extension = extname(file.originalname).toLowerCase();
                if (extension === '.pdf' && !readFileSync(file.path).subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${file.originalname} 不是有效的 PDF 文件`);
                const kind = extension === '.pdf' ? 'pdf' : ['.txt','.md'].includes(extension) ? 'text' : 'image';
                return { url: `/${kind === 'image' ? 'picture' : 'source'}/${file.filename}`, name: Buffer.from(file.originalname, 'latin1').toString('utf8'), kind };
            });
            const task = createTask(req.body, files);
            for (const file of files) rememberUpload(file.url);
            res.status(201).json({ success: true, data: task });
        } catch (cause) { removeUploaded(); res.status(400).json({ success: false, message: cause.message }); }
    });
});
router.post('/tasks/:id/cancel', (req, res) => {
    try { cancelTask(req.params.id); res.json({ success: true, data: taskView(getTask(req.params.id), true) }); }
    catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.post('/tasks/:id/retry', (req, res) => {
    try { retryTask(req.params.id); res.json({ success: true, data: taskView(getTask(req.params.id), true) }); }
    catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.get('/tasks/:id/report', (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    const entry = task.result_entry_id && cardDb.prepare('SELECT title,body FROM entries WHERE id=?').get(task.result_entry_id);
    const draft = JSON.parse(task.draft);
    const errorPath = join(taskRoot, task.id, 'error.md');
    const errorBody = ['failed', 'cancelled'].includes(task.status) && existsSync(errorPath) ? readFileSync(errorPath, 'utf8') : '';
    const body = entry?.body || errorBody || draft.body || `# 学习任务\n\n${task.error || '尚未保存报告'}`;
    res.setHeader('Content-Disposition', 'attachment; filename="learning-report.md"');
    res.type('text/markdown').send(body);
});
router.delete('/tasks/:id', (req, res) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (['queued','running'].includes(task.status)) return res.status(400).json({ success: false, message: '请先取消任务，再删除记录' });
    if (taskStopping(task.id)) return res.status(400).json({ success: false, message: '任务正在停止，请稍后删除' });
    const path = resolve(taskRoot, task.id);
    if (!path.startsWith(resolve(taskRoot) + sep)) return res.status(400).json({ success: false, message: '任务路径无效' });
    cardDb.prepare('DELETE FROM ai_tasks WHERE id=?').run(task.id);
    rmSync(path, { recursive: true, force: true });
    res.json({ success: true, ...auditAndCleanupUploads() });
});
export default router;
