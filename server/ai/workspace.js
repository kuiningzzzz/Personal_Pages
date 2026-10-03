import { resolve, relative, isAbsolute } from 'node:path';
import { realpath, readFile, stat } from 'node:fs/promises';

export const collectionWorkspace = (root, collectionId) => resolve(root, 'collections', String(collectionId), 'workspace');
export const reportFile = taskId => `reports/${taskId}.md`;
export function within(root, target) {
    const path = relative(resolve(root), resolve(target));
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..\\') && !path.startsWith('../'));
}
export async function readWorkspaceReport(root, file) {
    if (typeof file !== 'string' || !file.trim() || !/\.md$/i.test(file)) throw new Error('请指定工作区中的 Markdown 文件');
    const path = resolve(root, file);
    if (!within(root, path)) throw new Error('报告必须位于当前合集的工作区内');
    const [canonicalRoot, canonical] = await Promise.all([realpath(root), realpath(path)]);
    if (!within(canonicalRoot, canonical)) throw new Error('报告路径越界');
    const info = await stat(canonical);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('报告需为不超过 10 MB 的 Markdown 文件');
    return readFile(canonical, 'utf8');
}
