import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import Database from '../sqlite.js';
import { migrateActivities } from '../activities/schema.js';
import { migrateUsers } from '../auth/schema.js';
import { createActivityService } from '../activities/service.js';
import { createActivityRoutes } from '../activities/routes.js';
import { createDocker, containerName, imageName } from '../activities/docker.js';
import { releaseActivity } from '../../activities/release.js';
import { unpackActivity } from '../activities/package.js';

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const exists = async path => { try { await access(path); return true; } catch { return false; } };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'pages-activities-')), db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys=ON'); migrateActivities(db); migrateUsers(db);
  let time = Date.parse('2026-10-05T12:00:00Z'), target;
  const images = new Set(), containers = new Map(), occupied = new Set([40000]), events = [];
  const docker = {
    free: async port => !occupied.has(port), inspect: async v => containers.get(v.id) || null,
    imageReady: async v => images.has(v.id), configured: (info, v, i) => info.port === v.backend_port && info.env === i.backend_env,
    build: async (v, directory) => { assert.ok(await exists(join(directory, 'backend/Dockerfile'))); events.push(['build', v.id]); images.add(v.id); },
    start: async (v, i, storage) => { assert.ok(images.has(v.id)); await mkdir(storage, { recursive: true }); containers.set(v.id, { State: { Running: true }, port: v.backend_port, env: i.backend_env }); events.push(['start', v.id]); },
    stop: async (v, remove = false) => { const c = containers.get(v.id); if (c) c.State.Running = false; if (remove) containers.delete(v.id); events.push(['stop', v.id]); },
    remove: async v => { containers.delete(v.id); images.delete(v.id); events.push(['remove', v.id]); },
    prune: async ids => { for (const id of [...images]) if (!ids.has(id)) { images.delete(id); containers.delete(id); } },
    target: v => target || { host: '127.0.0.1', port: v.backend_port }
  };
  const service = createActivityService({ db, root: join(root, 'data/activities'), docker, clock: () => time });
  const routes = createActivityRoutes({ service, secret: 'isolated-test-secret', sdkPath: fileURLToPath(new URL('../activities/sdk.js', import.meta.url)), clock: () => time });
  const app = express(); app.use(express.json()); app.use('/api/admin/activities', routes.admin); app.use('/api/plaza', routes.publicRoutes);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const connections = new Set(); server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
  server.on('upgrade', (req, socket, head) => { if (!routes.upgrade(req, socket, head)) socket.destroy(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, options = {}) => { const response = await fetch(base + path, options); const body = await response.json(); return { status: response.status, body }; };
  const write = async (path, content) => { const file = join(root, path); await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, content); return file; };
  const release = async (id = 'sample', backend = true, frontend = 'static', builder) => {
    await write(`dev/${id}/config.json`, JSON.stringify({ id, frontend, backend }));
    await write(`dev/${id}/frontend/index.html`, '<html><head><title>活动</title></head><body>hello<script src="./main.js"></script></body></html>');
    await write(`dev/${id}/frontend/main.js`, 'window.test=1');
    await write(`dev/${id}/frontend/.env`, 'SHOULD_NOT_BE_PACKAGED');
    if (backend) await write(`dev/${id}/backend/Dockerfile`, 'FROM node:24-bookworm-slim\nCMD ["node","server.js"]');
    return releaseActivity(id, root, builder);
  };
  const successful = async job => { await service.idle(); assert.equal(job.status, 'completed', job.message); };
  const metadata = (id, overrides = {}) => ({ ...service.item(id), tags: [], ...overrides });
  const user = name => {
    const token = randomBytes(32).toString('hex'); const id = Number(db.prepare('INSERT INTO users(username,username_key,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(name, name, `${randomUUID()}@example.com`, 'unused', new Date(time).toISOString()).lastInsertRowid);
    db.prepare('INSERT INTO user_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'), id, time + 86400000);
    return { id, cookie: `pp_user_session=${token}` };
  };
  t.after(async () => { await service.stop(); for (const socket of connections) socket.destroy(); server.closeAllConnections(); await new Promise(r => server.close(r)); db.close(); assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep)); await rm(root, { recursive: true, force: true }); });
  return { root, db, service, docker, routes, base, server, request, write, release, successful, metadata, user, images, containers, events, occupied, setTime: value => { time = value; }, setTarget: value => { target = value; } };
}

test('产包支持静态与 Vue，严格校验清单和文件，错误上传不创建活动', async t => {
  const f = await fixture(t), path = await f.release('static-test', false), manifest = await unpackActivity(path, join(f.root, 'extract'));
  assert.equal(manifest.id, 'static-test'); assert.equal(manifest.backend, false); assert.ok(!manifest.files.some(file => file.name.includes('.env')));
  const result = await f.service.importPackage(path); assert.equal(f.service.item(result.itemId).state, 'pending');
  await assert.rejects(f.service.importPackage(join(f.service.directory(f.service.version(result.versionId)), 'release.zip')), /已上传/);
  const vue = await f.release('vue-test', false, 'vue', async cwd => { await mkdir(join(cwd, 'dist')); await writeFile(join(cwd, 'dist/index.html'), '<html>vue-built</html>'); });
  const vueFiles = unzipSync(await readFile(vue)); assert.equal(Buffer.from(vueFiles['frontend/index.html']).toString(), '<html>vue-built</html>'); assert.ok(!vueFiles['frontend/main.js']);
  const broken = unzipSync(await readFile(vue)); broken['frontend/index.html'] = strToU8('tampered');
  const damaged = await f.write('bad.zip', zipSync(broken)); await assert.rejects(f.service.importPackage(damaged), /校验失败/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM plaza_items').get().n, 1);
  await assert.rejects(f.service.importPackage(await f.write('plain.zip', zipSync({ 'index.html': strToU8('missing manifest') }))), /缺少/);
  await assert.rejects(releaseActivity('imports', f.root), /标识符/);
});

test('版本先预览再发布，旧版继续服务，限时停止但保留镜像，端口冲突拒绝，移除全部资源', async t => {
  const f = await fixture(t), first = await f.service.importPackage(await f.release());
  f.service.save(first.itemId, f.metadata(first.itemId, { title: '第一版', schedule: 'timed', starts_at: '2026-10-06T00:00:00Z', ends_at: '2026-10-07T00:00:00Z' }));
  assert.throws(() => f.service.activate(first.itemId, 'published', first.versionId), /先进入预览/);
  await f.successful(f.service.activate(first.itemId, 'preview', first.versionId));
  assert.equal(f.service.version(first.versionId).backend_port, 40001); assert.ok(f.containers.get(first.versionId).State.Running);
  await f.successful(f.service.activate(first.itemId, 'published', first.versionId));
  assert.equal(f.containers.get(first.versionId).State.Running, false); assert.ok(f.images.has(first.versionId));
  assert.equal((await f.request('/api/plaza/items')).body.data.length, 1);
  assert.match((await f.request(`/api/plaza/${first.itemId}/launch`, json('POST', {}))).body.message, /不在开放时段/);
  f.setTime(Date.parse('2026-10-06T12:00:00Z')); f.service.reconcile(); await f.service.idle(); assert.ok(f.containers.get(first.versionId).State.Running);
  const second = await f.service.importPackage(await f.release());
  assert.throws(() => f.service.activate(first.itemId, 'published', second.versionId), /先进入预览/);
  await f.successful(f.service.activate(first.itemId, 'preview', second.versionId));
  assert.equal(f.service.item(first.itemId).published_version_id, first.versionId); assert.ok(f.containers.get(first.versionId).State.Running); assert.ok(f.containers.get(second.versionId).State.Running);
  assert.equal(f.service.version(second.versionId).backend_port, 40002);
  f.occupied.add(41000); await assert.rejects(f.service.validatePort(first.itemId, second.versionId, 41000), /占用/); assert.equal(f.service.version(second.versionId).backend_port, 40002);
  await f.successful(f.service.changePort(first.itemId, second.versionId, 41001)); assert.equal(f.containers.get(second.versionId).port, 41001);
  await f.successful(f.service.activate(first.itemId, 'published', second.versionId)); assert.equal(f.containers.get(first.versionId).State.Running, false);
  await f.successful(f.service.activate(first.itemId, 'preview', first.versionId)); await f.successful(f.service.activate(first.itemId, 'published', first.versionId));
  assert.equal(f.service.item(first.itemId).published_version_id, first.versionId);
  f.images.delete(first.versionId); f.containers.delete(first.versionId); f.service.reconcile(); await f.service.idle(); assert.ok(f.images.has(first.versionId));
  await f.write('data/activities/sample/storage/backend/progress.json', '{}');
  await f.successful(f.service.remove(first.itemId)); assert.equal(f.service.item(first.itemId), undefined); assert.equal(f.images.size, 0); assert.equal(f.containers.size, 0); assert.equal(await exists(join(f.root, 'data/activities/sample')), false);
});

test('SDK 凭证隔离、登录要求、预览豁免、递归合集可见性、排序和外部数据清理', async t => {
  const f = await fixture(t), root = f.service.create('collection', 'external', { title: '合集', tags: [] }), nested = f.service.create('collection', 'external', { title: '子合集', tags: [], parent_id: root });
  const activity = f.service.create('activity', 'external', { title: '外部小游戏', external_url: 'https://example.com/', tags: [], parent_id: nested, login_required: true });
  await f.successful(f.service.activate(root, 'published')); await f.successful(f.service.activate(nested, 'published')); await f.successful(f.service.activate(activity, 'preview')); await f.successful(f.service.activate(activity, 'published'));
  assert.equal((await f.request(`/api/plaza/${activity}/launch`, json('POST', {}))).status, 401);
  const preview = (await f.request(`/api/admin/activities/items/${activity}/launch`, json('POST', {}))).body.data;
  assert.equal((await f.request(`/api/plaza/${activity}/user`, { headers: { 'x-activity-ticket': preview.runtime.ticket } })).body.data.loggedIn, false);
  const a = f.user('中文用户名'), b = f.user('第二人');
  const launch = (await f.request(`/api/plaza/${activity}/launch`, { ...json('POST', {}), headers: { 'content-type': 'application/json', cookie: a.cookie } })).body.data;
  const auth = { 'x-activity-ticket': launch.runtime.ticket, cookie: a.cookie }, other = { 'x-activity-ticket': launch.runtime.ticket, cookie: b.cookie };
  const info = (await f.request(`/api/plaza/${activity}/user`, { headers: auth })).body.data; assert.equal(info.user.username, '中文用户名'); assert.equal(info.user.email, undefined);
  assert.equal((await f.request(`/api/plaza/${activity}/user`, { headers: other })).status, 401);
  assert.equal((await f.request(`/api/plaza/${root}/user`, { headers: auth })).status, 400);
  assert.equal((await f.request(`/api/plaza/${activity}/storage/save`, { ...json('PUT', { value: { level: 3 } }), headers: { ...auth, 'content-type': 'application/json' } })).status, 200);
  assert.deepEqual((await f.request(`/api/plaza/${activity}/storage/save`, { headers: auth })).body.data, { level: 3 });
  assert.equal((await f.request(`/api/plaza/items?parent=${nested}`)).body.ancestors.length, 1);
  assert.equal((await f.request('/api/admin/activities/order', json('POST', { parent_id: root, ids: [activity] }))).status, 400);
  await f.successful(f.service.activate(root, 'pending')); assert.equal((await f.request(`/api/plaza/${activity}/launch`, { ...json('POST', {}), headers: { 'content-type': 'application/json', cookie: a.cookie } })).status, 400);
  await f.successful(f.service.remove(activity)); assert.equal(await exists(join(f.root, `data/activities/external-${activity}`)), false);
});

test('纯网页只在签发凭证后加载，注入 SDK、隔离来源、公开版本更新后撤销旧凭证', async t => {
  const f = await fixture(t), first = await f.service.importPackage(await f.release('web', false));
  await f.successful(f.service.activate(first.itemId, 'preview', first.versionId)); await f.successful(f.service.activate(first.itemId, 'published', first.versionId));
  const launch = (await f.request(`/api/plaza/${first.itemId}/launch`, json('POST', {}))).body.data;
  const response = await fetch(f.base + launch.url), html = await response.text(); assert.ok(html.includes('/api/plaza/sdk.js')); assert.ok(html.includes('window.ActivityRuntime')); assert.match(response.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(f.base + launch.url.replace('index.html', 'main.js'))).status, 200);
  const second = await f.service.importPackage(await f.release('web', false)); await f.successful(f.service.activate(first.itemId, 'preview', second.versionId)); await f.successful(f.service.activate(first.itemId, 'published', second.versionId));
  assert.match((await f.request(`/api/plaza/${first.itemId}/runtime`, { headers: { 'x-activity-ticket': launch.runtime.ticket } })).body.message, /版本已更新/);
});

test('主站重启恢复已公开容器状态，中断的待发布构建可以重新进入预览', async t => {
  const f = await fixture(t), published = await f.service.importPackage(await f.release('live'));
  await f.successful(f.service.activate(published.itemId, 'preview', published.versionId)); await f.successful(f.service.activate(published.itemId, 'published', published.versionId));
  const pending = await f.service.importPackage(await f.release('pending'));
  f.db.prepare("UPDATE plaza_versions SET build_status='building',runtime_status='starting' WHERE id=?").run(pending.versionId);
  const restarted = createActivityService({ db: f.db, root: f.service.root, docker: f.docker });
  restarted.start(); await restarted.idle();
  assert.equal(restarted.version(published.versionId).runtime_status, 'running');
  assert.equal(restarted.version(pending.versionId).build_status, 'pending'); assert.match(restarted.version(pending.versionId).error, /中断/);
  const job = restarted.activate(pending.itemId, 'preview', pending.versionId); await restarted.idle(); assert.equal(job.status, 'completed', job.message); assert.equal(restarted.version(pending.versionId).runtime_status, 'running'); await restarted.stop();
});

test('后端代理支持中文身份、空 JSON、二进制和端口更新通知；WebSocket 正确转发并校验凭证', async t => {
  const f = await fixture(t), item = await f.service.importPackage(await f.release());
  await f.successful(f.service.activate(item.itemId, 'preview', item.versionId)); await f.successful(f.service.activate(item.itemId, 'published', item.versionId));
  const echo = createServer(async (req, res) => { const chunks = []; for await (const part of req) chunks.push(part); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ body: Buffer.concat(chunks).toString(), user: JSON.parse(Buffer.from(req.headers['x-activity-user'], 'base64url').toString()), path: req.url })); });
  echo.on('upgrade', (req, socket) => { const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`); socket.on('data', bytes => { if ((bytes[0] & 15) === 8) socket.end(Buffer.from([0x88, 0])); }); socket.on('error', () => {}); });
  echo.listen(0, '127.0.0.1'); await once(echo, 'listening'); f.setTarget({ host: '127.0.0.1', port: echo.address().port });
  t.after(() => { echo.closeAllConnections(); echo.close(); });
  const user = f.user('小站用户'), launch = (await f.request(`/api/plaza/${item.itemId}/launch`, { ...json('POST', {}), headers: { 'content-type': 'application/json', cookie: user.cookie } })).body.data;
  const auth = { 'x-activity-ticket': launch.runtime.ticket, cookie: user.cookie };
  const result = await f.request(`/api/plaza/${item.itemId}/backend/40001/api/echo?q=test`, { ...json('POST', {}), headers: { ...auth, 'content-type': 'application/json' } });
  assert.equal(result.body.body, '{}'); assert.equal(result.body.user.username, '小站用户'); assert.equal(result.body.path, '/api/echo?q=test');
  assert.equal((await f.request(`/api/plaza/${item.itemId}/backend/40001/bytes`, { method: 'POST', headers: { ...auth, 'content-type': 'application/octet-stream' }, body: 'binary' })).body.body, 'binary');
  await f.successful(f.service.changePort(item.itemId, item.versionId, 41000)); assert.equal((await f.request(`/api/plaza/${item.itemId}/runtime`, { headers: auth })).body.data.backendPort, 41000);
  assert.equal((await f.request(`/api/plaza/${item.itemId}/backend/40001/api/echo`, { headers: auth })).status, 409);
  const guest = (await f.request(`/api/plaza/${item.itemId}/launch`, json('POST', {}))).body.data;
  const ws = new WebSocket(f.base.replace('http:', 'ws:') + `/api/plaza/${item.itemId}/backend/41000/live?ticket=${guest.runtime.ticket}`);
  await new Promise((resolveOpen, reject) => { ws.onopen = resolveOpen; ws.onerror = reject; }); ws.close();
});

test('Docker 控制器仅清理对应标签资源，并转换容器挂载路径和使用共享网络', async () => {
  const id = randomUUID(), actions = [], label = 'com.personal-pages.plaza';
  const execute = async args => {
    actions.push(args);
    if (args[0] === 'container' && args[1] === 'inspect' && args[2] === process.env.HOSTNAME) return JSON.stringify([{ Image: 'main-image', Mounts: [{ Destination: '/app/data', Source: '/srv/pages/data' }] }]);
    if (args[1] === 'inspect') throw new Error('No such object');
    if (args[0] === 'ps') return '';
    if (args[0] === 'image' && args[1] === 'ls') return imageName(id);
    return '';
  };
  const docker = createDocker({ execute, inDocker: false });
  assert.deepEqual(docker.target({ id, backend_port: 40001 }), { host: '127.0.0.1', port: 40001 });
  await docker.build({ id, manifest: '{}' }, '/tmp/activity', () => {});
  assert.ok(actions.find(args => args[0] === 'build').includes(`${label}=${id}`));
  await docker.prune(new Set());
  const foreign = createDocker({ execute: async args => args[1] === 'inspect' ? JSON.stringify([{ Config: { Labels: {} }, State: { Running: true } }]) : '', inDocker: false });
  await assert.rejects(foreign.remove({ id }), /不属于/);
  const inside = createDocker({ execute, inDocker: true, network: 'personal-pages-activities' }); assert.equal(inside.target({ id }).host, containerName(id));
});

test('容器部署由 Docker 实际探测宿主端口，持久目录映射宿主路径，后端通过共享网络就绪', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'plaza-docker-command-')); t.after(async () => { assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep)); await rm(folder, { recursive: true, force: true }); });
  const id = randomUUID(), label = 'com.personal-pages.plaza', actions = [], manifest = '{}', backend_env = '{"CUSTOM":"yes"}', labels = { [label]: id, [`${label}.manifest`]: createHash('sha256').update(manifest).digest('hex'), [`${label}.environment`]: createHash('sha256').update(backend_env).digest('hex') };
  let container, image = true;
  const execute = async args => {
    actions.push(args);
    if (args[0] === 'container' && args[1] === 'inspect' && args[2] === process.env.HOSTNAME) return JSON.stringify([{ Image: 'main-image', Mounts: [{ Destination: folder, Source: '/srv/pages/data' }] }]);
    if (args[0] === 'container' && args[1] === 'inspect') { if (!container) throw new Error('No such container'); return JSON.stringify([container]); }
    if (args[0] === 'image' && args[1] === 'inspect') { if (!image) throw new Error('No such image'); return JSON.stringify([{ Config: { Labels: labels } }]); }
    if (args[0] === 'create') container = { Config: { Labels: Object.fromEntries(args.flatMap((arg, index) => arg === '--label' ? [args[index + 1].split(/=(.*)/s).slice(0, 2)] : [])) }, State: { Running: false }, HostConfig: { PortBindings: { '3000/tcp': [{ HostPort: '40001' }] } } };
    if (args[0] === 'start') container.State.Running = true;
    if (args[0] === 'stop') container.State.Running = false;
    if (args[0] === 'rm') container = null;
    if (args[0] === 'ps') return '';
    if (args[0] === 'image' && args[1] === 'ls') return image ? imageName(id) : '';
    if (args[0] === 'image' && args[1] === 'rm') image = false;
    return '';
  };
  const docker = createDocker({ execute, inDocker: true, network: 'activity-network', probe: async (host, port) => { assert.equal(host, containerName(id)); assert.equal(port, 3000); return true; } });
  assert.equal(await docker.free(40001), true);
  const probe = actions.find(args => args[0] === 'run'); assert.ok(probe.includes('--publish')); assert.ok(probe.includes('127.0.0.1:40001:3000')); assert.ok(!probe.includes('host'));
  const v = { id, backend_port: 40001, manifest };
  await docker.start(v, { id: 8, backend_env }, join(folder, 'game/storage/backend'));
  const create = actions.find(args => args[0] === 'create'); assert.ok(create.includes('type=bind,src=/srv/pages/data/game/storage/backend,dst=/activity-data')); assert.ok(create.includes('activity-network')); assert.ok(create.includes('CUSTOM=yes')); assert.ok(create.includes('HOST=0.0.0.0')); assert.equal(container.State.Running, true); assert.equal(docker.configured(container, v, { backend_env }), true, '真实创建参数必须保留配置标签，避免定时检查反复重启容器');
  await docker.stop(v, true); assert.equal(container, null); assert.equal(image, true);
  await docker.prune(new Set()); assert.equal(image, false, '没有容器的旧版镜像也应被清理');
});
