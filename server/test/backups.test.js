import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { createHash, randomUUID } from 'node:crypto';
import Database from '../sqlite.js';
import { createBackupStore, recoverRestore } from '../backups/store.js';
import { extractArchive, safeName } from '../backups/archive.js';
import { snapshot } from '../backups/database.js';
import { createBackupRoutes } from '../backups/routes.js';
import express from 'express';

async function fixture(t) {
    const folder = await mkdtemp(join(tmpdir(), 'pages-backup-'));
    const data = join(folder, 'data'), publicRoot = join(folder, 'public');
    await mkdir(data); await mkdir(publicRoot);
    const initialized = spawnSync(process.execPath, ['--input-type=module', '-e', "const m=await import('./db.js');m.cardDb.close();m.commentDb.close();"], {
        cwd: new URL('..', import.meta.url), env: { ...process.env, DATA_DIR: data, PUBLIC_DIR: publicRoot }, encoding: 'utf8'
    });
    assert.equal(initialized.status, 0, initialized.stderr + initialized.stdout);
    const card = new Database(join(data, 'card.sqlite')), comment = new Database(join(data, 'comment.sqlite'));
    card.exec('PRAGMA foreign_keys=ON'); comment.exec('PRAGMA foreign_keys=ON');
    const store = createBackupStore({ cardDb: card, commentDb: comment, dataRoot: data, publicRoot, maintenance: work => work() });
    t.after(async () => {
        while (store.busy()) await new Promise(r => setTimeout(r, 10));
        card.close(); comment.close();
        assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep) && folder.includes('pages-backup-'));
        await rm(folder, { recursive: true, force: true });
    });
    async function file(name, bytes) { const path = join(folder, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); return path; }
    const wait = async job => {
        for (let i = 0; i < 2000 && job.status === 'running'; i++) await new Promise(r => setTimeout(r, 10));
        assert.notEqual(job.status, 'running', '备份任务应结束'); return job;
    };
    const successful = async job => { await wait(job); assert.equal(job.status, 'completed', job.message); return job.result; };
    return { folder, data, publicRoot, card, comment, store, file, wait, successful };
}
async function seed(f) {
    const { card: db } = f;
    const type = Number(db.prepare('INSERT INTO resource_types(name,slug,display_order) VALUES(?,?,?)').run('课程资料', 'course', 8).lastInsertRowid);
    const add = (title, kind, parent = null, body = '') => Number(db.prepare("INSERT INTO entries(kind,resource_kind,title,parent_id,resource_type_id,body,status,published_at,created_at,updated_at) VALUES('resource',?,?,?,?,?,'published','2026-10-01','2026-10-01','2026-10-01')").run(kind, title, parent, type, body).lastInsertRowid);
    const collection = add('课程合集', 'collection'), nested = add('子合集', 'collection', collection);
    const article = add('第一课', 'document', collection, '[源资料](/source/course.pdf) ![图](/picture/course.png)');
    const child = add('第二课', 'document', nested), gallery = add('图集', 'gallery', collection);
    db.prepare('INSERT INTO gallery_images(entry_id,url,caption) VALUES(?,?,?)').run(gallery, '/picture/course.png', '一张图');
    db.prepare("INSERT INTO entries(kind,format,title,body,pinned,status,published_at,created_at,updated_at) VALUES('moment','short','短帖','测试短帖',1,'published','2026-10-01','2026-10-01','2026-10-01')").run();
    const user = Number(db.prepare('INSERT INTO users(username,username_key,email,password_hash,created_at,is_owner) VALUES(?,?,?,?,?,1)').run('站主', '站主', 'one@example.com', 'stored-password-hash', '2026-10-01').lastInsertRowid);
    const visitor = Number(db.prepare('INSERT INTO users(username,username_key,email,password_hash,created_at) VALUES(?,?,?,?,?)').run('访客', '访客', 'two@example.com', 'visitor-password-hash', '2026-10-02').lastInsertRowid);
    const root = Number(db.prepare('INSERT INTO entry_comments(entry_id,user_id,body,created_at) VALUES(?,?,?,?)').run(article, user, '根评论', '2026-10-02').lastInsertRowid);
    const reply = Number(db.prepare('INSERT INTO entry_comments(entry_id,user_id,root_id,reply_to_id,reply_to_name,body,created_at) VALUES(?,?,?,?,?,?,?)').run(article, visitor, root, root, '站主', '回复内容', '2026-10-03').lastInsertRowid);
    db.prepare('INSERT INTO comment_likes VALUES(?,?)').run(reply, user);
    const report = Number(db.prepare('INSERT INTO comment_reports(comment_id,reporter_id,entry_id,author_name,author_email,body,entry_title,entry_path,reasons,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(reply, user, article, '访客', 'two@example.com', '回复内容', '第一课', `/entry/${article}`, '["其他描述"]', '2026-10-03').lastInsertRowid);
    db.prepare("INSERT INTO discussion_mail_queue(kind,comment_id,report_id,user_id) VALUES('report',?,?,?)").run(reply, report, user);
    db.prepare("INSERT INTO subscriptions(user_id,scope,target_id,enabled) VALUES(?,'collection',?,1)").run(user, collection);
    const feedback = Number(db.prepare("INSERT INTO visitor_feedback(user_id,username,email,category,body,created_at) VALUES(?,?,?,'bug','测试反馈',12345)").run(user, '站主', 'one@example.com').lastInsertRowid);
    db.prepare('INSERT INTO feedback_images(feedback_id,filename,name,mime_type,size) VALUES(?,?,?,?,?)').run(feedback, 'screen.png', '截图.png', 'image/png', 7);
    db.prepare('INSERT INTO home_tracks(title,artist,url) VALUES(?,?,?)').run('音乐', '歌手', '/source/song.mp3');
    db.prepare("UPDATE profile SET name='测试小站',avatar='/picture/course.png' WHERE id=1").run();
    db.prepare("INSERT INTO announcements(title,body,status,pinned,published_at,created_at,updated_at) VALUES('公告','公告正文','published',1,'2026-10-01','2026-10-01','2026-10-01')").run();
    const tag = Number(db.prepare("INSERT INTO announcement_tags(name) VALUES('更新日志')").run().lastInsertRowid);
    db.prepare('INSERT INTO announcement_tag_links VALUES(1,?)').run(tag);
    db.prepare("INSERT INTO ai_tasks(id,title,prompt,collection_id,settings,status,result_entry_id,created_at,updated_at) VALUES('task-a','课程学习','解释课程',?,'{}','queued',?,'2026-10-03','2026-10-03')").run(collection, article);
    db.prepare("INSERT INTO ai_task_files(task_id,url,name,kind) VALUES('task-a','/source/course.pdf','course.pdf','pdf')").run();
    db.prepare('INSERT INTO ai_collection_sessions(collection_id,session_id) VALUES(?,?)').run(collection, `learning-collection-${collection}-workspace`);
    db.prepare("INSERT INTO managed_uploads(url) VALUES('/picture/course.png'),('/source/course.pdf'),('/source/song.mp3')").run();
    f.comment.prepare("INSERT INTO comments(page_id,username,email,content) VALUES('home','老访客','old@example.com','旧评论')").run();
    await f.file('public/source/course.pdf', 'PDF source'); await f.file('public/source/song.mp3', 'MP3 track'); await f.file('public/picture/course.png', 'picture');
    await f.file('public/favicon.png', 'hardcoded-favicon'); await f.file('public/music-sw.js', 'hardcoded-worker');
    await f.file('data/feedback/images/screen.png', 'private');
    await f.file(`data/ai/collections/${collection}/workspace/reports/notes.md`, '# 学习笔记');
    await f.file(`data/ai/collections/${collection}/harness/session.json`, JSON.stringify({ id: `learning-collection-${collection}-workspace`, messages: ['历史上下文'] }));
    return { type, collection, nested, article, child, gallery, user, visitor, root, reply };
}

test('完整备份、覆盖还原和历史下载删除：保留所有内容关系及文件，自动保存还原前版本', async t => {
    const f = await fixture(t), ids = await seed(f);
    const generated = await f.successful(f.store.generate());
    assert.equal((await f.store.list()).length, 1);
    const row = await f.store.get(generated.id), zip = unzipSync(await readFile(row.path));
    const manifest = JSON.parse(strFromU8(zip['manifest.json']));
    assert.ok(manifest.files.some(r => r.name.includes('/workspace/reports/notes.md')));
    assert.ok(!manifest.files.some(r => r.name.includes('backups/') || r.name.includes('favicon') || r.name.includes('music-sw')));
    assert.equal(JSON.parse(strFromU8(zip['databases/card.json'])).tables.users[0].values.password_hash, 'stored-password-hash');
    f.card.prepare("UPDATE entries SET title='被改掉' WHERE id=?").run(ids.article);
    f.card.prepare("INSERT INTO users(username,username_key,email,password_hash,created_at) VALUES('新用户','新用户','extra@example.com','hash','2026-10-04')").run();
    await f.file('public/source/course.pdf', 'changed'); await f.file('public/picture/extra.png', 'extra');
    await f.file('data/feedback/images/extra.png', 'extra');
    const restored = await f.successful(f.store.restore(row.path, 'overwrite'));
    assert.ok(restored.safetyBackup);
    assert.equal((await f.store.list()).length, 2);
    assert.equal(f.card.prepare('SELECT title FROM entries WHERE id=?').get(ids.article).title, '第一课');
    assert.equal(f.card.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
    assert.equal(f.card.prepare('SELECT root_id FROM entry_comments WHERE id=?').get(ids.reply).root_id, ids.root);
    assert.equal(f.card.prepare('SELECT COUNT(*) AS n FROM comment_likes').get().n, 1);
    assert.equal(f.comment.prepare('SELECT content FROM comments').get().content, '旧评论');
    assert.equal(await readFile(join(f.publicRoot, 'source/course.pdf'), 'utf8'), 'PDF source');
    assert.deepEqual(await readdir(join(f.publicRoot, 'picture')), ['course.png']);
    assert.deepEqual(await readdir(join(f.data, 'feedback/images')), ['screen.png']);
    assert.equal(await readFile(join(f.publicRoot, 'favicon.png'), 'utf8'), 'hardcoded-favicon');
    assert.equal(f.card.prepare('SELECT status FROM ai_tasks').get().status, 'cancelled');
    assert.equal(f.card.prepare('SELECT status FROM discussion_mail_queue').get().status, 'skipped');
    // Reinstalled triggers still publish future content and enforce pin limits.
    const events = f.card.prepare('SELECT COUNT(*) AS n FROM subscription_events').get().n;
    f.card.prepare("INSERT INTO entries(kind,title,status,published_at,created_at,updated_at) VALUES('moment','还原后的新动态','published','2026-10-04','2026-10-04','2026-10-04')").run();
    assert.equal(f.card.prepare('SELECT COUNT(*) AS n FROM subscription_events').get().n, events + 1);
    await f.store.delete(row.id); assert.equal((await f.store.list()).length, 1);
    await assert.rejects(f.store.get(row.id), /不存在/);
});

test('增量还原处理编号、用户名和文件冲突；保留当前修改，重复导入不重复生成内容', async t => {
    const source = await fixture(t), target = await fixture(t); const ids = await seed(source);
    const saved = await source.successful(source.store.generate()); const archive = (await source.store.get(saved.id)).path;
    target.card.prepare("INSERT INTO users(username,username_key,email,password_hash,created_at,is_owner) VALUES('站主','站主','current@example.com','current-hash','2026-10-04',1)").run();
    const type = Number(target.card.prepare("INSERT INTO resource_types(name,slug) VALUES('已有分类','current')").run().lastInsertRowid);
    target.card.prepare("INSERT INTO entries(kind,resource_kind,title,resource_type_id,published_at,created_at,updated_at) VALUES('resource','collection','已有合集',?,'2026-10-04','2026-10-04','2026-10-04')").run(type);
    await target.file('public/source/course.pdf', 'current PDF'); await target.file('public/picture/course.png', 'current picture');
    const result = await target.successful(target.store.restore(archive, 'merge'));
    assert.ok(result.importedRecords > 0);
    const imported = target.card.prepare("SELECT * FROM entries WHERE title='第一课'").get(), parent = target.card.prepare("SELECT * FROM entries WHERE title='课程合集'").get();
    assert.notEqual(parent.id, ids.collection); assert.equal(imported.parent_id, parent.id);
    assert.notEqual(parent.resource_type_id, type);
    const owner = target.card.prepare("SELECT * FROM users WHERE email='one@example.com'").get();
    assert.notEqual(owner.id, ids.user); assert.ok(owner.username.startsWith('站主_')); assert.equal(owner.is_owner, 0);
    assert.equal(target.card.prepare('SELECT username FROM users WHERE id=1').get().username, '站主');
    assert.equal(target.card.prepare("SELECT user_id FROM entry_comments WHERE body='根评论'").get().user_id, owner.id);
    assert.equal(target.card.prepare("SELECT target_id FROM subscriptions WHERE user_id=? AND scope='collection'").get(owner.id).target_id, parent.id);
    assert.equal(target.card.prepare('SELECT entry_path FROM comment_reports').get().entry_path, `/entry/${imported.id}`);
    assert.match(imported.body, /course-import-[a-f0-9]+\.pdf/);
    assert.equal(await readFile(join(target.publicRoot, 'source/course.pdf'), 'utf8'), 'current PDF');
    const url = imported.body.match(/\[源资料\]\(([^)]+)\)/)[1];
    assert.equal(await readFile(join(target.publicRoot, url.slice(1)), 'utf8'), 'PDF source');
    assert.equal(await readFile(join(target.data, `ai/collections/${parent.id}/workspace/reports/notes.md`), 'utf8'), '# 学习笔记');
    assert.equal(JSON.parse(await readFile(join(target.data, `ai/collections/${parent.id}/harness/session.json`), 'utf8')).id, `learning-collection-${parent.id}-workspace`);
    target.card.prepare("UPDATE entries SET body='当前修改必须保留' WHERE id=?").run(imported.id);
    const before = snapshot(target.card); const fileCount = (await readdir(join(target.publicRoot, 'source'))).length;
    await target.successful(target.store.restore(archive, 'merge'));
    assert.equal(target.card.prepare('SELECT body FROM entries WHERE id=?').get(imported.id).body, '当前修改必须保留');
    for (const table of Object.keys(before.tables)) assert.equal(snapshot(target.card).tables[table].length, before.tables[table].length, table);
    assert.equal((await readdir(join(target.publicRoot, 'source'))).length, fileCount);
    assert.deepEqual(target.card.prepare('PRAGMA foreign_key_check').all(), []);
});

test('活动版本、合集、标签、代码与存档进入备份，增量还原正确映射用户和外部活动目录', async t => {
    const source = await fixture(t), target = await fixture(t);
    const user = Number(source.card.prepare("INSERT INTO users(username,username_key,email,password_hash,created_at) VALUES('活动访客','活动访客','player@example.com','hash','2026-10-05')").run().lastInsertRowid);
    const tag = Number(source.card.prepare("INSERT INTO plaza_tags(name) VALUES('小游戏')").run().lastInsertRowid);
    const collection = Number(source.card.prepare("INSERT INTO plaza_items(kind,source,state,title,created_at,updated_at) VALUES('collection','external','published','游戏合集','2026-10-05','2026-10-05')").run().lastInsertRowid);
    const version = randomUUID();
    const game = Number(source.card.prepare("INSERT INTO plaza_items(kind,identifier,state,parent_id,title,tags,published_version_id,created_at,updated_at) VALUES('activity','lesson-game','published',?,'课堂小游戏',?,?,'2026-10-05','2026-10-05')").run(collection, JSON.stringify([tag]), version).lastInsertRowid);
    source.card.prepare("INSERT INTO plaza_versions(id,item_id,version,manifest,backend_enabled,backend_port,build_status,runtime_status,created_at) VALUES(?,?,'release-a','{}',1,40001,'ready','running','2026-10-05')").run(version, game);
    const external = Number(source.card.prepare("INSERT INTO plaza_items(kind,source,state,title,external_url,created_at,updated_at) VALUES('activity','external','published','外部活动','https://example.com/','2026-10-05','2026-10-05')").run().lastInsertRowid);
    await source.file(`data/activities/lesson-game/versions/${version}/frontend/index.html`, 'game page');
    await source.file(`data/activities/lesson-game/versions/${version}/backend/Dockerfile`, 'FROM node:24');
    await source.file('data/activities/lesson-game/storage/backend/progress.json', '{"score":8}');
    await source.file(`data/activities/lesson-game/storage/users/user-${user}/save.json`, '{"level":2}');
    await source.file(`data/activities/external-${external}/storage/users/user-${user}/save.json`, '{"level":3}');
    const saved = await source.successful(source.store.generate()), archive = (await source.store.get(saved.id)).path;
    source.card.prepare("UPDATE plaza_items SET title='改名' WHERE id=?").run(game);
    await source.successful(source.store.restore(archive, 'overwrite'));
    assert.equal(source.card.prepare('SELECT title FROM plaza_items WHERE id=?').get(game).title, '课堂小游戏');
    assert.equal(source.card.prepare('SELECT runtime_status FROM plaza_versions WHERE id=?').get(version).runtime_status, 'stopped');
    target.card.prepare("INSERT INTO users(username,username_key,email,password_hash,created_at) VALUES('原有用户','原有用户','current@example.com','hash','2026-10-06')").run();
    target.card.prepare("INSERT INTO plaza_tags(name) VALUES('其他')").run();
    target.card.prepare("INSERT INTO plaza_items(kind,source,title,created_at,updated_at) VALUES('collection','external','原有合集','2026-10-06','2026-10-06')").run();
    await target.file('data/activities/lesson-game/storage/users/user-1/save.json', 'current save');
    await target.successful(target.store.restore(archive, 'merge'));
    const imported = target.card.prepare("SELECT * FROM plaza_items WHERE identifier='lesson-game'").get(), owner = target.card.prepare("SELECT id FROM users WHERE email='player@example.com'").get().id;
    const importedTag = target.card.prepare("SELECT id FROM plaza_tags WHERE name='小游戏'").get().id, externalId = target.card.prepare("SELECT id FROM plaza_items WHERE title='外部活动'").get().id;
    assert.notEqual(imported.parent_id, collection); assert.deepEqual(JSON.parse(imported.tags), [importedTag]); assert.notEqual(importedTag, tag);
    assert.equal(target.card.prepare('SELECT item_id FROM plaza_versions WHERE id=?').get(version).item_id, imported.id);
    assert.equal(await readFile(join(target.data, `activities/lesson-game/storage/users/user-${owner}/save.json`), 'utf8'), '{"level":2}');
    assert.equal(await readFile(join(target.data, 'activities/lesson-game/storage/users/user-1/save.json'), 'utf8'), 'current save');
    assert.equal(await readFile(join(target.data, `activities/external-${externalId}/storage/users/user-${owner}/save.json`), 'utf8'), '{"level":3}');
    assert.equal(await readFile(join(target.data, `activities/lesson-game/versions/${version}/frontend/index.html`), 'utf8'), 'game page');
    await target.successful(target.store.restore(archive, 'merge'));
    assert.equal(target.card.prepare('SELECT COUNT(*) AS n FROM plaza_versions').get().n, 1);
});

function tamper(bytes, change) {
    const files = unzipSync(bytes); change(files);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    manifest.files = Object.entries(files).filter(([name]) => name !== 'manifest.json').map(([name, bytes]) => ({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
    files['manifest.json'] = strToU8(JSON.stringify(manifest)); return zipSync(files);
}
test('损坏、截断、路径越界及关系错误的备份不能删除或修改当前数据', async t => {
    const f = await fixture(t); await seed(f); const saved = await f.successful(f.store.generate()); const valid = await readFile((await f.store.get(saved.id)).path);
    const variations = [Buffer.from('invalid zip'), valid.subarray(0, valid.length - 30),
        tamper(valid, files => { files['../outside.txt'] = strToU8('unsafe'); }),
        tamper(valid, files => { const data = JSON.parse(strFromU8(files['databases/card.json'])); data.tables.entry_comments[0].values.entry_id = 999999; files['databases/card.json'] = strToU8(JSON.stringify(data)); }),
        tamper(valid, files => { const data = JSON.parse(strFromU8(files['databases/card.json'])); const entry = data.tables.entries.find(r => r.values.resource_kind === 'collection'); entry.values.parent_id = entry.values.id; files['databases/card.json'] = strToU8(JSON.stringify(data)); }),
        (() => { const files = unzipSync(valid); delete files['public/source/course.pdf']; return zipSync(files); })()];
    const before = JSON.stringify(snapshot(f.card).tables), pdf = await readFile(join(f.publicRoot, 'source/course.pdf'));
    for (let i = 0; i < variations.length; i++) {
        const bad = await f.file(`bad-${i}.zip`, variations[i]); const job = await f.wait(f.store.restore(bad, 'overwrite'));
        assert.equal(job.status, 'failed', `invalid package ${i}`);
        assert.equal(JSON.stringify(snapshot(f.card).tables), before);
        assert.deepEqual(await readFile(join(f.publicRoot, 'source/course.pdf')), pdf);
        assert.equal((await f.store.list()).length, 1, '失败的校验不应进入替换或自动备份阶段');
    }
});

test('备份接口可上传、轮询、下载、删除，并拒绝无效模式和非备份文件', async t => {
    const f = await fixture(t); await seed(f);
    const app = express(); app.use('/api/admin/backups', createBackupRoutes(f.store));
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
    const base = `http://127.0.0.1:${server.address().port}/api/admin/backups`;
    const generated = await fetch(base, { method: 'POST' }); assert.equal(generated.status, 202);
    await f.successful(f.store.jobView());
    const saved = (await (await fetch(base)).json()).data[0];
    const download = await fetch(`${base}/${saved.id}/download`); assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /attachment/);
    const bytes = await download.arrayBuffer(), form = new FormData(); form.append('mode', 'merge'); form.append('file', new Blob([bytes]), 'backup.zip');
    const uploaded = await fetch(`${base}/restore`, { method: 'POST', body: form }); assert.equal(uploaded.status, 202, await uploaded.text());
    await f.successful(f.store.jobView());
    const invalid = new FormData(); invalid.append('mode', 'invalid'); invalid.append('file', new Blob([bytes]), 'backup.zip');
    assert.equal((await fetch(`${base}/restore`, { method: 'POST', body: invalid })).status, 400);
    assert.equal((await fetch(`${base}/${saved.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/${saved.id}/download`)).status, 400);
});

test('启动时恢复未提交的文件替换，已经提交的数据不会被回退', async t => {
    const f = await fixture(t); await seed(f);
    const work = join(f.data, '.backup-recovery'), target = join(f.publicRoot, 'picture/course.png'), old = join(work, 'rollback/0');
    await mkdir(join(old, '..'), { recursive: true }); await copyFile(target, old); await writeFile(target, 'interrupted content');
    await writeFile(join(f.data, 'restore-journal.json'), JSON.stringify({ id: 'uncommitted', work, moves: [{ target, old, existed: true }], additions: [] }));
    await recoverRestore(f.data, f.publicRoot); assert.equal(await readFile(target, 'utf8'), 'picture');
    await mkdir(join(old, '..'), { recursive: true }); await copyFile(target, old); await writeFile(target, 'committed content');
    f.card.prepare("INSERT INTO backup_state VALUES('restore','committed')").run();
    await writeFile(join(f.data, 'restore-journal.json'), JSON.stringify({ id: 'committed', work, moves: [{ target, old, existed: true }], additions: [] }));
    await recoverRestore(f.data, f.publicRoot); assert.equal(await readFile(target, 'utf8'), 'committed content');
});

test('文件已替换但数据库提交失败时，两份数据库和文件一起回滚', async t => {
    const f = await fixture(t), ids = await seed(f);
    const saved = await f.successful(f.store.generate()), archive = (await f.store.get(saved.id)).path;
    f.card.prepare("UPDATE entries SET title='还原前当前版本' WHERE id=?").run(ids.article);
    f.comment.prepare("UPDATE comments SET content='还原前旧评论'").run();
    await f.file('public/source/course.pdf', 'current source');
    await f.file('public/picture/current-only.png', 'current picture');
    const before = JSON.stringify(snapshot(f.card).tables);
    const prepare = f.card.prepare.bind(f.card);
    f.card.prepare = sql => {
        if (sql.startsWith('INSERT INTO backup_state')) throw new Error('模拟数据库提交失败');
        return prepare(sql);
    };
    const job = await f.wait(f.store.restore(archive, 'overwrite'));
    f.card.prepare = prepare;
    assert.equal(job.status, 'failed'); assert.match(job.message, /模拟数据库提交失败/);
    assert.equal(JSON.stringify(snapshot(f.card).tables), before);
    assert.equal(f.comment.prepare('SELECT content FROM comments').get().content, '还原前旧评论');
    assert.equal(await readFile(join(f.publicRoot, 'source/course.pdf'), 'utf8'), 'current source');
    assert.equal(await readFile(join(f.publicRoot, 'picture/current-only.png'), 'utf8'), 'current picture');
    assert.equal((await f.store.list()).length, 2, '还原前的自动备份应继续保留');
});

test('路径校验兼顾 Windows 和 Linux，不能导入绝对路径或保留设备名', () => {
    for (const value of ['../x', 'public/../x', '/tmp/x', 'C:/x', 'public\\x', 'public/nul.txt', 'public/x.']) assert.throws(() => safeName(value));
    assert.equal(safeName('public/source/课件.pdf'), 'public/source/课件.pdf');
});
