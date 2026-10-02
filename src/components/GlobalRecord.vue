<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import PlayerIcon from './PlayerIcon.vue'
import { music, togglePlayback } from '../lib/music'

const route = useRoute()
const visible = ref(false)
const position = ref({ x: 0, y: 0, scale: 1 })
const style = computed(() => ({ transform: `translate3d(${position.value.x}px, ${position.value.y}px, 0) scale(${position.value.scale})` }))
const label = computed(() => !music.entered ? '播放唱片，展开首页' : !music.tracks.length ? '尚未配置歌单' : music.playing ? '暂停音乐' : music.time > 0 ? '继续播放音乐' : '播放音乐')
let resizeObserver, observer, frame = 0, anchor
function locate() {
  frame = 0
  const home = route.path === '/' ? document.querySelector('[data-player-home]') : null
  const target = home || (music.entered ? document.querySelector('[data-player-dock]') : null)
  if (!target || !music.profile) {
    if (!music.entered) { visible.value = false; music.surface = 'hidden' }
    return
  }
  if (anchor !== target) { resizeObserver?.disconnect(); resizeObserver?.observe(target); anchor = target }
  const rect = target.getBoundingClientRect()
  if (rect.width <= 0) return
  position.value = { x: rect.left, y: rect.top, scale: rect.width / 360 }
  music.surface = home ? music.entered ? 'home' : 'intro' : 'dock'
  visible.value = true
}
function schedule() { if (!frame) frame = requestAnimationFrame(locate) }
watch([() => route.path, () => music.entered, () => music.profile], async () => { await nextTick(); schedule() })
onMounted(() => {
  resizeObserver = new ResizeObserver(schedule)
  observer = new MutationObserver(schedule)
  observer.observe(document.querySelector('.site-main'), { childList: true, subtree: true })
  window.addEventListener('resize', schedule, { passive: true })
  window.addEventListener('scroll', schedule, { passive: true, capture: true })
  window.addEventListener('home-player-open', schedule)
  locate()
})
onUnmounted(() => {
  cancelAnimationFrame(frame); observer?.disconnect(); resizeObserver?.disconnect()
  window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true)
  window.removeEventListener('home-player-open', schedule)
})
</script>
<template>
  <div v-show="visible" class="global-record" :class="{ docked: music.surface === 'dock', 'record-intro': !music.entered || music.entering }" :style="style">
    <div class="vinyl" :class="{ spinning: music.playing }"><div class="vinyl-grooves"></div><img v-if="music.profile?.avatar" :src="music.profile.avatar" :alt="`${music.profile.name}的头像唱片`" /></div>
    <button type="button" class="record-toggle" :aria-label="label" :title="label" :aria-pressed="music.playing" :disabled="music.entering || (music.entered && !music.tracks.length)" @click="togglePlayback"><span class="record-action" :class="{ hidden: music.playing && music.entered }"><PlayerIcon :name="music.playing ? 'pause' : 'play'" /></span></button>
  </div>
</template>
<style scoped>
.global-record { position: fixed; z-index: 90; top: 0; left: 0; width: 360px; height: 360px; transform-origin: top left; transition: transform .9s cubic-bezier(.22,.75,.14,1); will-change: transform; }
.vinyl { position: absolute; inset: 0; padding: 17%; border-radius: 50%; background: #141518; box-shadow: 0 12px 0 #101115, 12px 18px 0 var(--accent-soft); animation: vinyl-spin 18s linear infinite; animation-play-state: paused; }
.vinyl.spinning { animation-play-state: running; }
.record-intro .vinyl { box-shadow: 0 12px 0 #101115, 12px 18px 0 var(--welcome-record-stack); }
.vinyl-grooves { position: absolute; inset: 8%; border-radius: 50%; box-shadow: 0 0 0 1px #ffffff15, 0 0 0 5px #141518, 0 0 0 6px #ffffff12, 0 0 0 12px #141518, 0 0 0 13px #ffffff12, 0 0 0 19px #141518, 0 0 0 20px #ffffff12; }
.vinyl img { position: relative; display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: var(--sun); box-shadow: 0 0 0 6px #0c0d0f; }
.record-toggle { position: absolute; inset: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #fffdf8; }
.record-toggle:disabled { cursor: default; }
.record-action { display: flex; align-items: center; justify-content: center; position: absolute; inset: 32%; padding: 20px; border-radius: 50%; color: #fffdf8; background: #14151870; transition: opacity .25s ease, transform .25s ease; }
.record-action svg { width: 100%; height: 100%; opacity: .8; }
.record-action.hidden { opacity: 0; transform: scale(.85); }
.record-toggle:hover .record-action, .record-toggle:focus-visible .record-action { opacity: 1; transform: scale(1); }
.docked .vinyl { box-shadow: 0 6px 0 #101115; }
.docked .record-action { inset: 21%; padding: 25px; }
@keyframes vinyl-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .global-record, .record-action { transition: none; } .vinyl { animation: none; } }
</style>
