import { spawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { createHash } from 'node:crypto';

const label = 'com.personal-pages.plaza';
const hash = value => createHash('sha256').update(value).digest('hex');
const suffix = id => { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('活动版本标识无效'); return id.replaceAll('-', ''); };
export const containerName = id => `pp-plaza-${suffix(id)}`;
export const imageName = id => `pp-plaza/${suffix(id)}:release`;
export const portAvailable = port => new Promise(resolvePort => {
    const server = createServer(); server.once('error', () => resolvePort(false));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolvePort(true)));
});

export function createDocker({ inDocker = process.env.ACTIVITIES_IN_DOCKER === '1', network = process.env.ACTIVITIES_DOCKER_NETWORK || '', execute, probe = reachable }) {
    const executable = process.env.DOCKER_BIN || (process.platform === 'win32' && existsSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe') ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker');
    const run = execute || ((args, { log = () => {}, timeout = 20 * 60 * 1000 } = {}) => new Promise((resolveRun, reject) => {
        let output = '', settled = false;
        const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => { child.kill(); finish(new Error('Docker 操作超时')); }, timeout);
        const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolveRun(result); };
        for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { const text = bytes.toString(); output = (output + text).slice(-16000); log(text); });
        child.once('error', () => finish(new Error('无法连接 Docker，请检查 Docker 已启动且主站可使用 Docker 客户端/套接字')));
        child.once('exit', code => { const error = code === 0 ? null : new Error(output.trim() || `Docker 操作失败：${code}`); if (error) error.exitCode = code; finish(error, output.trim()); });
    }));
    const inspect = async (kind, name) => { try { return JSON.parse(await run([kind, 'inspect', name], { timeout: 10000 }))[0]; } catch (error) { if (/no such|not found/i.test(error.message)) return null; throw error; } };
    async function hostPath(path) {
        if (!inDocker) return resolve(path);
        const self = await inspect('container', process.env.HOSTNAME);
        const mount = self?.Mounts?.filter(m => resolve(path).startsWith(resolve(m.Destination) + sep) || resolve(path) === resolve(m.Destination)).sort((a, b) => b.Destination.length - a.Destination.length)[0];
        if (!mount?.Source) throw new Error('活动数据目录必须挂载到 Docker 宿主机目录');
        return `${mount.Source.replace(/\/$/, '')}/${relative(mount.Destination, path).split(sep).join('/')}`;
    }
    async function free(port) {
        if (!Number.isSafeInteger(port) || port < 40000 || port > 65535) return false;
        // Let the daemon reserve the host mapping, including Docker Desktop's
        // host forwarding. Container-local sockets cannot detect host conflicts.
        if (inDocker) {
            const self = await inspect('container', process.env.HOSTNAME);
            if (!self?.Image) throw new Error('无法获取主站容器信息');
            try { await run(['run', '--rm', '--publish', `127.0.0.1:${port}:3000`, '--entrypoint', 'node', '--label', `${label}.port-probe=true`, self.Image, '-e', 'process.exit(0)'], { timeout: 15000 }); return true; }
            catch (error) { if (/allocated|address already in use|ports are not available|bind:/i.test(error.message)) return false; throw error; }
        }
        return portAvailable(port);
    }
    async function owned(version) {
        const info = await inspect('container', containerName(version.id));
        if (info && info.Config?.Labels?.[label] !== version.id) throw new Error('同名容器不属于该活动，拒绝操作');
        return info;
    }
    async function stop(version, remove = false) {
        const info = await owned(version); if (!info) return;
        if (info.State?.Running) await run(['stop', '--time', '10', containerName(version.id)], { timeout: 20000 });
        if (remove) await run(['rm', containerName(version.id)], { timeout: 15000 });
    }
    async function build(version, directory, log) {
        const present = await inspect('image', imageName(version.id));
        if (present && present.Config?.Labels?.[label] !== version.id) throw new Error('同名镜像不属于该活动，拒绝覆盖');
        if (present?.Config?.Labels?.[`${label}.manifest`] === hash(version.manifest)) return;
        await run(['build', '--label', `${label}=${version.id}`, '--label', `${label}.manifest=${hash(version.manifest)}`, '--tag', imageName(version.id), '--file', join(directory, 'backend', 'Dockerfile'), join(directory, 'backend')], { log });
    }
    async function imageReady(version) { const image = await inspect('image', imageName(version.id)); return image?.Config?.Labels?.[label] === version.id && image?.Config?.Labels?.[`${label}.manifest`] === hash(version.manifest); }
    function configured(info, version, item) { return Number(info?.HostConfig?.PortBindings?.['3000/tcp']?.[0]?.HostPort) === version.backend_port && info?.Config?.Labels?.[`${label}.environment`] === hash(item.backend_env) && info?.Config?.Labels?.[`${label}.manifest`] === hash(version.manifest); }
    async function start(version, item, storage) {
        let info = await owned(version);
        if (info && (!info.State?.Running || !configured(info, version, item))) { await stop(version, true); info = null; }
        if (!info) {
            await mkdir(storage, { recursive: true });
            const args = ['create', '--name', containerName(version.id), '--label', `${label}=${version.id}`, '--label', `${label}.item=${item.id}`, '--label', `${label}.environment=${hash(item.backend_env)}`,
                '--label', `${label}.manifest=${hash(version.manifest)}`, '--publish', `127.0.0.1:${version.backend_port}:3000`, '--memory', '512m', '--cpus', '1', '--pids-limit', '256', '--security-opt', 'no-new-privileges',
                '--mount', `type=bind,src=${await hostPath(storage)},dst=/activity-data`];
            if (network) args.push('--network', network);
            for (const [key, value] of Object.entries(JSON.parse(item.backend_env))) args.push('--env', `${key}=${value}`);
            args.push('--env', 'PORT=3000', '--env', 'HOST=0.0.0.0', '--env', 'ACTIVITY_DATA_DIR=/activity-data', imageName(version.id));
            await run(args); info = await owned(version);
        }
        if (!info?.State?.Running) await run(['start', containerName(version.id)], { timeout: 30000 });
        const host = inDocker ? containerName(version.id) : '127.0.0.1', port = inDocker ? 3000 : version.backend_port;
        if (inDocker && !network) throw new Error('容器部署主站需配置 ACTIVITIES_DOCKER_NETWORK');
        for (let i = 0; i < 100; i++) {
            const current = await owned(version);
            if (!current?.State?.Running) throw new Error('活动后端启动后退出，请检查 PORT=3000、HOST=0.0.0.0 和 Dockerfile');
            if (await probe(host, port)) return;
            await new Promise(r => setTimeout(r, 300));
        }
        throw new Error('活动后端未能在 3000 端口就绪');
    }
    async function remove(version) {
        await stop(version, true);
        const image = await inspect('image', imageName(version.id));
        if (image && image.Config?.Labels?.[label] !== version.id) throw new Error('同名镜像不属于该活动，拒绝删除');
        if (image) await run(['image', 'rm', imageName(version.id)], { timeout: 20000 });
    }
    async function prune(validIds) {
        const ids = (await run(['ps', '-a', '--filter', `label=${label}`, '--format', '{{.ID}}'], { timeout: 15000 })).split(/\s+/).filter(Boolean);
        for (const id of ids) {
            const info = await inspect('container', id), versionId = info?.Config?.Labels?.[label];
            if (versionId && !validIds.has(versionId)) await remove({ id: versionId });
        }
        const images = (await run(['image', 'ls', '--filter', `label=${label}`, '--format', '{{.Repository}}:{{.Tag}}'], { timeout: 15000 })).split(/\s+/).filter(Boolean);
        for (const name of images) {
            const info = await inspect('image', name), versionId = info?.Config?.Labels?.[label];
            if (versionId && !validIds.has(versionId)) await remove({ id: versionId });
        }
    }
    return { free, build, imageReady, configured, start, stop, remove, prune, inspect: owned, target: v => ({ host: inDocker ? containerName(v.id) : '127.0.0.1', port: inDocker ? 3000 : v.backend_port }) };
}
const reachable = (host, port) => new Promise(resolveReachable => {
    const socket = createConnection({ host, port }); let done = false;
    const finish = result => { if (done) return; done = true; socket.destroy(); resolveReachable(result); };
    socket.setTimeout(500); socket.once('connect', () => finish(true)); socket.once('timeout', () => finish(false)); socket.once('error', () => finish(false));
});
