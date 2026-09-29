import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const freePort = () => new Promise(resolve => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});

test('管理、发布、搜索及资源分类可以完整工作', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'personal-pages-test-'));
    const port = await freePort();
    const child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url),
        env: { ...process.env, DATA_DIR: folder, PUBLIC_DIR: join(folder, 'public'), SERVER_PORT: String(port), ADMIN_PASSWORD: 'test-secret-123', SESSION_SECRET: 'test-session-secret-123' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const base = `http://127.0.0.1:${port}`;
    let viteChild;
    let cookie = '';
    const request = async (path, options = {}) => {
        const response = await fetch(base + path, { ...options, headers: { ...(options.headers || {}), ...(cookie ? { cookie } : {}) } });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, body: await response.json() };
    };
    const write = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
        let ready = false;
        for (let i = 0; i < 80; i++) {
            if (child.exitCode !== null) throw new Error(`服务启动失败: ${output}`);
            try { await request('/api/content/profile'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert.ok(ready, '服务应成功启动');
        assert.equal((await request('/api/admin/profile')).status, 401);
        assert.equal((await request('/api/admin/login', write('POST', { password: 'wrong' }))).status, 401);
        assert.equal((await request('/api/admin/login', write('POST', { password: 'test-secret-123' }))).status, 200);
        const profile = { avatar: '/picture/test.png', name: '测试站点', description: '新的描述' };
        assert.equal((await request('/api/admin/profile', write('PUT', { profile, cards: [{ title: '测试卡片', content: '**加粗**' }] }))).status, 200);
        assert.equal((await request('/api/content/profile')).body.data.cards[0].content, '**加粗**');
        const frontendPort = await freePort();
        const frontend = `http://127.0.0.1:${frontendPort}`;
        const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
        viteChild = spawn(process.execPath, [join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort', '--configLoader', 'runner'], {
            cwd: projectRoot, env: { ...process.env, VITE_API_TARGET: base }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let viteOutput = '';
        viteChild.stdout.on('data', data => { viteOutput += data; });
        viteChild.stderr.on('data', data => { viteOutput += data; });
        let proxyReady = false;
        for (let i = 0; i < 80; i++) {
            if (viteChild.exitCode !== null) throw new Error(`前端代理启动失败: ${viteOutput}`);
            try { if ((await fetch(`${frontend}/api/admin/session`)).ok) { proxyReady = true; break; } }
            catch { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert.ok(proxyReady, `前端代理应成功启动: ${viteOutput}`);
        const proxiedSave = await fetch(`${frontend}/api/admin/profile`, {
            ...write('PUT', { profile: { ...profile, description: '来自本地代理' }, cards: [{ title: '测试卡片', content: '**加粗**' }] }),
            headers: { 'content-type': 'application/json', origin: frontend, cookie }
        });
        assert.equal(proxiedSave.status, 200, JSON.stringify(await proxiedSave.json()));
        assert.equal((await request('/api/content/profile')).body.data.profile.description, '来自本地代理');
        const crossSite = await request('/api/admin/settings', { ...write('PUT', {}), headers: { 'content-type': 'application/json', origin: 'https://example.invalid' } });
        assert.equal(crossSite.status, 403);
        assert.equal((await request('/api/admin/settings', write('PUT', { momentsDescription: '新动态介绍', resourceDescription: '资源介绍', activitiesMessage: '稍后开放', icpNumber: '' }))).status, 200);
        assert.equal((await request('/api/content/settings')).body.data.momentsDescription, '新动态介绍');
        const upload = new FormData();
        upload.append('file', new Blob(['temporary test file'], { type: 'text/plain' }), 'note.txt');
        const uploaded = await request('/api/admin/upload', { method: 'POST', body: upload });
        assert.equal(uploaded.status, 200);
        assert.ok(existsSync(join(folder, 'public', uploaded.body.url.slice(1))));
        const moment = { kind: 'moment', title: 'Vue 开发日志', summary: '日常记录', body: '今天写了搜索功能', tags: ['技术', 'Vue'], status: 'published', published_at: '2025-01-01T00:00:00Z' };
        const momentId = (await request('/api/admin/entries', write('POST', moment))).body.id;
        assert.ok(momentId);
        assert.equal((await request('/api/content/entries?kind=moment&q=vue')).body.total, 1);
        assert.equal((await request('/api/content/entries?kind=moment&q=%E6%90%9C%E7%B4%A2')).body.total, 1);
        await request('/api/admin/entries', write('POST', { ...moment, title: '第二条记录', body: '这里也提到 Vue', tags: [], published_at: '2026-01-01T00:00:00Z' }));
        assert.equal((await request('/api/content/entries?kind=moment&q=vue')).body.data[0].id, momentId);
        assert.notEqual((await request('/api/content/entries?kind=moment&q=vue&sort=latest')).body.data[0].id, momentId);
        assert.notEqual((await request('/api/content/entries?kind=moment')).body.data[0].id, momentId);
        const draft = await request('/api/admin/entries', write('POST', { ...moment, title: '隐藏草稿', status: 'draft' }));
        assert.equal(draft.status, 201);
        assert.equal((await request('/api/content/entries?kind=moment')).body.total, 2);
        const short = await request('/api/admin/entries', write('POST', { kind: 'moment', format: 'short', title: '', body: '随手一记：今天散步了。', tags: ['日常'], status: 'published' }));
        assert.equal(short.status, 201);
        const shortResults = (await request('/api/content/entries?kind=moment&q=%E9%9A%8F%E6%89%8B%E4%B8%80%E8%AE%B0')).body;
        assert.equal(shortResults.total, 1);
        assert.equal(shortResults.data[0].format, 'short');
        assert.match(shortResults.data[0].body, /散步/);
        const types = (await request('/api/content/resource-types')).body.data;
        const resource = { kind: 'resource', title: '示例工具', cover_image: '/picture/tool.png', body: '一个开源项目', tags: ['工具'], resource_type_id: types[0].id,
            actions: [{ label: 'Website', url: 'https://example.com' }], status: 'published' };
        const resourceId = (await request('/api/admin/entries', write('POST', resource))).body.id;
        const list = (await request(`/api/content/entries?kind=resource&type=${types[0].id}`)).body;
        assert.equal(list.total, 1);
        assert.equal(list.data[0].cover_image, '/picture/tool.png');
        assert.equal(list.data[0].actions[0].label, 'Website');
        assert.equal((await request(`/api/content/entries/${resourceId}`)).body.data.body, '一个开源项目');
        assert.equal((await request(`/api/content/entries?kind=resource&type=${types[1].id}`)).body.total, 0);
        const swapped = [{ ...types[0], name: types[1].name }, { ...types[1], name: types[0].name }, ...types.slice(2)];
        assert.equal((await request('/api/admin/resource-types', write('PUT', { types: swapped }))).status, 200);
    } finally {
        if (viteChild && viteChild.exitCode === null) {
            viteChild.kill();
            await new Promise(resolve => viteChild.once('exit', resolve));
        }
        if (child.exitCode === null) {
            child.kill();
            await new Promise(resolve => child.once('exit', resolve));
        }
        rmSync(folder, { recursive: true, force: true });
    }
});
