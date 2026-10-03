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
    assert.equal(audio.volume, .5, '首次有声播放默认 50%');
    player.setVolume(.2); assert.equal(player.volumeIcon.value, 'volume-low'); assert.equal(audio.volume, .2);
    player.setVolume(.5); assert.equal(player.volumeIcon.value, 'volume-medium');
    player.setVolume(.9); assert.equal(player.volumeIcon.value, 'volume-high');
    player.toggleMute(); assert.equal(player.volumeIcon.value, 'volume-muted'); assert.equal(audio.muted, true);
    assert.equal(audio.paused, false, '静音不暂停播放');
    player.toggleMute(); assert.equal(audio.volume, .8); assert.equal(audio.muted, false);
    player.setVolume(2); assert.equal(audio.volume, .8, '输出最高为原先的 80%');
    player.setVolume(NaN); assert.equal(audio.volume, .8);
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

test('静音访问在播放前设为零；Gain 音量、进度与单一输出路径跨切歌保留', async t => {
    const originals = new Map();
    const replace = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
    const contexts = [], audios = [], starts = [];
    class FakeContext {
        constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumes = 0; contexts.push(this); }
        createGain() { const parameter = { value: 1, setTargetAtTime(value) { this.value = value; } }; return this.gain = { gain: parameter, connect() {} }; }
        createMediaElementSource() { this.sources = (this.sources || 0) + 1; return { connect() {} }; }
        resume() { this.state = 'running'; this.resumes++; return Promise.resolve(); }
    }
    class FakeAudio extends EventTarget {
        constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 120; audios.push(this); }
        play() { starts.push({ muted: this.muted, gain: contexts[0].gain.gain.value }); this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
        pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    }
    const window = new EventTarget(); window.AudioContext = FakeContext;
    replace('window', window); replace('Audio', FakeAudio); replace('navigator', {});
    t.after(() => { for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
    const player = await import('../../src/lib/music.js?volume-test');
    player.applyStation({ profile: { name: '站主' }, playlist: [{ title: '第一首', url: '/source/one.mp3' }, { title: '第二首', url: '/source/two.mp3' }] });
    assert.equal(contexts.length, 0);
    player.enterHome({ silent: true });
    assert.deepEqual(starts[0], { muted: true, gain: 0 }, '首次播放不能先出声再静音');
    const audio = audios[0], context = contexts[0];
    assert.equal(player.music.volume, 0); assert.equal(player.music.playing, true); assert.equal(context.resumes, 1);
    player.toggleMute(); assert.equal(context.gain.gain.value, .5, '静音访问后首次恢复音量为 50%');
    audio.currentTime = 35;
    player.setVolume(.4);
    assert.equal(audio.muted, false); assert.equal(audio.volume, 1, '增益控制不与原生音量重复衰减');
    assert.equal(context.gain.gain.value, .4); assert.equal(audio.currentTime, 35);
    player.music.surface = 'dock'; player.nextTrack();
    assert.equal(contexts.length, 1); assert.equal(context.sources, 1); assert.equal(audios.length, 1);
    assert.equal(audio.src, '/source/two.mp3'); assert.equal(context.gain.gain.value, .4);
    player.toggleMute(); assert.equal(audio.muted, true); assert.equal(audio.paused, false);
    player.toggleMute(); assert.equal(context.gain.gain.value, .4);
    player.togglePlayback(); context.state = 'suspended'; player.togglePlayback();
    assert.equal(context.resumes, 2, '用户再次播放时恢复被浏览器挂起的输出');
    player.setVolume(1); assert.equal(context.gain.gain.value, .8, 'Gain 输出同样限制到 80%');
    player.nextTrack(); assert.equal(context.gain.gain.value, .8, '切歌不突破音量上限');
});

test('直接访问或刷新非首页先显示播放器，返回首页不触发欢迎动画；首次播放仍需点击', async t => {
    const originals = new Map();
    const replace = (key, value) => { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
    const audios = [], window = new EventTarget();
    let welcomes = 0;
    window.addEventListener('home-player-open', () => { welcomes++; });
    class FakeAudio extends EventTarget {
        constructor() { super(); this.paused = true; audios.push(this); }
        play() { this.paused = false; this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
        pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    }
    replace('window', window); replace('Audio', FakeAudio); replace('navigator', {});
    t.after(() => { for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
    for (const [index, path] of ['/moments', '/resource/collection/9', '/entry/10', '/admin'].entries()) {
        // A fresh module models a reload, which has no previous in-memory state.
        const player = await import('../../src/lib/music.js?direct-route-' + index);
        const before = audios.length;
        player.syncMusicRoute('/'); assert.equal(player.music.entered, false, '首次直达首页保留欢迎界面');
        player.syncMusicRoute(path);
        player.applyStation({ profile: { name: '站主' }, playlist: [{ title: '第一首', url: '/source/one.mp3' }] });
        assert.equal(player.music.entered, true, path + ' 可以直接停靠唱片');
        assert.equal(player.music.entering, false); assert.equal(player.music.playing, false);
        assert.equal(audios.length, before, '地址初始化不创建音频或请求音乐');
        player.syncMusicRoute('/'); assert.equal(player.music.entered, true, '返回首页不重设欢迎状态');
        player.enterHome(); assert.equal(audios.length, before, '跳过欢迎后不能被首页入口重新初始化');
        player.togglePlayback();
        assert.equal(audios.length, before + 1); assert.equal(audios.at(-1).src, '/source/one.mp3');
        assert.equal(player.music.playing, true);
        player.togglePlayback(); assert.equal(audios.at(-1).paused, true);
    }
    assert.equal(welcomes, 0, '直接访问、刷新和回首页均不触发入站动画');
});
