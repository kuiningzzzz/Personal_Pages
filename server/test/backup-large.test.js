// Opt-in disk/scale regressions. Never read or restore production site data.
// BACKUP_LARGE_TEST=1 node --max-old-space-size=384 --test test/backup-large.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, stat, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeArchive, extractArchive, digest } from '../backups/archive.js';

const enabled = process.env.BACKUP_LARGE_TEST === '1';
test('真实大包：超过2GB的ZIP、超过4GB的单文件，384MB堆内流式读写', { skip: !enabled, timeout: 1200000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'backup-large-'));
    t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'backup-large-'))); return rm(root, { recursive: true, force: true }); });
    const entries = [];
    for (const [name, size] of [['media.mp4', 2 * 1024 ** 3 + 16 * 1024 ** 2], ['data.bin', 4 * 1024 ** 3 + 65536]]) {
        const path = join(root, name), file = await open(path, 'wx');
        await file.truncate(size); await file.write(Buffer.from('large-file-start'), 0, 16, 0); await file.write(Buffer.from('end!'), 0, 4, size - 4); await file.close();
        entries.push({ name: 'public/source/' + name, path, size });
    }
    const path = join(root, 'large.zip'); await writeArchive(path, entries);
    assert.ok((await stat(path)).size > 2 * 1024 ** 3);
    const files = await extractArchive(path, join(root, 'extracted'));
    for (const source of entries) {
        const file = files.get(source.name); assert.equal(file.size, source.size); assert.equal(file.sha256, await digest(source.path));
        assert.equal((await stat(file.path)).size, source.size);
    }
    t.diagnostic(`ZIP ${(await stat(path)).size} bytes; expanded ${entries.reduce((sum, entry) => sum + entry.size, 0)} bytes; max RSS ${process.resourceUsage().maxRSS} KiB`);
});
test('真实多文件：65536个文件触发ZIP64目录计数，突破旧60000阈值', { skip: !enabled, timeout: 1200000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'backup-many-'));
    t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'backup-many-'))); return rm(root, { recursive: true, force: true }); });
    const source = join(root, 'empty'); await writeFile(source, '');
    const entries = Array.from({ length: 65536 }, (_, i) => ({ name: `public/picture/image-${i}.png`, path: source, size: 0 }));
    const path = join(root, 'many.zip'); await writeArchive(path, entries);
    const files = await extractArchive(path, join(root, 'extracted'));
    assert.equal(files.size, entries.length);
    assert.equal(files.get(entries.at(-1).name).size, 0);
    t.diagnostic(`extracted ${files.size} files; max RSS ${process.resourceUsage().maxRSS} KiB`);
});
