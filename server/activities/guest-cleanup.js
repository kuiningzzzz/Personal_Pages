import { readdir, lstat, rm, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
const age = 10 * 86400000;
// Only generated guest directories qualify. User and backend storage never do.
export async function cleanupGuests(root, now = Date.now()) {
    root = resolve(root); let removed = 0;
    async function latest(path) {
        const info = await lstat(path);
        if (info.isSymbolicLink()) return now;
        let time = info.mtimeMs;
        if (info.isDirectory()) for (const child of await readdir(path)) time = Math.max(time, await latest(join(path, child)));
        return time;
    }
    let activities; try { activities = await readdir(root); } catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
    const canonicalRoot = await realpath(root);
    for (const activity of activities) {
        const base = join(root, activity);
        if (!(await lstat(base)).isDirectory() || (await lstat(base)).isSymbolicLink()) continue;
        const users = join(base, 'storage', 'users');
        let info; try { info = await lstat(users); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (!info.isDirectory() || info.isSymbolicLink() || !(await realpath(users)).startsWith(canonicalRoot + sep)) continue;
        for (const name of await readdir(users)) {
            if (!/^guest-[a-f0-9-]{36}$/.test(name)) continue;
            const path = resolve(users, name);
            if (!path.startsWith(root + sep)) throw new Error('游客清理路径越界');
            if (await latest(path) < now - age) { await rm(path, { recursive: true, force: true }); removed++; }
        }
    }
    return removed;
}
