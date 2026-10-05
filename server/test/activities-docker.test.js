// Opt-in integration check; normal test runs never require or modify Docker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Database from '../sqlite.js';
import { migrateActivities } from '../activities/schema.js';
import { migrateUsers } from '../auth/schema.js';
import { createActivityService } from '../activities/service.js';
import { createActivityRoutes } from '../activities/routes.js';
import { createDocker } from '../activities/docker.js';
import { releaseActivity } from '../../activities/release.js';

test('真实 Docker：构建、限时启动、端口修改、版本共享存档、代理及完整清理', {
    skip: process.env.ACTIVITIES_DOCKER_TEST !== '1', timeout: 240000
}, async () => {
    const parent = resolve(process.env.ACTIVITIES_TEST_ROOT || tmpdir());
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, 'plaza-real-docker-'));
    const db = new Database(':memory:'); db.exec('PRAGMA foreign_keys=ON'); migrateActivities(db); migrateUsers(db);
    const docker = createDocker({}); let time = Date.parse('2026-10-05T00:00:00Z');
    const service = createActivityService({ db, root: join(root, 'data/activities'), docker, clock: () => time });
    const routes = createActivityRoutes({ service, secret: 'isolated-docker-test', clock: () => time, sdkPath: fileURLToPath(new URL('../activities/sdk.js', import.meta.url)) });
    const app = express(); app.use(express.json()); app.use('/api/plaza', routes.publicRoutes);
    const server = app.listen(0, '0.0.0.0'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`, versions = [];
    const success = async job => { await service.idle(); assert.equal(job.status, 'completed', job.message); };
    const request = async (path, options) => { const res = await fetch(base + path, options); assert.equal(res.status, 200, await res.clone().text()); return res.json(); };
    try {
        const directory = join(root, 'dev/real-check'); await mkdir(join(directory, 'frontend'), { recursive: true }); await mkdir(join(directory, 'backend'));
        await writeFile(join(directory, 'config.json'), JSON.stringify({ id: 'real-check', frontend: 'static', backend: true }));
        await writeFile(join(directory, 'frontend/index.html'), '<html><head></head><body>Docker integration</body></html>');
        const image = process.env.ACTIVITIES_TEST_BASE_IMAGE || 'node:24-bookworm-slim';
        assert.match(image, /^[a-zA-Z0-9._/:@-]+$/);
        await writeFile(join(directory, 'backend/Dockerfile'), `FROM ${image}\nWORKDIR /activity\nCOPY server.mjs .\nENTRYPOINT ["node"]\nCMD ["server.mjs"]\n`);
        await writeFile(join(directory, 'backend/server.mjs'), `import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const file=path.join(process.env.ACTIVITY_DATA_DIR,'counter.json');
http.createServer((req,res)=>{let n=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):0;if(req.url.startsWith('/increment')){n++;fs.writeFileSync(file,JSON.stringify(n));}res.setHeader('content-type','application/json');res.end(JSON.stringify({count:n,path:req.url,user:JSON.parse(Buffer.from(req.headers['x-activity-user']||'e30','base64url').toString()),port:process.env.PORT,custom:process.env.CUSTOM}));}).listen(Number(process.env.PORT),process.env.HOST);`);
        const first = await service.importPackage(await releaseActivity('real-check', root)); versions.push(service.version(first.versionId));
        const metadata = overrides => ({ ...service.item(first.itemId), tags: [], ...overrides });
        service.save(first.itemId, metadata({ title: '真实 Docker 验证', backend_env: { CUSTOM: 'works' }, schedule: 'timed', starts_at: '2026-10-06T00:00:00Z', ends_at: '2026-10-07T00:00:00Z' }));
        await success(service.activate(first.itemId, 'preview', first.versionId));
        let current = service.version(first.versionId), info = await docker.inspect(current);
        assert.ok(info.State.Running); assert.equal(docker.configured(info, current, service.item(first.itemId)), true);
        assert.equal(await docker.free(current.backend_port), false, '运行中的宿主机映射不能被再次分配');
        await success(service.activate(first.itemId, 'published', first.versionId));
        assert.equal((await docker.inspect(current)).State.Running, false); assert.equal(await docker.imageReady(current), true);
        time = Date.parse('2026-10-06T12:00:00Z'); service.reconcile(); await service.idle();
        assert.ok((await docker.inspect(current)).State.Running);
        const launch = (await request(`/api/plaza/${first.itemId}/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).data;
        const headers = { 'x-activity-ticket': launch.runtime.ticket };
        const fetchBackend = async path => request(`/api/plaza/${first.itemId}/backend/${service.version(first.versionId).backend_port}${path}`, { headers });
        const result = await fetchBackend('/increment'); assert.equal(result.count, 1); assert.equal(result.custom, 'works'); assert.equal(result.port, '3000');
        const started = (await docker.inspect(current)).State.StartedAt;
        service.reconcile(); await service.idle(); assert.equal((await docker.inspect(current)).State.StartedAt, started, '定时检查不得重启健康容器');
        let port = current.backend_port + 1; while (!await docker.free(port)) port++;
        await success(service.changePort(first.itemId, first.versionId, port)); current = service.version(first.versionId);
        assert.equal(current.backend_port, port); assert.equal((await fetchBackend('/counter')).count, 1);
        const second = await service.importPackage(await releaseActivity('real-check', root)); versions.push(service.version(second.versionId));
        await success(service.activate(first.itemId, 'preview', second.versionId)); assert.ok((await docker.inspect(current)).State.Running);
        await assert.rejects(service.validatePort(first.itemId, first.versionId, service.version(second.versionId).backend_port), /占用/);
        await success(service.activate(first.itemId, 'published', second.versionId)); assert.equal((await docker.inspect(current)).State.Running, false);
        const next = (await request(`/api/plaza/${first.itemId}/launch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).data;
        assert.equal((await request(`/api/plaza/${first.itemId}/backend/${next.runtime.backendPort}/counter`, { headers: { 'x-activity-ticket': next.runtime.ticket } })).count, 1);
        await success(service.remove(first.itemId));
        for (const v of versions) { assert.equal(await docker.inspect(v), null); assert.equal(await docker.imageReady(v), false); }
        await assert.rejects(access(join(root, 'data/activities/real-check')));
        console.log('真实 Docker 验证完成：' + (process.env.ACTIVITIES_IN_DOCKER === '1' ? '主站容器 + 共享网络 + 宿主映射' : '主站原生进程 + 宿主映射'));
    } finally {
        await service.stop();
        for (const v of versions) await docker.remove(v);
        server.closeAllConnections(); await new Promise(r => server.close(r)); db.close();
        assert.ok(resolve(root).startsWith(parent + sep)); await rm(root, { recursive: true, force: true });
    }
});
