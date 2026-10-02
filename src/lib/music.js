import { reactive, computed } from 'vue'
import { queueIndex, PLAY_MODES } from './music-queue.js'

export const music = reactive({
  profile: null, cards: [], tracks: [], welcome: [], ready: false, entered: false, entering: false,
  playing: false, buffering: false, currentIndex: 0, time: 0, duration: 0,
  mode: 'single', surface: 'hidden', error: '',
})
export const currentTrack = computed(() => music.tracks[music.currentIndex] || null)
let audio, loading, source = '', prepared = null, history = [], workerReady

function registerMusicCache() {
  if (workerReady) return workerReady
  workerReady = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return false
    try {
      await navigator.serviceWorker.register('/music-sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) await new Promise(resolve => {
        const done = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve() }
        const timer = setTimeout(done, 2000)
        navigator.serviceWorker.addEventListener('controllerchange', done)
      })
      return !!navigator.serviceWorker.controller
    } catch { return false }
  })()
  return workerReady
}

export function applyStation(data) {
  const previous = source
  music.profile = { ...data.profile }; music.cards = (data.cards || []).map(card => ({ ...card })); music.tracks = (data.playlist || []).map(track => ({ ...track }))
  music.welcome = [...(data.welcome || [])]
  const nextIndex = music.tracks.findIndex(track => track.url === previous)
  if (previous && nextIndex < 0) {
    audio?.pause(); audio?.removeAttribute('src'); audio?.load(); source = ''
    music.currentIndex = 0; music.time = 0; music.duration = 0; music.playing = false
  } else if (nextIndex >= 0) music.currentIndex = nextIndex
  prepared = null; history = []
  navigator.serviceWorker?.controller?.postMessage({ type: 'MUSIC_PLAYLIST', urls: music.tracks.map(track => track.url) })
}

export async function loadStation(force = false) {
  if (loading && !force) return loading
  if (music.ready && !force) return music
  loading = (async () => {
    const [result] = await Promise.all([fetch('/api/content/profile').then(response => response.json()), registerMusicCache()])
    if (!result.success) throw new Error(result.message || '首页加载失败')
    applyStation(result.data); music.ready = true
    return music
  })().finally(() => { loading = null })
  return loading
}

function media() {
  if (audio) return audio
  audio = new Audio(); audio.preload = 'none'
  audio.addEventListener('playing', () => { music.playing = true; music.buffering = false; music.error = '' })
  audio.addEventListener('pause', () => { music.playing = false; music.buffering = false })
  audio.addEventListener('waiting', () => { if (!audio.paused) music.buffering = true })
  audio.addEventListener('timeupdate', () => { music.time = audio.currentTime; prepareNext() })
  audio.addEventListener('durationchange', () => { music.duration = Number.isFinite(audio.duration) ? audio.duration : 0; prepareNext() })
  audio.addEventListener('ended', () => { if (music.mode !== 'single') nextTrack(true) })
  audio.addEventListener('error', () => { music.playing = false; music.buffering = false; music.error = '这首歌暂时无法播放，请试试另一首。' })
  return audio
}

function play() {
  const player = media()
  music.error = ''; player.loop = music.mode === 'single'
  const track = currentTrack.value
  if (!track) return
  if (source !== track.url) { source = track.url; player.src = source; music.time = 0; music.duration = 0; prepared = null }
  music.buffering = true
  player.play().catch(error => {
    if (error.name === 'AbortError') return
    music.buffering = false; music.playing = false
    music.error = error.name === 'NotAllowedError' ? '浏览器暂停了播放，点一下播放按钮即可继续。' : '这首歌暂时无法播放，请试试另一首。'
  })
  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist || music.profile?.name || '' })
    navigator.mediaSession.setActionHandler('play', play)
    navigator.mediaSession.setActionHandler('pause', () => player.pause())
    navigator.mediaSession.setActionHandler('previoustrack', previousTrack)
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
  }
}

export function enterHome() {
  if (music.entered) return
  music.entered = true
  window.dispatchEvent(new Event('home-player-open'))
  if (music.tracks.length) { music.currentIndex = 0; play() }
}
export function togglePlayback() {
  if (!music.entered) { enterHome(); return }
  if (!music.tracks.length) return
  if (audio && !audio.paused) audio.pause(); else play()
}
export function selectTrack(index) {
  if (!music.tracks[index]) return
  if (source && index !== music.currentIndex) history.push(music.currentIndex)
  music.currentIndex = index; music.entered = true; play()
}
export function previousTrack() {
  const previous = music.mode === 'shuffle' && history.length ? history.pop() : queueIndex(music.currentIndex, music.tracks.length, { direction: -1, mode: music.mode })
  if (previous < 0) return
  music.currentIndex = previous; play()
}
export function nextTrack(automatic = false) {
  const next = prepared?.from === source && prepared.mode === music.mode ? prepared.index : queueIndex(music.currentIndex, music.tracks.length, { mode: music.mode, automatic })
  if (next < 0) return
  if (source) history.push(music.currentIndex)
  if (history.length > 100) history.shift()
  music.currentIndex = next; play()
}
export function cyclePlayMode() {
  music.mode = PLAY_MODES[(PLAY_MODES.indexOf(music.mode) + 1) % PLAY_MODES.length]
  if (audio) audio.loop = music.mode === 'single'
  prepared = null; prepareNext()
}
export function seekMusic(value) {
  if (audio && music.duration) { audio.currentTime = Math.max(0, Math.min(Number(value), music.duration)); music.time = audio.currentTime }
}
function prepareNext() {
  if (!source || music.mode === 'single' || !music.duration || music.duration - music.time > 30 || prepared) return
  const index = queueIndex(music.currentIndex, music.tracks.length, { mode: music.mode, automatic: true })
  prepared = { from: source, mode: music.mode, index }
  const url = music.tracks[index]?.url
  if (url && url !== source) {
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'MUSIC_PREFETCH', url })
    else fetch(url, { cache: 'force-cache' }).then(response => response.arrayBuffer()).catch(() => {})
  }
}
