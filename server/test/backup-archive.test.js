import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Zip, ZipPassThrough, zipSync, strToU8 } from 'fflate';
import { extractArchive, writeArchive } from '../backups/archive.js';
import { BACKUP_LIMITS } from '../../shared/backup-limits.js';

// Reproduce the old generator exactly: stored, unknown-length entries with
// data descriptors. A signature-scanning extractor mistakes nested ZIPs here.
export function legacyZip(entries) {
    const chunks = [];
    const zip = new Zip((error, bytes) => { if (error) throw error; chunks.push(Buffer.from(bytes)); });
    for (const [name, bytes] of entries) {
        const file = new ZipPassThrough(name); zip.add(file); file.push(bytes, true);
    }
    zip.end(); return Buffer.concat(chunks);
}
async function temporary(t) {
    const root = await mkdtemp(join(tmpdir(), 'backup-archive-'));
    t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'backup-archive-'))); return rm(root, { recursive: true, force: true }); }); return root;
}
test('旧格式嵌套 ZIP 的内部文件头不再被当成外层文件，附件字节保持不变', async t => {
    const root = await temporary(t), inner = zipSync({ 'manifest.json': strToU8('inner'), 'notes.txt': strToU8('notes') }, { level: 0 });
    const path = join(root, 'legacy.zip');
    await writeFile(path, legacyZip([['manifest.json', strToU8('outer')], ['public/source/material.zip', inner]]));
    const files = await extractArchive(path, join(root, 'out'));
    assert.deepEqual([...files.keys()], ['manifest.json', 'public/source/material.zip']);
    assert.deepEqual(await readFile(files.get('public/source/material.zip').path), Buffer.from(inner));
});
test('ZIP64 流式生成与提取，截断 ZIP64 仍拒绝', async t => {
    const root = await temporary(t), source = join(root, 'source'), path = join(root, '64.zip');
    await writeFile(source, 'source data');
    await writeArchive(path, [{ name: 'public/source/data.txt', path: source }], () => {}, { forceZip64Format: true });
    const bytes = await readFile(path); assert.ok(bytes.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06])));
    assert.equal(await readFile((await extractArchive(path, join(root, 'out'))).get('public/source/data.txt').path, 'utf8'), 'source data');
    await writeFile(join(root, 'truncated.zip'), bytes.subarray(0, -25));
    await assert.rejects(extractArchive(join(root, 'truncated.zip'), join(root, 'truncated')));
});
test('真正重复、大小写重复、文件与父目录冲突均明确拒绝', async t => {
    const root = await temporary(t);
    const variants = [['a', 'a'], ['A', 'a'], ['a', 'a/b'], ['a/b', 'a']];
    for (let i = 0; i < variants.length; i++) {
        const path = join(root, `${i}.zip`); await writeFile(path, legacyZip(variants[i].map(name => [name, strToU8('x')])));
        await assert.rejects(extractArchive(path, join(root, `out-${i}`)), /重复路径|文件和目录冲突/);
    }
});
test('数量和展开容量限制分开报告；校验 CRC，拒绝被修改的存储文件', async t => {
    const root = await temporary(t), path = join(root, 'limit.zip');
    await writeFile(path, legacyZip([['a', strToU8('one')], ['b', strToU8('two')]]));
    await assert.rejects(extractArchive(path, join(root, 'count'), { limits: { ...BACKUP_LIMITS, files: 1 } }), /文件数量超过 1/);
    await assert.rejects(extractArchive(path, join(root, 'bytes'), { limits: { ...BACKUP_LIMITS, expandedBytes: 2 } }), /解压后超过/);
    const corrupt = legacyZip([['payload', strToU8('DO-NOT-ALTER')]]); corrupt[corrupt.indexOf('DO-NOT-ALTER')] ^= 1;
    await writeFile(join(root, 'corrupt.zip'), corrupt);
    await assert.rejects(extractArchive(join(root, 'corrupt.zip'), join(root, 'bad-crc')), /校验失败/);
});
test('读入文件失败或写出容量超限会中止流，不挂住任务', { timeout: 5000 }, async t => {
    const root = await temporary(t);
    await assert.rejects(writeArchive(join(root, 'missing.zip'), [{ name: 'missing', path: join(root, 'missing') }]));
    await writeFile(join(root, 'data'), 'data');
    await assert.rejects(writeArchive(join(root, 'limit.zip'), [{ name: 'data', path: join(root, 'data') }], () => {}, { limits: { ...BACKUP_LIMITS, uploadBytes: 10 } }), /备份包超过/);
});
