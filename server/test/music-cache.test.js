import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { queueIndex, musicTime } from '../../src/lib/music-queue.js';
import { migrateHomeMusic, homePlaylist, validatePlaylist, savePlaylist, homeWelcome, validateWelcome, saveWelcome } from '../home-music.js';
import Database from '../sqlite.js';

const workerSource = await readFile(new URL('../../public/music-sw.js', import.meta.url), 'utf8');
function worker(fetcher) {
    const listeners = {}, stored = new Map();
    let requests = 0;
    const cache = {
        match: async url => stored.has(url) ? new Response(stored.get(url), { headers: { 'Content-Type': 'audio/mpeg' } }) : undefined,
        put: async (url, response) => { stored.set(url, new Uint8Array(await response.arrayBuffer())); },
        keys: async () => [...stored.keys()].map(url => new Request(url)),
        delete: async request => stored.delete(typeof request === 'string' ? request : request.url),
    };
    vm.runInNewContext(workerSource, {
        self: { location: { origin: 'https://site.example' }, addEventListener: (name, handler) => { listeners[name] = handler; } },
        caches: { open: async () => cache }, URL, Request, Response, Headers, Map, Set,
        fetch: async (...args) => { requests++; return fetcher(...args); },
    });
    const get = (url, range) => {
        let response; const waits = [];
        listeners.fetch({ request: new Request(url, { headers: range ? { range } : {} }),
            respondWith: promise => { response = promise; }, waitUntil: promise => waits.push(promise) });
        return { response, waits };
    };
    const message = data => { const waits = []; listeners.message({ data, waitUntil: p => waits.push(p) }); return Promise.all(waits); };
    return { stored, get, message, requests: () => requests };
}

test('冷请求先流式播放，边播放边缓存；后续完整重播与 Range 拖动均不再请求网络', async () => {
    let stream;
    const f = worker(async () => new Response(new ReadableStream({ start(controller) { stream = controller; controller.enqueue(new Uint8Array([1, 2, 3])); } }),
        { headers: { 'Content-Type': 'audio/mpeg' } }));
    const url = 'https://site.example/source/test.mp3';
    const first = f.get(url, 'bytes=0-');
    assert.equal(first.waits.length, 1, '同步延长 Worker 事件生命周期，流式响应返回后继续完成缓存');
    const response = await first.response;
    const reader = response.body.getReader();
    assert.deepEqual([...(await reader.read()).value], [1, 2, 3]);
    assert.equal(f.stored.size, 0, '播放首段时无需等整首下载');
    const prefetch = f.message({ type: 'MUSIC_PREFETCH', url });
    stream.enqueue(new Uint8Array([4, 5, 6])); stream.close();
    assert.deepEqual([...(await reader.read()).value], [4, 5, 6]); await reader.read();
    await Promise.all(first.waits); await prefetch;
    assert.equal(f.requests(), 1, '预取与正在进行的下载合并');
    const repeated = await f.get(url).response;
    assert.deepEqual([...new Uint8Array(await repeated.arrayBuffer())], [1, 2, 3, 4, 5, 6]);
    const seek = await f.get(url, 'bytes=2-4').response;
    assert.equal(seek.status, 206); assert.equal(seek.headers.get('content-range'), 'bytes 2-4/6');
    assert.deepEqual([...new Uint8Array(await seek.arrayBuffer())], [3, 4, 5]);
    assert.deepEqual([...new Uint8Array(await (await f.get(url, 'bytes=-2').response).arrayBuffer())], [5, 6]);
    assert.equal((await f.get(url, 'bytes=99-').response).status, 416);
    assert.equal(f.requests(), 1);
});

test('下一首预取完成后可直接播放，歌单移除的缓存会被清理，不拦截其他文件', async () => {
    const f = worker(async () => new Response(new Uint8Array([7, 8, 9])));
    const url = 'https://site.example/source/next.mp3';
    await f.message({ type: 'MUSIC_PREFETCH', url });
    await f.message({ type: 'MUSIC_PREFETCH', url });
    assert.equal(f.requests(), 1);
    assert.deepEqual([...new Uint8Array(await (await f.get(url).response).arrayBuffer())], [7, 8, 9]);
    assert.equal(f.requests(), 1);
    assert.equal(f.get('https://site.example/source/report.pdf').response, undefined);
    assert.equal(f.get('https://other.example/source/next.mp3').response, undefined);
    await f.message({ type: 'MUSIC_PLAYLIST', urls: [] });
    assert.equal(f.stored.size, 0);
});

test('单曲自动循环、列表循环、手动跳曲与随机下一首符合各自队列规则', () => {
    assert.equal(queueIndex(1, 3, { automatic: true }), 1);
    assert.equal(queueIndex(1, 3), 2);
    assert.equal(queueIndex(2, 3, { mode: 'list', automatic: true }), 0);
    assert.equal(queueIndex(0, 3, { direction: -1 }), 2);
    assert.equal(queueIndex(0, 0), -1);
    for (const random of [() => 0, () => .99]) assert.notEqual(queueIndex(1, 3, { mode: 'shuffle', random }), 1);
    assert.equal(queueIndex(0, 1, { mode: 'shuffle' }), 0);
    assert.equal(musicTime(125.8), '2:05');
});

test('歌单升级默认为空，保存顺序及稳定编号；只允许本站 MP3 且限制重复编号', () => {
    const db = new Database(':memory:');
    try {
        migrateHomeMusic(db); migrateHomeMusic(db);
        assert.deepEqual(homePlaylist(db), []);
        assert.equal(homeWelcome(db).length, 3);
        const welcome = ['你好', '听听音乐', '欢迎逛逛'];
        assert.equal(validateWelcome(welcome), null);
        saveWelcome(db, welcome); migrateHomeMusic(db);
        assert.deepEqual(homeWelcome(db), welcome, '重启迁移不覆盖已保存的开始界面文字');
        assert.ok(validateWelcome(['只有一行']));
        assert.ok(validateWelcome(['你好', '', '第三行']));
        assert.ok(validateWelcome(['你好', '错误\n换行', '第三行']));
        assert.ok(validateWelcome(['你好', '字'.repeat(121), '第三行']));
        assert.equal(validatePlaylist([{ title: '外链', url: 'https://example.com/a.mp3' }]), '请填写歌曲名称，并使用上传到本站的 MP3 文件');
        assert.ok(validatePlaylist([{ title: '越界', url: '/source/../a.mp3' }]));
        const tracks = [{ title: '第一首', artist: '作者', url: '/source/first.mp3' }, { title: '第二首', url: '/source/second.mp3' }];
        assert.equal(validatePlaylist(tracks), null);
        db.transaction(() => savePlaylist(db, tracks))();
        const saved = homePlaylist(db);
        db.transaction(() => savePlaylist(db, [...saved].reverse()))();
        assert.deepEqual(homePlaylist(db).map(track => track.id), saved.map(track => track.id).reverse());
        assert.ok(validatePlaylist([saved[0], saved[0]]));
    } finally { db.close(); }
});
