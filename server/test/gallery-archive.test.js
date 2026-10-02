import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import Database from '../sqlite.js';
import { buildGalleryZip, createGalleryArchiveRoutes } from '../gallery-archive.js';
import { downloadPublic } from '../public-download.js';

async function files(t) {
    const folder = await mkdtemp(join(tmpdir(), 'gallery-test-'));
    const publicRoot = join(folder, 'public');
    await mkdir(join(publicRoot, 'picture'), { recursive: true });
    await writeFile(join(publicRoot, 'picture', '同名.png'), Buffer.from([137, 80, 78, 71, 0, 255]));
    await writeFile(join(folder, 'secret.txt'), '不可打包');
    t.after(() => rm(folder, { recursive: true, force: true }));
    return { folder, publicRoot, path: join(folder, 'archive.zip') };
}

test('ZIP 保留全部图片原字节、顺序及 Unicode 文件名，重名和重复引用不丢失', async t => {
    const f = await files(t);
    const remote = Buffer.alloc(200000, 254);
    await buildGalleryZip({ ...f, images: [{ url: '/picture/同名.png?version=1' }, { url: 'https://example.com/同名.png' }, { url: '/picture/同名.png' }],
        fetchRemote: async () => ({ bytes: remote, mime: 'image/png', url: 'https://example.com/同名.png' }) });
    const zip = unzipSync(await readFile(f.path));
    assert.deepEqual(Object.keys(zip), ['0001-同名.png', '0002-同名.png', '0003-同名.png']);
    assert.deepEqual(Buffer.from(zip['0001-同名.png']), await readFile(join(f.publicRoot, 'picture', '同名.png')));
    assert.deepEqual(Buffer.from(zip['0002-同名.png']), remote);
    assert.deepEqual(zip['0003-同名.png'], zip['0001-同名.png']);
});

test('空图集、缺图、路径越界、非图片外链及超大图包明确失败', async t => {
    const f = await files(t);
    await assert.rejects(buildGalleryZip({ ...f, images: [] }), /没有图片/);
    await assert.rejects(buildGalleryZip({ ...f, images: [{ url: '/picture/missing.png' }] }), /第 1 张图片.*不存在/);
    await assert.rejects(buildGalleryZip({ ...f, images: [{ url: '/picture/..%2f..%2fsecret.txt' }] }), /越界/);
    await assert.rejects(buildGalleryZip({ ...f, images: [{ url: 'https://example.com/login' }],
        fetchRemote: async () => ({ bytes: Buffer.from('login'), mime: 'text/html', url: 'https://example.com/login' }) }), /外链没有返回图片/);
    await assert.rejects(buildGalleryZip({ ...f, maxBytes: 1, images: [{ url: '/picture/同名.png' }] }), /超过 2 GB/);
    await assert.rejects(downloadPublic('http://127.0.0.1/private.png'), /内网/);
    await assert.rejects(downloadPublic('file:///etc/passwd'), /公网 HTTP/);
});

test('取消打包会终止外链读取及文件流', async t => {
    const f = await files(t);
    const controller = new AbortController();
    const result = buildGalleryZip({ ...f, signal: controller.signal, images: [{ url: 'https://example.com/slow.png' }],
        fetchRemote: async (_url, signal) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            controller.abort();
        }) });
    await assert.rejects(result, /取消或超时/);
    await rm(f.path); // File handles are closed even when the job is aborted.
});

test('游客打包后直接下载完整 ZIP，票据限定图集且只能使用一次，草稿与隐藏祖先无法下载', async t => {
    const f = await files(t);
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE entries(id INTEGER PRIMARY KEY,kind TEXT,resource_kind TEXT,status TEXT,title TEXT,parent_id INTEGER);
        INSERT INTO entries VALUES(1,'resource','gallery','published','夏日 / 相册',NULL),
            (2,'resource','gallery','draft','草稿',NULL),(3,'resource','document','published','文档',NULL),
            (4,'resource','collection','draft','草稿合集',NULL),(5,'resource','gallery','published','隐藏图集',4),
            (6,'resource','gallery','published','空图集',NULL);`);
    const app = express();
    app.use('/api/content', createGalleryArchiveRoutes({ db, publicRoot: f.publicRoot,
        imagesFor: id => id === 6 ? [] : [{ url: '/picture/同名.png' }],
        publicAncestors: row => row.parent_id && db.prepare('SELECT status FROM entries WHERE id=?').get(row.parent_id).status !== 'published' ? null : [],
    }));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const prepare = id => fetch(`${base}/api/content/entries/${id}/gallery-archive`, { method: 'POST' });
    for (const id of [2, 3, 5, 99]) assert.equal((await prepare(id)).status, 404);
    assert.equal((await prepare(6)).status, 400);
    assert.equal((await fetch(`${base}/api/content/entries/1/gallery-archive`, { method: 'POST', headers: { origin: 'https://other.example' } })).status, 403);
    const prepared = await (await prepare(1)).json();
    assert.equal(prepared.success, true);
    assert.equal((await fetch(base + prepared.downloadUrl.replace('/entries/1/', '/entries/5/'))).status, 404);
    const response = await fetch(base + prepared.downloadUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');
    assert.match(response.headers.get('content-disposition'), /^attachment;/);
    assert.match(response.headers.get('content-disposition'), /filename\*=UTF-8/);
    assert.deepEqual(Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer()))), ['0001-同名.png']);
    assert.equal((await fetch(base + prepared.downloadUrl)).status, 404);
    const hidden = await (await prepare(1)).json();
    db.prepare("UPDATE entries SET status='draft' WHERE id=1").run();
    assert.equal((await fetch(base + hidden.downloadUrl)).status, 404);
    // Losing public visibility discards the prepared archive immediately.
    db.prepare("UPDATE entries SET status='published' WHERE id=1").run();
    assert.equal((await fetch(base + hidden.downloadUrl)).status, 404);
    assert.deepEqual(await readdir(f.publicRoot), ['picture'], '图包不写入公开图片或上传引用目录');
});
