import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { extractArchive, safeName } from '../backups/archive.js';

export const validIdentifier = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(value) && value !== 'imports' && !/^external-\d+$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value);
export function validateConfig(config, identifier) {
    if (!config || !validIdentifier(config.id) || config.id !== identifier) throw new Error('config.json 的 id 必须与工程目录名一致（小写字母、数字、连字符）');
    if (!['static', 'vue'].includes(config.frontend) || typeof config.backend !== 'boolean') throw new Error('frontend 必须为 static 或 vue，backend 必须为布尔值');
    return { id: config.id, frontend: config.frontend, backend: config.backend };
}
export async function projectFiles(root, prefix = '') {
    const files = [];
    for (const item of await readdir(root, { withFileTypes: true })) {
        if (['node_modules', '.git', '.env', '.env.local', 'coverage', '.DS_Store'].includes(item.name) || item.name.startsWith('.env.')) continue;
        const path = join(root, item.name), name = prefix ? `${prefix}/${item.name}` : item.name;
        safeName(name); const info = await lstat(path);
        if (info.isSymbolicLink()) throw new Error(`不允许打包符号链接：${name}`);
        if (info.isDirectory()) files.push(...await projectFiles(path, name));
        else if (info.isFile()) files.push({ name, path, size: info.size });
    }
    return files;
}
export async function unpackActivity(path, directory) {
    const files = await extractArchive(path, directory), meta = files.get('activity.json');
    if (!meta || meta.size > 8 * 1024 ** 2) throw new Error('缺少 activity.json 发布清单');
    let manifest; try { manifest = JSON.parse(await readFile(meta.path, 'utf8')); } catch { throw new Error('活动清单无法读取'); }
    if (manifest.format !== 'personal-pages-activity' || manifest.schemaVersion !== 1 || !validIdentifier(manifest.id) || !/^[a-z0-9._-]{1,100}$/i.test(manifest.version) || typeof manifest.backend !== 'boolean' || !['static', 'vue'].includes(manifest.frontend) || !Array.isArray(manifest.files)) throw new Error('活动发布清单格式无效');
    if (manifest.entry !== 'frontend/index.html' || !files.has(manifest.entry)) throw new Error('网页包必须包含 frontend/index.html');
    if (files.size !== manifest.files.length + 1) throw new Error('活动包文件数量与清单不一致');
    const seen = new Set();
    for (const item of manifest.files) {
        safeName(item.name);
        if (seen.has(item.name) || !/^(frontend|backend)\//.test(item.name) || item.name.split('/').some(n => n === '.env' || n.startsWith('.env.') || n === 'node_modules' || n === '.git')) throw new Error('活动包包含重复文件、敏感文件或非法目录');
        if (!manifest.backend && item.name.startsWith('backend/')) throw new Error('无后端活动不能包含后端代码');
        const file = files.get(item.name);
        if (!file || file.size !== item.size || file.sha256 !== item.sha256) throw new Error(`文件校验失败：${item.name}`);
        seen.add(item.name);
    }
    if (manifest.backend && !files.has('backend/Dockerfile')) throw new Error('启用后端的活动必须包含 backend/Dockerfile');
    return manifest;
}
export function contained(root, path) { return resolve(path).startsWith(resolve(root) + sep); }
