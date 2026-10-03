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
        env: { ...process.env, DEEPSEEK_API_KEY: '', QQ_SMTP_USER: '', QQ_SMTP_AUTH_CODE: '', DATA_DIR: folder, PUBLIC_DIR: join(folder, 'public'), SERVER_PORT: String(port), ADMIN_PASSWORD: 'test-secret-123', SESSION_SECRET: 'test-session-secret-123' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
        assert.equal((await request('/api/admin/ai/tasks/missing/events')).status, 401);
        assert.equal((await request('/api/admin/moderation/reports')).status, 401);
        assert.equal((await request('/api/admin/moderation/blacklist')).status, 401);
        assert.equal((await request('/api/admin/feedback')).status, 401);
        assert.equal((await request('/api/admin/login', write('POST', { password: 'wrong' }))).status, 401);
        assert.equal((await request('/api/admin/login', write('POST', { password: 'test-secret-123' }))).status, 200);
        assert.equal((await request('/api/admin/moderation/reports')).status, 200);
        assert.equal((await request('/api/admin/moderation/blacklist')).status, 200);
        assert.equal((await request('/api/admin/feedback')).status, 200);
        assert.equal((await request('/api/admin/moderation/blacklist', write('POST', { email: 'ban-test@example.com' }))).status, 200);
        assert.equal((await request('/api/admin/moderation/blacklist', write('DELETE', { email: 'ban-test@example.com' }))).status, 200);
        const aiConfig = (await request('/api/admin/ai/config')).body.data;
        assert.equal(aiConfig.model, 'deepseek-flash');
        assert.equal(aiConfig.keyConfigured, false);
        assert.ok(!Object.hasOwn(aiConfig, 'apiKey'));
        assert.ok(!Object.hasOwn(aiConfig, 'maxOutputTokens'));
        assert.equal((await request('/api/admin/ai/config', write('PUT', { ...aiConfig, taskTimeoutMinutes: 1 }))).status, 400);
        assert.equal((await request('/api/admin/ai/config', write('PUT', { ...aiConfig, maxOutputTokens: 1 }))).status, 200);
        assert.equal((await request('/api/admin/ai/config', write('PUT', { ...aiConfig, model: 'other-model', apiKey: 'test-secret', reportInstructions: '中文讲解' }))).status, 200);
        const updatedAiConfig = (await request('/api/admin/ai/config')).body.data;
        assert.equal(updatedAiConfig.model, 'deepseek-flash');
        assert.equal(updatedAiConfig.reportInstructions, '中文讲解');
        assert.ok(!Object.hasOwn(updatedAiConfig, 'apiKey'));
        assert.ok(!Object.hasOwn(updatedAiConfig, 'maxOutputTokens'));
        assert.equal((await request('/api/admin/ai/tasks/missing')).status, 404);
        assert.equal((await request('/api/admin/ai/tasks/missing/events')).status, 404);
        const disabledAiUpload = new FormData();
        disabledAiUpload.append('files', new Blob(['temporary learning source']), 'disabled-learning.txt');
        assert.equal((await request('/api/admin/ai/tasks', { method: 'POST', body: disabledAiUpload })).status, 400);
        const { readdirSync } = await import('node:fs');
        assert.deepEqual(readdirSync(join(folder, 'public', 'source')), [], '拒绝的任务上传应被清除');
        const profile = { avatar: '/picture/test.png', name: '测试站点', description: '新的描述' };
        assert.equal((await request('/api/admin/profile', write('PUT', { profile, cards: [{ title: '测试卡片', content: '**加粗**' }] }))).status, 200);
        assert.equal((await request('/api/content/profile')).body.data.cards[0].content, '**加粗**');
        const welcome = ['欢迎来到测试站点', '放一张喜欢的唱片', '记录值得留下的日常'];
        assert.equal((await request('/api/admin/profile', write('PUT', { profile, cards: [], welcome }))).status, 200);
        assert.deepEqual((await request('/api/admin/profile')).body.data.welcome, welcome);
        assert.deepEqual((await request('/api/content/profile')).body.data.welcome, welcome);
        assert.equal((await request('/api/admin/profile', write('PUT', { profile: { ...profile, name: '不应保存' }, cards: [], welcome: ['无效'] }))).status, 400);
        assert.equal((await request('/api/content/profile')).body.data.profile.name, profile.name);
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
        assert.deepEqual((await request('/api/content/profile')).body.data.welcome, welcome, '旧请求未传欢迎文字时保留已保存内容');
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
        assert.equal((await request(`/api/content/entries/${momentId}`)).body.data.article_navigation, null);
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
        const actionLabel = '下载课程资料与完整的补充阅读文件：这是一个超过三十字的按钮名称 📚';
        const resource = { kind: 'resource', title: '示例工具', cover_image: '/picture/tool.png', body: '一个开源项目', tags: ['工具'], resource_type_id: types[0].id,
            actions: [{ label: actionLabel, url: 'https://example.com' }], status: 'published' };
        const resourceId = (await request('/api/admin/entries', write('POST', resource))).body.id;
        const list = (await request(`/api/content/entries?kind=resource&type=${types[0].id}`)).body;
        assert.equal(list.total, 1);
        assert.equal(list.data[0].cover_image, '/picture/tool.png');
        assert.equal(list.data[0].actions[0].label, actionLabel);
        assert.equal((await request(`/api/admin/entries/${resourceId}`, write('PUT', resource))).status, 200);
        assert.equal((await request(`/api/content/entries/${resourceId}`)).body.data.actions[0].label, actionLabel);
        assert.equal((await request(`/api/content/entries/${resourceId}`)).body.data.body, '一个开源项目');
        assert.equal((await request(`/api/content/entries?kind=resource&type=${types[1].id}`)).body.total, 0);
        const peer = await request('/api/admin/entries', write('POST', { ...resource, title: '另一大类的根文章', resource_type_id: types[1].id }));
        assert.equal(peer.status, 201);
        const navigation = (await request(`/api/content/entries/${resourceId}`)).body.data.article_navigation;
        assert.deepEqual(navigation, { previous: { id: peer.body.id, title: '另一大类的根文章' }, next: { id: peer.body.id, title: '另一大类的根文章' } });
        assert.equal((await request(`/api/admin/entries/${peer.body.id}`, { method: 'DELETE' })).status, 200);
        assert.equal((await request(`/api/content/entries/${resourceId}`)).body.data.article_navigation, null);
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
        const collection = { kind: 'resource', resource_kind: 'collection', title: '游戏收藏', body: '整理游戏资源', status: 'published', parent_id: null, resource_type_id: types[1].id };
        const outer = await request('/api/admin/entries', write('POST', collection));
        assert.equal(outer.status, 201);
        const outerId = outer.body.id;
        const nested = await request('/api/admin/entries', write('POST', { ...collection, title: '截图收藏', parent_id: outerId }));
        assert.equal(nested.status, 201);
        const nestedId = nested.body.id;
        assert.equal((await request(`/api/content/entries/${nestedId}`)).body.data.resource_type_id, types[1].id);
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
        assert.equal((await request(`/api/content/entries/${childDocument.body.id}`)).body.data.article_navigation, null, '同级只有一篇文档，子合集不参与阅读队列');
        assert.deepEqual(new Set(outerList.map(row => row.id)), new Set([nestedId, childDocument.body.id]));
        assert.ok(outerList.every(row => row.resource_type_id === types[1].id));
        const ignoredType = (await request(`/api/content/entries?kind=resource&parent=${outerId}&type=${types[0].id}`)).body.data;
        assert.deepEqual(new Set(ignoredType.map(row => row.id)), new Set(outerList.map(row => row.id)), '合集内部忽略大类筛选');
        assert.equal((await request(`/api/content/entries?kind=resource&parent=${outerId}&q=${encodeURIComponent('安装说明')}&type=${types[0].id}`)).body.total, 1);
        const nestedList = (await request(`/api/content/entries?kind=resource&parent=${nestedId}`)).body.data;
        assert.equal(nestedList[0].id, galleryId);
        assert.equal(nestedList[0].image_count, 2);
        assert.equal(nestedList[0].cover_image, galleryUrl);
        const galleryDetail = (await request(`/api/content/entries/${galleryId}`)).body.data;
        assert.equal(galleryDetail.article_navigation, null);
        assert.equal(galleryDetail.resource_type_id, types[1].id);
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
        const editedGallery = (await request(`/api/content/entries/${galleryId}`)).body.data;
        assert.equal(editedGallery.images[0].caption, '外部图片');
        for (const id of [outerId, nestedId]) {
            const ancestor = (await request(`/api/content/entries/${id}`)).body.data;
            assert.ok(Date.parse(ancestor.updated_at) >= Date.parse(editedGallery.updated_at), '编辑图集同步所有上级合集时间');
        }
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

        // Saved songs join the same upload-reference protection as Markdown.
        const songUrl = await uploadText('song.mp3');
        const home = (await request('/api/admin/profile')).body.data;
        const homeWithMusic = { ...home, playlist: [{ title: '测试歌曲', artist: '测试作者', url: songUrl }] };
        assert.equal((await request('/api/admin/profile', write('PUT', homeWithMusic))).status, 200);
        assert.ok(existsSync(filePath(songUrl)));
        assert.equal((await request('/api/content/profile')).body.data.playlist[0].url, songUrl);
        assert.equal((await request('/api/admin/profile', write('PUT', { ...homeWithMusic, playlist: [{ title: '无效', url: 'https://example.com/song.mp3' }] }))).status, 400);
        assert.equal((await request('/api/admin/profile', write('PUT', { profile: home.profile, cards: home.cards }))).status, 200);
        assert.equal((await request('/api/content/profile')).body.data.playlist.length, 1, '不传歌单的旧保存请求保留歌曲');
        assert.ok(existsSync(filePath(songUrl)));
        assert.equal((await request('/api/admin/profile', write('PUT', { ...home, playlist: [] }))).status, 200);
        assert.ok(!existsSync(filePath(songUrl)), '歌单移除后不再引用的 MP3 按规则清理');

        // Public search pages stay complete and distinct. Short-post mail links
        // locate their real page rather than pushing a sixteenth item into it.
        const momentIds = [];
        for (let i = 0; i < 31; i++) {
            const result = await request('/api/admin/entries', write('POST', { ...moment, format: 'short',
                title: `分页短帖 ${i}`, body: '分页验收数据', tags: ['分页验收动态'], published_at: new Date(Date.UTC(2030, 0, 1, 0, i)).toISOString() }));
            assert.equal(result.status, 201); momentIds.push(result.body.id);
        }
        const momentQuery = '/api/content/entries?kind=moment&q=' + encodeURIComponent('分页验收动态');
        const momentPages = await Promise.all([1, 2, 3].map(n => request(`${momentQuery}&page=${n}`)));
        assert.deepEqual(momentPages.map(p => p.body.data.length), [15, 15, 1]);
        assert.deepEqual(momentPages.flatMap(p => p.body.data.map(r => r.id)), [...momentIds].reverse());
        assert.equal((await request(`${momentQuery}&page=90`)).body.page, 3);
        const located = (await request(`/api/content/entries?kind=moment&format=short&limit=15&locate=${momentIds[0]}`)).body;
        assert.equal(located.page, 3);
        assert.ok(located.data.some(r => r.id === momentIds[0]));
        assert.ok(located.data.length <= 15);
        assert.equal((await request(`/api/admin/entries/${momentIds[0]}`, write('PUT', { ...moment, format: 'short',
            title: '分页短帖 0', body: '分页验收数据已更新', tags: ['分页验收动态'], published_at: '2030-01-01T00:00:00.000Z' }))).status, 200);
        assert.equal((await request(`${momentQuery}&sort=latest`)).body.data[0].id, momentIds.at(-1), '最新发布只按发布时间');
        assert.equal((await request(`${momentQuery}&sort=updated`)).body.data[0].id, momentIds[0], '最新修改把旧帖的新修改排在前面');
        assert.equal((await request('/api/content/entries?kind=moment&sort=updated')).body.data[0].id, momentIds[0]);
        const resourceIds = [];
        for (let i = 0; i < 16; i++) {
            const result = await request('/api/admin/entries', write('POST', { ...resource, title: `分页资源 ${i}`,
                tags: ['分页验收资源'], resource_kind: i === 15 ? 'collection' : 'document', parent_id: null,
                published_at: i === 15 ? '2020-01-01T00:00:00.000Z' : new Date(Date.UTC(2030, 0, 1, 0, i)).toISOString() }));
            assert.equal(result.status, 201); resourceIds.push(result.body.id);
        }
        const pagedCollection = resourceIds.at(-1);
        const childIds = [];
        for (let i = 0; i < 16; i++) {
            const result = await request('/api/admin/entries', write('POST', { ...resource, title: `分页成员 ${i}`,
                tags: ['分页验收资源'], parent_id: pagedCollection }));
            assert.equal(result.status, 201); childIds.push(result.body.id);
        }
        const resourceQuery = '/api/content/entries?kind=resource&q=' + encodeURIComponent('分页验收资源');
        assert.equal((await request(`${resourceQuery}&sort=latest`)).body.data[0].id, resourceIds[14]);
        assert.equal((await request(`${resourceQuery}&sort=updated`)).body.data[0].id, pagedCollection, '子内容更新使旧合集在最新修改排序中优先');
        for (const [parent, ids] of [[null, resourceIds], [pagedCollection, childIds]]) {
            const query = resourceQuery + (parent ? `&parent=${parent}` : '');
            const pages = await Promise.all([1, 2].map(n => request(`${query}&page=${n}`)));
            assert.deepEqual(pages.map(p => p.body.data.length), [15, 1]);
            assert.deepEqual(new Set(pages.flatMap(p => p.body.data.map(r => r.id))), new Set(ids));
            assert.ok(pages.every(p => p.body.total === 16));
        }
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
