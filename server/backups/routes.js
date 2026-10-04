import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MAX_UPLOAD } from './archive.js';

export function createBackupRoutes(store) {
    const router = express.Router();
    router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    const route = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
    router.get('/', route(async (_req, res) => res.json({ success: true, data: await store.list(), job: store.jobView(), maxUploadBytes: MAX_UPLOAD })));
    router.get('/job', (_req, res) => res.json({ success: true, data: store.jobView() }));
    router.post('/', route(async (_req, res) => res.status(202).json({ success: true, data: store.generate() })));
    router.get('/:id/download', route(async (req, res) => {
        const row = await store.get(req.params.id);
        res.download(row.path, row.name, error => { if (error && !res.headersSent) res.status(404).json({ success: false, message: '备份文件无法下载' }); });
    }));
    router.delete('/:id', route(async (req, res) => { await store.delete(req.params.id); res.json({ success: true }); }));
    const upload = multer({ storage: multer.diskStorage({
        destination: (_req, _file, cb) => { mkdirSync(store.uploadDirectory, { recursive: true }); cb(null, store.uploadDirectory); },
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.zip`)
    }), limits: { fileSize: MAX_UPLOAD, files: 1, fields: 1, parts: 3 }, fileFilter: (_req, file, cb) => cb(/\.zip$/i.test(file.originalname) ? null : new Error('请选择 ZIP 备份包'), /\.zip$/i.test(file.originalname)) });
    router.post('/restore', (req, res, next) => {
        if (store.busy()) return res.status(409).json({ success: false, message: '请等待当前备份操作完成' });
        upload.single('file')(req, res, error => {
            if (error) return next(error);
            if (!req.file) return next(new Error('请上传备份包'));
            const path = req.file.path;
            try { const job = store.restore(path, req.body.mode, () => rm(path, { force: true })); res.status(202).json({ success: true, data: job }); }
            catch (cause) { rm(join(store.uploadDirectory, req.file.filename), { force: true }).catch(() => {}); next(cause); }
        });
    });
    router.use((error, _req, res, _next) => {
        if (res.headersSent) return;
        res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? '备份包不能超过 2GB' : error.message || '备份操作失败' });
    });
    return router;
}
