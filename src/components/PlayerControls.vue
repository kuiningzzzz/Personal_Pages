<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { music, currentTrack, togglePlayback, previousTrack, nextTrack, cyclePlayMode, selectTrack, seekMusic, volumeIcon, setVolume, toggleMute, MAX_VOLUME } from '../lib/music'
import { musicTime } from '../lib/music-queue'
import PlayerIcon from './PlayerIcon.vue'
import FeedbackEntry from './FeedbackEntry.vue'

const playlistOpen = ref(false)
const volumeOpen = ref(false)
const volumePercent = computed(() => Math.round(music.volume * 100))
const container = ref(null)
const modeNames = { single: '单曲循环', list: '列表循环', shuffle: '随机播放' }
function close(event) { if (!container.value?.contains(event.target)) { playlistOpen.value = false; volumeOpen.value = false } }
function keys(event) { if (event.key === 'Escape') { playlistOpen.value = false; volumeOpen.value = false } }
function openVolume() { volumeOpen.value = !volumeOpen.value; playlistOpen.value = false }
function openPlaylist() { playlistOpen.value = !playlistOpen.value; volumeOpen.value = false }
onMounted(() => { window.addEventListener('pointerdown', close); window.addEventListener('keydown', keys) })
onUnmounted(() => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', keys) })
</script>
<template>
  <section ref="container" class="player-console" aria-label="音乐播放器">
    <div class="track-label"><div><strong>{{ currentTrack?.title || '还没有放入唱片' }}</strong><small>{{ music.buffering ? '正在缓冲…' : currentTrack?.artist || (currentTrack ? music.profile?.name : '在后台首页设置上传 MP3 歌单') }}</small></div><span class="sound-meter" :class="{ active: music.playing }" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
    <label class="track-progress"><span class="sr-only">播放进度</span><input type="range" min="0" :max="music.duration || 1" :value="music.time" step="0.1" :disabled="!music.duration" :aria-valuetext="`${musicTime(music.time)} / ${musicTime(music.duration)}`" @input="seekMusic($event.target.value)" /><span><time>{{ musicTime(music.time) }}</time><time>{{ musicTime(music.duration) }}</time></span></label>
    <div class="transport"><button type="button" :disabled="!music.tracks.length" aria-label="上一首" @click="previousTrack"><PlayerIcon name="previous" /></button><button type="button" class="play-key" :disabled="!music.tracks.length" :aria-label="music.playing ? '暂停' : '播放'" @click="togglePlayback"><PlayerIcon :name="music.playing ? 'pause' : 'play'" /></button><button type="button" :disabled="!music.tracks.length" aria-label="下一首" @click="nextTrack()"><PlayerIcon name="next" /></button></div>
    <div class="console-tools"><FeedbackEntry />
      <button type="button" :aria-expanded="volumeOpen" aria-controls="player-volume" :aria-label="`音量 ${volumePercent}%，点击调整`" :title="`音量 ${volumePercent}%`" @click="openVolume"><PlayerIcon :name="volumeIcon" /></button>
      <button type="button" :disabled="!music.tracks.length" :aria-label="`${modeNames[music.mode]}，点击切换循环模式`" :title="modeNames[music.mode]" @click="cyclePlayMode"><PlayerIcon :name="music.mode" /></button>
      <button type="button" :aria-expanded="playlistOpen" aria-controls="home-playlist" aria-label="选择歌单" @click="openPlaylist"><PlayerIcon name="playlist" /></button>
    </div>
    <Transition name="playlist-pop"><div v-if="volumeOpen" id="player-volume" class="volume-popover"><header><strong>音量</strong><span>{{ volumePercent }}%</span></header><div class="volume-adjust"><button type="button" :aria-label="music.volume === 0 ? '恢复音量' : '静音'" :title="music.volume === 0 ? '恢复音量' : '静音'" @click="toggleMute"><PlayerIcon :name="volumeIcon" /></button><input type="range" min="0" :max="MAX_VOLUME * 100" step="1" :value="volumePercent" aria-label="音量" :aria-valuetext="volumePercent + '%'" @input="setVolume(Number($event.target.value) / 100)" /></div></div></Transition>
    <p v-if="music.error" class="player-error" role="alert">{{ music.error }}</p>
    <Transition name="playlist-pop"><div v-if="playlistOpen" id="home-playlist" class="playlist-popover"><header><strong>歌单</strong><span>{{ music.tracks.length }} 首</span></header><p v-if="!music.tracks.length">暂时没有歌曲</p><div v-else class="playlist-rows"><button v-for="(track, index) in music.tracks" :key="track.id || track.url" type="button" :class="{ selected: index === music.currentIndex }" :aria-pressed="index === music.currentIndex" @click="selectTrack(index); playlistOpen = false"><span>{{ String(index + 1).padStart(2, '0') }}</span><div><strong>{{ track.title }}</strong><small v-if="track.artist">{{ track.artist }}</small></div><PlayerIcon v-if="index === music.currentIndex" :name="music.playing ? 'pause' : 'play'" /></button></div></div></Transition>
  </section>
</template>
<style scoped>
.player-console { position: relative; width: 100%; padding: 24px 26px 17px; border-radius: 8px; background: var(--paper); box-shadow: 6px 7px 0 var(--sky); color: var(--ink); }
.track-label { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.track-label > div { min-width: 0; }
.track-label strong { display: block; font-size: 18px; line-height: 1.5; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.track-label small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
.sound-meter { display: flex; align-items: center; gap: 3px; height: 24px; flex: none; }
.sound-meter i { width: 3px; height: 6px; border-radius: 1px; background: var(--accent); animation: sound-pulse .8s ease-in-out infinite alternate; animation-play-state: paused; }
.sound-meter i:nth-child(2) { animation-delay: -.3s; height: 14px; }.sound-meter i:nth-child(3) { animation-delay: -.6s; height: 20px; }.sound-meter i:nth-child(4) { animation-delay: -.1s; height: 10px; }
.sound-meter.active i { animation-play-state: running; }
.track-progress { display: block; margin: 20px 0 14px; }
.track-progress input { display: block; width: 100%; height: 12px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.track-progress > span:last-child { display: flex; justify-content: space-between; margin-top: 5px; color: var(--soft); font-size: 10px; font-variant-numeric: tabular-nums; }
.transport { display: flex; align-items: center; justify-content: center; gap: 24px; }
.transport button, .console-tools > button { display: flex; align-items: center; justify-content: center; padding: 8px; width: 36px; height: 36px; border: 0; border-radius: 4px; background: transparent; color: var(--ink); transition: transform .2s ease, background-color .2s ease; }
.transport button:hover:not(:disabled), .console-tools > button:hover:not(:disabled) { background: var(--accent-soft); transform: translateY(-2px); }
.transport .play-key { width: 48px; height: 44px; background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); }
button:disabled { opacity: .4; cursor: not-allowed; }
button svg { width: 21px; height: 21px; }
.console-tools { display: flex; align-items: center; justify-content: flex-end; gap: 5px; margin-top: 14px; }
.player-error { margin: 10px 0 0; color: var(--danger); font-size: 12px; line-height: 1.6; }
.playlist-popover { position: absolute; z-index: 90; right: 0; bottom: 48px; width: min(100%, 340px); padding: 16px; border-radius: 7px; background: var(--paper); box-shadow: 6px 7px 0 var(--denim); }
.volume-popover { position: absolute; z-index: 90; right: 0; bottom: 48px; width: min(260px, calc(100vw - 40px)); padding: 15px; border-radius: 7px; background: var(--paper); box-shadow: 5px 6px 0 var(--denim); }
.volume-popover header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 9px; font-size: 13px; }.volume-popover header span { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.volume-adjust { display: flex; align-items: center; gap: 12px; }.volume-adjust button { display: grid; place-items: center; flex: none; width: 34px; height: 34px; padding: 6px; border: 0; border-radius: 4px; color: var(--ink); background: var(--accent-soft); }.volume-adjust input { flex: 1; min-width: 0; width: 100%; margin: 0; accent-color: var(--accent); cursor: pointer; }
.playlist-popover header { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; font-size: 14px; }.playlist-popover header span, .playlist-popover p { color: var(--muted); font-size: 12px; }
.playlist-rows { max-height: 170px; overflow-y: auto; }
.playlist-rows button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 8px; border: 0; border-radius: 4px; background: transparent; color: var(--ink); text-align: left; }
.playlist-rows button:hover, .playlist-rows button.selected { background: var(--accent-soft); }.playlist-rows button > span { color: var(--soft); font-size: 11px; }.playlist-rows button > div { flex: 1; min-width: 0; }.playlist-rows strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.playlist-rows small { display: block; margin-top: 3px; font-size: 10px; color: var(--muted); }
.playlist-pop-enter-active, .playlist-pop-leave-active { transition: opacity .2s ease, transform .2s ease; }.playlist-pop-enter-from, .playlist-pop-leave-to { opacity: 0; transform: translateY(-8px); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@keyframes sound-pulse { to { transform: scaleY(.4); } }
@media (max-width: 720px) { .player-console { padding: 12px 14px 9px; box-shadow: 4px 5px 0 var(--sky); }.track-label strong { font-size: 13px; }.track-label small { margin-top: 2px; font-size: 10px; }.sound-meter { display: none; }.track-progress { margin: 10px 0 6px; }.transport { gap: 14px; }.transport .play-key { width: 39px; height: 32px; }.transport button { width: 30px; height: 30px; padding: 6px; }.transport svg, .console-tools svg { width: 17px; height: 17px; }.console-tools { margin-top: 4px; }.console-tools > button { width: 28px; height: 26px; padding: 4px; }.playlist-popover { width: min(330px, calc(100vw - 40px)); }.player-error { font-size: 10px; } }
@media (prefers-reduced-motion: reduce) { .sound-meter i { animation: none; }.transport button, .console-tools button, .playlist-pop-enter-active, .playlist-pop-leave-active { transition: none; } }
@media (max-width: 720px) { .playlist-popover, .volume-popover { top: calc(100% + 12px); bottom: auto; }.playlist-rows { max-height: 270px; } }
@media (max-width: 720px) and (max-height: 660px) { .player-console { padding: 8px 10px; }.track-progress { margin: 6px 0 3px; }.console-tools { margin-top: 0; }.track-label small { max-height: 14px; overflow: hidden; }.transport .play-key { height: 28px; }.transport button { height: 26px; }.console-tools > button { height: 24px; } }
</style>
