<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { music, pauseForActivity } from '../lib/music'

defineProps({ src: { type: String, required: true }, poster: { type: String, default: '' }, title: { type: String, default: '视频' } })
const player = ref(null)
const error = ref('')
const buffering = ref(false)
const ratio = ref(16 / 9)
let restoreMusic
function play() { if (!restoreMusic || music.playing) restoreMusic = pauseForActivity() }
function loaded() {
  if (player.value?.videoWidth && player.value.videoHeight) ratio.value = player.value.videoWidth / player.value.videoHeight
}
function failed() { buffering.value = false; error.value = '视频暂时无法播放，请重试或下载原文件。' }
function retry() { error.value = ''; buffering.value = false; player.value?.load() }
onBeforeUnmount(() => {
  if (player.value) { player.value.pause(); player.value.removeAttribute('src'); player.value.load() }
  restoreMusic?.()
})
</script>

<template>
  <div class="video-viewer">
    <div class="video-screen" :style="{ aspectRatio: ratio }">
      <video ref="player" :src="src" :poster="poster || undefined" :aria-label="title" controls playsinline preload="metadata"
        @play="play" @loadedmetadata="loaded" @waiting="buffering = true" @playing="buffering = false" @canplay="buffering = false" @pause="buffering = false" @error="failed">
        您的浏览器暂不支持视频播放。
      </video>
      <span v-if="buffering && !error" class="video-buffering" role="status">正在缓冲…</span>
    </div>
    <p v-if="error" class="video-error" role="alert">{{ error }} <button type="button" class="ghost-button" @click="retry">重试</button></p>
    <a class="video-download ghost-button" :href="src" download target="_blank" rel="noopener noreferrer">下载视频 ↓</a>
  </div>
</template>

<style scoped>
.video-viewer { min-width: 0; }
.video-screen { position: relative; width: 100%; max-height: 75dvh; overflow: hidden; border-radius: 6px; background: #141518; box-shadow: 5px 6px 0 var(--card-sky-stack); }
video { display: block; width: 100%; height: 100%; max-height: 75dvh; object-fit: contain; background: #141518; }
.video-buffering { position: absolute; top: 15px; left: 15px; padding: 6px 10px; border-radius: 4px; color: #fff; background: #141518cc; font-size: 12px; pointer-events: none; }
.video-error { color: var(--error-text); font-size: 13px; line-height: 1.8; }.video-error button { min-height: 30px; margin-left: 6px; padding: 3px 9px; font-size: 12px; }
.video-download { margin-top: 19px; font-size: 12px; }
</style>
