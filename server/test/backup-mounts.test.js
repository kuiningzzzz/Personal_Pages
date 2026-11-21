// Run in a transient systemd unit with two distinct ReadWritePaths. The probe
// requires a REAL EXDEV; an ordinary host-shell test cannot catch this bug.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm, access } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from '../sqlite.js';
import { createBackupStore, recoverRestore } from '../backups/store.js';
import { fileTransfers } from '../backups/transfers.js';

const enabled = !!process.env.BACKUP_MOUNT_DATA && !!process.env.BACKUP_MOUNT_PUBLIC;
test('真实 systemd 独立可写挂载：覆盖、增量、失败回滚与启动恢复', { skip: !enabled, timeout: 120000 }, async t => {
    async function fixture() {
        const dataBase = resolve(process.env.BACKUP_MOUNT_DATA), publicBase = resolve(process.env.BACKUP_MOUNT_PUBLIC);
        const data = await mkdtemp(join(dataBase, 'fixture-')), publicRoot = await mkdtemp(join(publicBase, 'fixture-'));
        const initialized = spawnSync(process.execPath, ['--input-type=module', '-e', "const m=await import('./db.js');m.cardDb.close();m.commentDb.close();"], {
            cwd: new URL('..', import.meta.url), env: { ...process.env, DATA_DIR: data, PUBLIC_DIR: publicRoot }, encoding: 'utf8'
        });
        assert.equal(initialized.status, 0, initialized.stderr);
        const card = new Database(join(data, 'card.sqlite')), comment = new Database(join(data, 'comment.sqlite'));
        const store = createBackupStore({ cardDb: card, commentDb: comment, dataRoot: data, publicRoot, maintenance: work => work() });
        t.after(async () => {
            while (store.busy()) await new Promise(resolve => setTimeout(resolve, 10));
            card.close(); comment.close();
            assert.ok(data.startsWith(dataBase + sep) && publicRoot.startsWith(publicBase + sep));
            await rm(data, { recursive: true, force: true }); await rm(publicRoot, { recursive: true, force: true });
        });
        async function file(name, value) { const path = join(publicRoot, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, value); return path; }
        async function wait(job, success = true) {
            const deadline = Date.now() + 60000;
            while (store.busy() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
            assert.equal(store.busy(), false); assert.equal(job.status, success ? 'completed' : 'failed', job.message); return job.result;
        }
        return { data, publicRoot, card, store, file, wait };
    }
    const source = await fixture(), target = await fixture();
    await writeFile(join(source.data, 'probe'), 'probe');
    await assert.rejects(rename(join(source.data, 'probe'), join(source.publicRoot, 'probe')), error => error.code === 'EXDEV');
    await rm(join(source.data, 'probe'));
    const date = new Date().toISOString();
    const id = Number(source.card.prepare("INSERT INTO entries(kind,resource_kind,title,body,status,published_at,created_at,updated_at) VALUES('resource','document','saved article','body','published',?,?,?)").run(date, date, date).lastInsertRowid);
    await source.file('favicon.png', 'saved icon'); await source.file('picture/folder/image.txt', 'saved image');
    await target.file('favicon.png', 'previous icon'); await target.file('picture/folder/image.txt', 'previous image');
    const generated = await source.wait(source.store.generate()), archive = (await source.store.get(generated.id)).path;
    await target.wait(target.store.restore(archive, 'overwrite'));
    assert.equal(await readFile(join(target.publicRoot, 'favicon.png'), 'utf8'), 'saved icon');
    assert.equal(await readFile(join(target.publicRoot, 'picture/folder/image.txt'), 'utf8'), 'saved image');
    await target.file('source/current.txt', 'keep'); await source.file('source/new.txt', 'new');
    const next = await source.wait(source.store.generate());
    await target.wait(target.store.restore((await source.store.get(next.id)).path, 'merge'));
    assert.equal(await readFile(join(target.publicRoot, 'source/current.txt'), 'utf8'), 'keep');
    assert.equal(await readFile(join(target.publicRoot, 'source/new.txt'), 'utf8'), 'new');
    await target.file('favicon.png', 'current icon'); await target.file('picture/folder/image.txt', 'current image');
    target.card.prepare('UPDATE entries SET title=? WHERE id=?').run('current article', id);
    const prepare = target.card.prepare.bind(target.card);
    target.card.prepare = sql => { if (sql.startsWith('INSERT INTO backup_state')) throw new Error('simulated commit failure'); return prepare(sql); };
    await target.wait(target.store.restore(archive, 'overwrite'), false); target.card.prepare = prepare;
    assert.equal(await readFile(join(target.publicRoot, 'favicon.png'), 'utf8'), 'current icon');
    assert.equal(await readFile(join(target.publicRoot, 'picture/folder/image.txt'), 'utf8'), 'current image');
    assert.equal(target.card.prepare('SELECT title FROM entries WHERE id=?').get(id).title, 'current article');
    const work = join(target.data, '.backup-recover-mount'), old = join(work, 'rollback/0'), live = join(target.publicRoot, 'favicon.png');
    await mkdir(join(old, '..'), { recursive: true }); await fileTransfers.backup(live, old); await writeFile(live, 'interrupted');
    await writeFile(join(target.data, 'restore-journal.json'), JSON.stringify({ id: 'interrupted-mount', work, additions: [], moves: [{ target: live, old, existed: true }] }));
    await recoverRestore(target.data, target.publicRoot);
    assert.equal(await readFile(live, 'utf8'), 'current icon'); await assert.rejects(access(join(target.data, 'restore-journal.json')));
});
