import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import multer from 'multer';

test('异步文件过滤期间中断上传，不崩溃且后续上传正常', { timeout: 5000 }, async t => {
    let started;
    const filtering = new Promise(resolve => { started = resolve; });
    const upload = multer({ limits: { fileSize: 1024 }, fileFilter(_req, _file, cb) {
        started(); setTimeout(() => cb(null, true), 60);
    } });
    const app = express();
    app.post('/upload', upload.single('file'), (_req, res) => res.json({ ok: true }));
    app.get('/alive', (_req, res) => res.send('alive'));
    app.use((_err, _req, res, _next) => res.status(400).end());
    const server = app.listen(0, '127.0.0.1');
    t.after(() => { server.closeAllConnections(); server.close(); });
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = http.request(base + '/upload', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=abort-test' } });
    request.on('error', () => {});
    request.write('--abort-test\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\npartial upload');
    await filtering; request.destroy();
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.equal((await fetch(base + '/alive')).status, 200);
    const form = new FormData(); form.append('file', new Blob(['ok']), 'good.txt');
    assert.equal((await fetch(base + '/upload', { method: 'POST', body: form })).status, 200);
});
