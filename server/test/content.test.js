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
        env: { ...process.env, DEEPSEEK_API_KEY: '', DATA_DIR: folder, PUBLIC_DIR: join(folder, 'public'), SERVER_PORT: String(port), ADMIN_PASSWORD: 'test-secret-123', SESSION_SECRET: 'test-session-secret-123' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
        assert.equal((await request('/api/admin/ai/config')).status, 401);
        assert.equal((await request('/api/admin/login', write('POST', { password: 'wrong' }))).status, 401);
        assert.equal((await request('/api/admin/login', write('POST', { password: 'test-secret-123' }))).status, 200);
        const aiConfig = (await request('/api/admin/ai/config')).body.data;
        assert.equal(aiConfig.model, 'deepseek-flash');
        assert.equal(aiConfig.keyConfigured, false);
        assert.ok(!Object.hasOwn(aiConfig, 'apiKey'));
        assert.equal((await request('/api/admin/ai/config', write('PUT', { ...aiConfig, maxOutputTokens: 1 }))).status, 400);
        assert.equal((await request('/api/admin/ai/config', write('PUT', { ...aiConfig, model: 'other-model', apiKey: 'test-secret', reportInstructions: '中文讲解' }))).status, 200);
        const updatedAiConfig = (await request('/api/admin/ai/config')).body.data;
        assert.equal(updatedAiConfig.model, 'deepseek-flash');
        assert.equal(updatedAiConfig.reportInstructions, '中文讲解');
        assert.ok(!Object.hasOwn(updatedAiConfig, 'apiKey'));
        assert.equal((await request('/api/admin/ai/tasks/missing')).status, 404);
        const disabledAiUpload = new FormData();
        disabledAiUpload.append('files', new Blob(['temporary learning source']), 'disabled-learning.txt');
        assert.equal((await request('/api/admin/ai/tasks', { method: 'POST', body: disabledAiUpload })).status, 400);
        const { readdirSync } = await import('node:fs');
        assert.deepEqual(readdirSync(join(folder, 'public', 'source')), [], '拒绝的任务上传应被清除');
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
        const filteredShort = (await request('/api/content/entries?kind=moment&format=short&limit=1')).body;
        assert.equal(filteredShort.total, 1);
        assert.equal(filteredShort.data[0].id, short.body.id);
        const filteredArticles = (await request('/api/content/entries?kind=moment&format=article&limit=1&page=2')).body;
        assert.equal(filteredArticles.total, 2, '类型过滤后的总数不能包含短帖或草稿');
        assert.equal(filteredArticles.data[0].id, momentId, '类型过滤后再按时间排序分页');
        assert.equal((await request('/api/content/entries?kind=moment&format=article&q=%E6%95%A3%E6%AD%A5')).body.total, 0, '搜索只匹配当前形式');
        assert.equal((await request('/api/content/entries?kind=moment&format=short&q=%E6%97%A5%E5%B8%B8')).body.total, 1, '类型筛选仍可搜索标签');
        const shortInput = { kind: 'moment', format: 'short', title: '', tags: [], status: 'published' };
        const tooLong = await request('/api/admin/entries', write('POST', { ...shortInput, body: '记'.repeat(501) }));
        assert.equal(tooLong.status, 400);
        assert.match(tooLong.body.message, /500/);
        const atLimit = await request('/api/admin/entries', write('POST', { ...shortInput, body: '记'.repeat(500) }));
        assert.equal(atLimit.status, 201, '恰好 500 字可以新建');
        assert.equal((await request(`/api/content/entries/${atLimit.body.id}`)).body.data.body.length, 500);
        const unicodeBody = '📝'.repeat(500);
        assert.equal((await request(`/api/admin/entries/${short.body.id}`, write('PUT', { ...shortInput, body: `  ${unicodeBody}\n` }))).status, 200, 'Unicode 字符按一个字计数，首尾空白不计入');
        assert.equal((await request(`/api/admin/entries/${short.body.id}`, write('PUT', { ...shortInput, body: unicodeBody + '字', status: 'draft' }))).status, 400, '编辑和草稿也必须遵守 500 字上限');
        assert.equal((await request(`/api/content/entries/${short.body.id}`)).body.data.body, unicodeBody, '拒绝的编辑不能截断或覆盖原正文');
        assert.equal((await request('/api/admin/entries', write('POST', { ...moment, body: '文'.repeat(501) }))).status, 201, '文章不受短帖字数限制');
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

        const uploadText = async name => {
            const data = new FormData();
            data.append('file', new Blob([name], { type: 'text/plain' }), name);
            const result = await request('/api/admin/upload', { method: 'POST', body: data });
            assert.equal(result.status, 200);
            return result.body.url;
        };
        const sharedUrl = await uploadText('shared.txt');
        const orphanUrl = await uploadText('orphan.txt');
        const filePath = url => join(folder, 'public', url.slice(1));
        const first = await request('/api/admin/entries', write('POST', {
            ...moment, title: '附件文章',
            body: `[附件](${sharedUrl}) [外部](https://example.com/file) [丢失](/source/missing.txt) [空链接]() ![空图片]() \`[代码里的链接]()\``
        }));
        assert.equal(first.status, 201);
        assert.ok(first.body.warnings.some(item => item.includes('地址为空')));
        assert.ok(first.body.warnings.some(item => item.includes('/source/missing.txt')));
        assert.ok(!first.body.warnings.some(item => item.includes('代码里的链接')));
        assert.ok(existsSync(filePath(sharedUrl)));
        assert.ok(!existsSync(filePath(orphanUrl)));
        assert.ok(!existsSync(filePath(uploaded.body.url)));

        const second = await request('/api/admin/entries', write('POST', {
            ...moment, title: '另一篇也引用', body: `![复用图片](${sharedUrl}?download=1)`
        }));
        assert.equal(second.status, 201);
        const update = await request(`/api/admin/entries/${first.body.id}`, write('PUT', { ...moment, title: '附件文章', body: '已经移除链接' }));
        assert.equal(update.status, 200);
        assert.ok(existsSync(filePath(sharedUrl)), '另一篇帖子仍在引用文件');
        const removed = await request(`/api/admin/entries/${second.body.id}`, { method: 'DELETE' });
        assert.equal(removed.status, 200);
        assert.equal(removed.body.deletedFiles, 1);
        assert.ok(!existsSync(filePath(sharedUrl)));

        const image = new FormData();
        image.append('file', new Blob(['image'], { type: 'image/png' }), 'cover.png');
        const imageUrl = (await request('/api/admin/upload', { method: 'POST', body: image })).body.url;
        const withProfile = await request('/api/admin/profile', write('PUT', {
            profile: { ...profile, avatar: imageUrl }, cards: [{ title: '资料', content: `[下载](${imageUrl})` }]
        }));
        assert.equal(withProfile.status, 200);
        assert.ok(existsSync(filePath(imageUrl)));
        await request('/api/admin/profile', write('PUT', { profile: { ...profile, avatar: '/picture/test.png' }, cards: [{ title: '资料', content: '' }] }));
        assert.ok(!existsSync(filePath(imageUrl)));

        // Nested collections hide their members from all root listings and searches.
        const collection = { kind: 'resource', resource_kind: 'collection', title: '游戏收藏', body: '整理游戏资源', status: 'published', parent_id: null };
        const outer = await request('/api/admin/entries', write('POST', collection));
        assert.equal(outer.status, 201);
        const outerId = outer.body.id;
        const nested = await request('/api/admin/entries', write('POST', { ...collection, title: '截图收藏', parent_id: outerId }));
        assert.equal(nested.status, 201);
        const nestedId = nested.body.id;
        const childDocument = await request('/api/admin/entries', write('POST', { ...resource, title: '安装说明', parent_id: outerId }));
        assert.equal(childDocument.status, 201);
        const galleryFile = new FormData();
        galleryFile.append('file', new Blob(['gallery-image'], { type: 'image/png' }), 'gallery.png');
        const galleryUrl = (await request('/api/admin/upload', { method: 'POST', body: galleryFile })).body.url;
        const gallery = { kind: 'resource', resource_kind: 'gallery', title: '藏在合集的图集', parent_id: nestedId, tags: ['截图'], status: 'published',
            images: [{ url: galleryUrl, caption: '游戏画面', width: 1920, height: 1080 }, { url: 'https://example.com/photo.jpg', caption: '外部图片' }] };
        const createdGallery = await request('/api/admin/entries', write('POST', gallery));
        assert.equal(createdGallery.status, 201);
        const galleryId = createdGallery.body.id;
        assert.ok(existsSync(filePath(galleryUrl)), '图集中的图片必须纳入引用保护');
        const rootResources = (await request('/api/content/entries?kind=resource')).body.data;
        assert.ok(rootResources.some(row => row.id === outerId));
        assert.ok(!rootResources.some(row => [nestedId, galleryId, childDocument.body.id].includes(row.id)));
        assert.equal((await request('/api/content/entries?kind=resource&q=' + encodeURIComponent(gallery.title))).body.total, 0);
        const outerList = (await request(`/api/content/entries?kind=resource&parent=${outerId}`)).body.data;
        assert.deepEqual(new Set(outerList.map(row => row.id)), new Set([nestedId, childDocument.body.id]));
        const nestedList = (await request(`/api/content/entries?kind=resource&parent=${nestedId}`)).body.data;
        assert.equal(nestedList[0].id, galleryId);
        assert.equal(nestedList[0].image_count, 2);
        assert.equal(nestedList[0].cover_image, galleryUrl);
        const galleryDetail = (await request(`/api/content/entries/${galleryId}`)).body.data;
        assert.deepEqual(galleryDetail.ancestors.map(row => row.id), [outerId, nestedId]);
        assert.deepEqual(galleryDetail.images.map(image => image.caption), ['游戏画面', '外部图片']);
        assert.equal((await request('/api/admin/entries?kind=resource')).body.data.find(row => row.id === galleryId).images.length, 2);

        // Failed moves are atomic and cannot create a collection cycle.
        assert.equal((await request(`/api/admin/entries/${outerId}`, write('PUT', { ...collection, parent_id: outerId, member_ids: [] }))).status, 400);
        assert.equal((await request(`/api/admin/entries/${outerId}`, write('PUT', { ...collection, parent_id: nestedId }))).status, 400);
        assert.equal((await request(`/api/admin/entries/${nestedId}`, write('PUT', { ...collection, title: '截图收藏', parent_id: outerId, member_ids: [outerId] }))).status, 400);
        assert.equal((await request(`/api/admin/entries/${outerId}`, write('PUT', { ...resource, resource_kind: 'document' }))).status, 400);
        assert.equal((await request('/api/admin/entries', write('POST', { ...resource, parent_id: galleryId }))).status, 400);
        assert.deepEqual((await request(`/api/content/entries/${galleryId}`)).body.data.ancestors.map(row => row.id), [outerId, nestedId]);

        const assigned = await request(`/api/admin/entries/${outerId}`, write('PUT', { ...collection, member_ids: [nestedId, resourceId] }));
        assert.equal(assigned.status, 200);
        assert.equal((await request(`/api/content/entries/${resourceId}`)).body.data.parent_id, outerId);
        assert.equal((await request(`/api/content/entries/${childDocument.body.id}`)).body.data.parent_id, null);
        await request(`/api/admin/entries/${outerId}`, write('PUT', { ...collection, status: 'draft' }));
        assert.equal((await request(`/api/content/entries/${galleryId}`)).status, 404);
        assert.equal((await request(`/api/content/entries?kind=resource&parent=${nestedId}`)).status, 404);
        assert.ok(existsSync(filePath(galleryUrl)), '草稿合集里的图片仍需保留');
        await request(`/api/admin/entries/${outerId}`, write('PUT', collection));

        // Gallery order and captions can be edited; deletion releases the last image reference.
        const reordered = await request(`/api/admin/entries/${galleryId}`, write('PUT', { ...gallery, images: [...gallery.images].reverse() }));
        assert.equal(reordered.status, 200);
        assert.equal((await request(`/api/content/entries/${galleryId}`)).body.data.images[0].caption, '外部图片');
        const extraImage = new FormData();
        extraImage.append('file', new Blob(['extra-image'], { type: 'image/png' }), 'extra.png');
        const extraUrl = (await request('/api/admin/upload', { method: 'POST', body: extraImage })).body.url;
        await request(`/api/admin/entries/${galleryId}`, write('PUT', { ...gallery, images: [...gallery.images, { url: extraUrl, caption: '临时图片' }] }));
        await request(`/api/admin/entries/${resourceId}`, write('PUT', { ...resource, parent_id: outerId, body: `共用图片：![共享](${extraUrl})` }));
        await request(`/api/admin/entries/${galleryId}`, write('PUT', gallery));
        assert.ok(existsSync(filePath(extraUrl)), '移出图集的图片仍被文档引用');
        const unshared = await request(`/api/admin/entries/${resourceId}`, write('PUT', { ...resource, parent_id: outerId }));
        assert.equal(unshared.body.deletedFiles, 1);
        assert.ok(!existsSync(filePath(extraUrl)));
        assert.ok(existsSync(filePath(galleryUrl)));
        await request(`/api/admin/entries/${outerId}`, { method: 'DELETE' });
        assert.equal((await request(`/api/content/entries/${nestedId}`)).body.data.parent_id, null);
        assert.deepEqual((await request(`/api/content/entries/${galleryId}`)).body.data.ancestors.map(row => row.id), [nestedId]);
        await request(`/api/admin/entries/${nestedId}`, { method: 'DELETE' });
        assert.equal((await request(`/api/content/entries/${galleryId}`)).body.data.parent_id, null);
        const deletedGallery = await request(`/api/admin/entries/${galleryId}`, { method: 'DELETE' });
        assert.equal(deletedGallery.status, 200);
        assert.equal(deletedGallery.body.deletedFiles, 1);
        assert.ok(!existsSync(filePath(galleryUrl)));
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
