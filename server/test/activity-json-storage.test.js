import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { readJsonRecord, writeJsonRecord, storageName, listJsonRecords } from '../activities/json-storage.js';
async function fixture(t) { const folder = await mkdtemp(join(tmpdir(), 'activity-json-')); t.after(() => { assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep)); return rm(folder, { recursive: true, force: true }); }); return folder; }
test('兼容旧存档；按版本更新，旧版本不会覆盖内容，删除后可重新创建', async t => {
  const folder = await fixture(t);
  await writeFile(join(folder, storageName('old')), JSON.stringify({ key: 'old', value: { level: 3 } }));
  const old = await readJsonRecord(folder, 'old'); assert.deepEqual(old.value, { level: 3 }); assert.ok(old.revision);
  const next = await writeJsonRecord(folder, 'old', { level: 4 }, { expectedRevision: old.revision });
  await assert.rejects(writeJsonRecord(folder, 'old', {}, { expectedRevision: old.revision }), { status: 409 });
  await assert.rejects(writeJsonRecord(folder, 'old', null, { remove: true, expectedRevision: old.revision }), { status: 409 });
  await writeJsonRecord(folder, 'old', null, { remove: true, expectedRevision: next.revision });
  assert.deepEqual(await readJsonRecord(folder, 'old'), { value: null, revision: null });
  const recreated = await writeJsonRecord(folder, 'old', {}, { expectedRevision: null }); assert.notEqual(recreated.revision, next.revision);
});
test('JSON 大小、总容量、文件数和键名边界；原子保存失败不破坏已有文件', async t => {
  const folder = await fixture(t);
  await writeJsonRecord(folder, '../outside', { safe: true }); assert.equal((await readdir(folder)).length, 1);
  assert.throws(() => storageName(''), /1～100/); assert.throws(() => storageName('a'.repeat(101)), /1～100/);
  await assert.rejects(writeJsonRecord(folder, 'large', 'x'.repeat(512 * 1024)), /512KB/);
  await assert.rejects(writeJsonRecord(folder, 'space', 'x'.repeat(300), { maxBytes: 100 }), /空间已满/);
  await assert.rejects(writeJsonRecord(folder, 'files', {}, { maxFiles: 1 }), /数量/);
  assert.deepEqual((await readJsonRecord(folder, '../outside')).value, { safe: true });
  assert.ok((await readdir(folder)).every(name => name.endsWith('.json')));
});
test('共享记录分页过滤、排序、删除和响应大小限制', async t => {
  const folder = await fixture(t);
  for (const key of ['score-c', 'unrelated', 'score-a', 'score-b']) await writeJsonRecord(folder, key, { key });
  const first = await listJsonRecords(folder, { prefix: 'score-', limit: 2 });
  assert.deepEqual(first.entries.map(entry => entry.key), ['score-a', 'score-b']); assert.equal(first.cursor, 'score-b');
  const second = await listJsonRecords(folder, { prefix: 'score-', cursor: first.cursor, limit: 2 }); assert.deepEqual(second.entries.map(entry => entry.key), ['score-c']); assert.equal(second.cursor, null);
  await assert.rejects(listJsonRecords(folder, { limit: 51 }), /分页/);
  await writeJsonRecord(folder, 'large-a', 'x'.repeat(450 * 1024)); await writeJsonRecord(folder, 'large-b', 'x'.repeat(450 * 1024));
  const large = await listJsonRecords(folder, { prefix: 'large-' }); assert.equal(large.entries.length, 1); assert.equal(large.cursor, 'large-a');
});
