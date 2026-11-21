import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileTransfers } from '../backups/transfers.js';

test('EXDEV 回退处理文件和目录，回滚复制成功后仍保留完整副本', async t => {
    const root = await mkdtemp(join(tmpdir(), 'backup-transfers-'));
    t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'backup-transfers-'))); return rm(root, { recursive: true, force: true }); });
    const first = join(root, 'first'), second = join(root, 'second'); await mkdir(first); await mkdir(second);
    const transfers = createFileTransfers({ renamePath: async (a, b) => {
        if (a.startsWith(first) !== b.startsWith(first)) throw Object.assign(new Error('cross mount'), { code: 'EXDEV' });
        return rename(a, b);
    } });
    await writeFile(join(first, 'favicon.png'), 'original');
    await transfers.backup(join(first, 'favicon.png'), join(second, 'old'));
    await assert.rejects(access(join(first, 'favicon.png')));
    assert.equal(await readFile(join(second, 'old'), 'utf8'), 'original');
    await writeFile(join(second, 'incoming'), 'new'); await transfers.install(join(second, 'incoming'), join(first, 'favicon.png'));
    assert.equal(await readFile(join(first, 'favicon.png'), 'utf8'), 'new');
    await rm(join(first, 'favicon.png')); await transfers.restore(join(second, 'old'), join(first, 'favicon.png'));
    assert.equal(await readFile(join(first, 'favicon.png'), 'utf8'), 'original');
    assert.equal(await readFile(join(second, 'old'), 'utf8'), 'original');
    await mkdir(join(first, 'folder')); await writeFile(join(first, 'folder', 'a'), 'A');
    await transfers.backup(join(first, 'folder'), join(second, 'old-folder'));
    await transfers.restore(join(second, 'old-folder'), join(first, 'folder'));
    assert.equal(await readFile(join(first, 'folder', 'a'), 'utf8'), 'A');
    assert.equal(await readFile(join(second, 'old-folder', 'a'), 'utf8'), 'A');
});

test('复制旧版本中途失败，不删除原件，也不把半份回滚副本标记为完整', async t => {
    const root = await mkdtemp(join(tmpdir(), 'backup-transfers-'));
    t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'backup-transfers-'))); return rm(root, { recursive: true, force: true }); });
    const source = join(root, 'original'), target = join(root, 'rollback'); await writeFile(source, 'complete original');
    const transfers = createFileTransfers({
        renamePath: async () => { throw Object.assign(new Error('cross mount'), { code: 'EXDEV' }); },
        copyPath: async (_source, destination) => { await writeFile(destination, 'partial'); throw new Error('模拟复制失败'); }
    });
    await assert.rejects(transfers.backup(source, target), /复制失败/);
    assert.equal(await readFile(source, 'utf8'), 'complete original');
    await assert.rejects(access(target));
    assert.equal(await readFile(target + '.partial', 'utf8'), 'partial');
});
