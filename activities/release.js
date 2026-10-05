import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { projectFiles, validateConfig, validIdentifier } from '../server/activities/package.js';
import { digest, writeArchive } from '../server/backups/archive.js';

const workspace = dirname(fileURLToPath(import.meta.url));
export async function releaseActivity(id, root = workspace, build = defaultBuild) {
    if (!validIdentifier(id)) throw new Error('请提供活动工程标识符，如 node activities/release.js wordle');
    const project = join(root, 'dev', id), config = validateConfig(JSON.parse(await readFile(join(project, 'config.json'), 'utf8')), id);
    const frontend = join(project, 'frontend');
    if (config.frontend === 'vue') await build(frontend);
    const files = await projectFiles(config.frontend === 'vue' ? join(frontend, 'dist') : frontend, 'frontend');
    if (!files.some(f => f.name === 'frontend/index.html')) throw new Error('前端缺少 index.html');
    if (config.backend) {
        const backend = await projectFiles(join(project, 'backend'), 'backend');
        if (!backend.some(f => f.name === 'backend/Dockerfile')) throw new Error('后端缺少 Dockerfile');
        files.push(...backend);
    }
    const version = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const manifest = { format: 'personal-pages-activity', schemaVersion: 1, ...config, version, entry: 'frontend/index.html', createdAt: new Date().toISOString(), files: [] };
    for (const f of files) manifest.files.push({ name: f.name, size: f.size, sha256: await digest(f.path) });
    const release = join(root, 'release'); await mkdir(release, { recursive: true });
    const temporary = join(release, `.${id}-${version}.json`), output = join(release, `${id}-${version}.zip`);
    const serialized = JSON.stringify(manifest, null, 2); if (Buffer.byteLength(serialized) > 8 * 1024 ** 2) throw new Error('活动清单超过 8MB，请减少包内文件数量');
    try {
        await writeFile(temporary, serialized);
        await writeArchive(`${output}.partial`, [{ name: 'activity.json', path: temporary }, ...files]);
        await rename(`${output}.partial`, output); return output;
    } finally { await rm(temporary, { force: true }); await rm(`${output}.partial`, { force: true }); }
}
async function defaultBuild(cwd) {
    await new Promise((resolveBuild, reject) => {
        const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolveBuild() : reject(new Error(`前端构建失败：${code}`)));
    });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) releaseActivity(process.argv[2]).then(path => process.stdout.write(`发布包已生成：${path}\n`)).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
