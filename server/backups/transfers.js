import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

async function copyTree(source, destination) {
    await cp(source, destination, {
        recursive: true, force: false, errorOnExist: true,
        // A restore must never turn a link into an out-of-root read or write.
        async filter(path) {
            const info = await lstat(path);
            if (!info.isFile() && !info.isDirectory()) throw new Error('还原不支持符号链接或特殊文件');
            return true;
        }
    });
}
const removeTree = path => rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

export function createFileTransfers({ renamePath = rename, copyPath = copyTree, removePath = removeTree } = {}) {
    async function direct(source, destination) {
        try { await renamePath(source, destination); return true; }
        catch (error) { if (error.code === 'EXDEV') return false; throw error; }
    }
    return {
        async backup(source, destination) {
            if (await direct(source, destination)) return;
            // The journal treats existence of `destination` as a complete old
            // version. Never publish a partial copy at that path.
            const partial = destination + '.partial';
            await copyPath(source, partial);
            await renamePath(partial, destination);
            await removePath(source);
        },
        async install(source, destination) {
            if (await direct(source, destination)) return;
            // The old version is already journaled; maintenance keeps partial
            // new content inaccessible until commit or rollback.
            await copyPath(source, destination);
            await removePath(source);
        },
        async restore(source, destination) {
            await mkdir(dirname(destination), { recursive: true });
            if (await direct(source, destination)) return;
            // Retain the COMPLETE rollback source until the journal is removed.
            // A crash midway through deleting a directory must not leave a
            // partial backup which a later recovery would mistake for complete.
            await copyPath(source, destination);
        }
    };
}
export const fileTransfers = createFileTransfers();
