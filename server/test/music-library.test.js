import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../sqlite.js';
import { migrateHomeMusic, homePlaylists, savePlaylists, validatePlaylists } from '../home-music.js';
import { searchSongs } from '../../src/lib/music-library.js';
import { handleMusicSpace } from '../../src/lib/music-shortcuts.js';

test('旧单级歌单升级保留歌曲编号、顺序，重启不再创建歌单', () => {
    const db = new Database(':memory:');
    try {
        db.exec(`PRAGMA foreign_keys=ON;
            CREATE TABLE home_tracks(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,artist TEXT NOT NULL DEFAULT '',url TEXT NOT NULL,display_order INTEGER NOT NULL DEFAULT 0);
            INSERT INTO home_tracks(id,title,url,display_order) VALUES(7,'后来','/source/b.mp3',1),(9,'起点','/source/a.mp3',0)`);
        migrateHomeMusic(db);
        const lists = homePlaylists(db);
        assert.equal(lists.length, 1); assert.equal(lists[0].title, '我的歌单');
        assert.deepEqual(lists[0].tracks.map(track => track.id), [9, 7]);
        migrateHomeMusic(db); assert.deepEqual(homePlaylists(db), lists);
        db.transaction(() => savePlaylists(db, []))(); migrateHomeMusic(db);
        assert.deepEqual(homePlaylists(db), [], '主动删除歌单后，重启不重新创建');
    } finally { db.close(); }
});

test('多歌单排序、跨歌单移动保留编号；重复歌曲编号及无效输入拒绝保存', () => {
    const db = new Database(':memory:');
    try {
        db.exec('PRAGMA foreign_keys=ON'); migrateHomeMusic(db);
        const input = [{ title: '日常', tracks: [{ title: '甲', url: '/source/a.mp3' }, { title: '乙', url: '/source/b.mp3' }] },
            { title: '游戏', tracks: [{ title: '丙', url: '/source/c.mp3' }] }];
        assert.equal(validatePlaylists(input), null);
        db.transaction(() => savePlaylists(db, input))();
        const saved = homePlaylists(db), [a, b] = saved[0].tracks, [c] = saved[1].tracks;
        const reordered = [{ ...saved[1], tracks: [b, c] }, { ...saved[0], tracks: [a] }];
        db.transaction(() => savePlaylists(db, reordered))();
        assert.deepEqual(homePlaylists(db), reordered);
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
        assert.ok(validatePlaylists([{ ...saved[0], tracks: [a] }, { ...saved[1], tracks: [a] }]));
        assert.ok(validatePlaylists([saved[0], saved[0]]));
        assert.ok(validatePlaylists([{ title: ' ', tracks: [] }]));
        assert.ok(validatePlaylists([{ title: '无效', tracks: [{ title: '外链', url: 'https://example.com/a.mp3' }] }]));
        assert.ok(validatePlaylists(Array.from({ length: 21 }, () => ({ title: '歌单', tracks: [] }))));
        assert.ok(validatePlaylists([{ title: '过多', tracks: Array.from({ length: 101 }, () => ({ title: '歌', url: '/source/a.mp3' })) }]));
        db.prepare('DELETE FROM home_playlists WHERE id=?').run(saved[1].id);
        assert.deepEqual(homePlaylists(db)[0].tracks, [a], '删除歌单只清除所属歌曲');
    } finally { db.close(); }
});

test('跨歌单搜索支持歌名、歌手、多个关键词，保留歌单和歌曲位置', () => {
    const lists = [{ id: 10, title: '轻音乐', tracks: [{ id: 1, title: '雨后', artist: 'Alice' }] },
        { id: 20, title: '游戏', tracks: [{ id: 2, title: '开始', artist: 'Bob' }, { id: 3, title: '雨后序曲', artist: 'ALICE' }] }];
    assert.deepEqual(searchSongs(lists, ' 雨后 alice ').map(row => [row.playlistId, row.index]), [[10, 0], [20, 1]]);
    assert.deepEqual(searchSongs(lists, '游戏')[1].track, lists[1].tracks[1]);
    assert.deepEqual(searchSongs(lists, '不存在'), []); assert.deepEqual(searchSongs(lists, ' '), []);
});

test('空格控制音乐并阻止滚动；输入、控件、组合键和长按不会误触发', () => {
    let toggles = 0;
    const send = overrides => {
        const event = { code: 'Space', key: ' ', target: { closest: () => null }, prevented: false,
            preventDefault() { this.prevented = true; }, ...overrides };
        handleMusicSpace(event, () => toggles++); return event;
    };
    assert.equal(send().prevented, true); assert.equal(toggles, 1);
    assert.equal(send({ repeat: true }).prevented, true); assert.equal(toggles, 1);
    for (const flag of ['isComposing', 'ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'defaultPrevented']) assert.equal(send({ [flag]: true }).prevented, false);
    assert.equal(send({ target: { isContentEditable: true } }).prevented, false);
    assert.equal(send({ target: { closest: () => ({ tagName: 'INPUT' }) } }).prevented, false);
    assert.equal(send({ composedPath: () => [{ closest: () => ({ tagName: 'BUTTON' }) }, {}] }).prevented, false);
    assert.equal(send({ code: 'KeyA', key: 'a' }).prevented, false); assert.equal(toggles, 1);
});
