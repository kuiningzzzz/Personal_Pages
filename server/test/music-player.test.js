import test from 'node:test';
import assert from 'node:assert/strict';

test('播放由用户手势启动，同一 Audio 跨页面保留；单曲不预取，其他模式最后 30 秒只预取一次', async t => {
    const descriptors = new Map();
    const replace = (key, value) => { descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
    const messages = [], audios = [];
    const window = new EventTarget(); window.isSecureContext = false;
    class FakeAudio extends EventTarget {
        constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 100; audios.push(this); }
        play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
        pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
        removeAttribute() { this.src = ''; }
        load() {}
    }
    const data = { profile: { name: '站主', avatar: '/picture/avatar.png' }, cards: [{ title: '介绍', content: '已保存的内容' }], welcome: ['你好', '听听音乐', '欢迎逛逛'],
        playlist: [1, 2, 3].map(id => ({ id, title: '歌曲 ' + id, url: '/source/song-' + id + '.mp3' })) };
    replace('window', window); replace('Audio', FakeAudio);
    replace('navigator', { serviceWorker: { controller: { postMessage: message => messages.push(message) } } });
    replace('fetch', async () => ({ json: async () => ({ success: true, data }) }));
    t.after(() => { for (const [key, descriptor] of descriptors) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
    const player = await import('../../src/lib/music.js?player-test');
    await player.loadStation();
    assert.equal(audios.length, 0, '读取资料不请求 MP3 或创建播放实例');
    player.enterHome();
    assert.equal(audios.length, 1); assert.equal(audios[0].src, '/source/song-1.mp3');
    assert.equal(audios[0].loop, true); assert.equal(player.music.playing, true);
    const audio = audios[0];
    audio.currentTime = 90; audio.dispatchEvent(new Event('durationchange')); audio.dispatchEvent(new Event('timeupdate'));
    assert.equal(messages.filter(m => m.type === 'MUSIC_PREFETCH').length, 0, '单曲循环仅加载当前歌曲');
    audio.currentTime = 50; audio.dispatchEvent(new Event('timeupdate'));
    player.cyclePlayMode();
    assert.equal(player.music.mode, 'list'); assert.equal(audio.loop, false);
    assert.equal(messages.filter(m => m.type === 'MUSIC_PREFETCH').length, 0);
    audio.currentTime = 70; audio.dispatchEvent(new Event('timeupdate')); audio.dispatchEvent(new Event('timeupdate'));
    assert.deepEqual(messages.filter(m => m.type === 'MUSIC_PREFETCH'), [{ type: 'MUSIC_PREFETCH', url: '/source/song-2.mp3' }]);
    audio.dispatchEvent(new Event('ended'));
    assert.equal(audio.src, '/source/song-2.mp3'); assert.equal(audios.length, 1);
    player.music.surface = 'dock'; player.togglePlayback();
    assert.equal(audio.paused, true); player.togglePlayback(); assert.equal(audio.paused, false);
    player.music.surface = 'home'; assert.equal(audios.length, 1, '导航呈现状态不重建音频');
    player.previousTrack(); assert.equal(audio.src, '/source/song-1.mp3');
    // A random choice made by prefetch must also be used by the next button.
    audio.currentTime = 50; audio.dispatchEvent(new Event('timeupdate')); player.cyclePlayMode();
    audio.currentTime = 70; audio.dispatchEvent(new Event('durationchange')); audio.dispatchEvent(new Event('timeupdate'));
    const anticipated = messages.filter(m => m.type === 'MUSIC_PREFETCH').at(-1).url;
    player.nextTrack(); assert.equal(audio.src, anticipated);
    const snapshot = { ...data, profile: { ...data.profile }, cards: data.cards.map(card => ({ ...card })), welcome: [...data.welcome] };
    player.applyStation(snapshot); snapshot.profile.name = '尚未保存'; snapshot.cards[0].content = '尚未保存';
    assert.equal(player.music.profile.name, '站主'); assert.equal(player.music.cards[0].content, '已保存的内容');
    snapshot.welcome[0] = '尚未保存'; assert.equal(player.music.welcome[0], '你好');
    player.applyStation({ ...data, playlist: [] });
    assert.equal(audio.paused, true); assert.equal(player.music.playing, false);
    player.togglePlayback(); assert.equal(audio.paused, true, '空歌单无法播放');
});
