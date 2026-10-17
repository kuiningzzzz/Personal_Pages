<script setup>
import { ref, watch, defineAsyncComponent } from 'vue'
import HomeAdminSection from './HomeAdminSection.vue'
const draggable = defineAsyncComponent(() => import('vuedraggable'))

const playlists = defineModel({ type: Array, default: () => [] })
defineProps({ busy: Boolean })
const emit = defineEmits(['notice', 'uploading'])
const uploading = ref(false)
const collapsed = ref(new Set())
const keyed = item => { item._key ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; return item }
watch(() => playlists.value, lists => lists.forEach(list => { keyed(list); list.tracks.forEach(keyed) }), { immediate: true })
function addPlaylist() {
  if (playlists.value.length >= 20) return
  playlists.value.push(keyed({ title: '新歌单', tracks: [] }))
}
function move(items, index, offset) {
  const target = index + offset
  if (target < 0 || target >= items.length) return
  items.splice(target, 0, items.splice(index, 1)[0])
}
function toggleList(key) {
  if (collapsed.value.has(key)) collapsed.value.delete(key)
  else collapsed.value.add(key)
}
function canMoveTrack(event) { return event.to === event.from || Number(event.to.dataset.trackCount) < 100 }
async function upload(event, playlist) {
  const files = [...(event.target.files || [])]
  if (!files.length) return
  if (files.some(file => !/\.mp3$/i.test(file.name))) { emit('notice', '请上传 MP3 格式的音乐文件', true); event.target.value = ''; return }
  if (playlist.tracks.length + files.length > 100) { emit('notice', '每个歌单最多 100 首歌曲', true); event.target.value = ''; return }
  uploading.value = true; emit('uploading', true)
  let count = 0
  try {
    for (const file of files) {
      emit('notice', '正在上传音乐 ' + (count + 1) + ' / ' + files.length + '…', true)
      const data = new FormData(); data.append('file', file)
      const result = await (await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', body: data })).json()
      if (!result.success) throw new Error(result.message || '上传失败')
      playlist.tracks.push(keyed({ title: file.name.replace(/\.mp3$/i, '').slice(0, 120), artist: '', url: result.url })); count++
    }
    emit('notice', '已上传 ' + count + ' 首歌曲，保存首页后生效')
  } catch (error) { emit('notice', '已上传 ' + count + ' 首；' + error.message, true) }
  finally { uploading.value = false; emit('uploading', false); event.target.value = '' }
}
</script>

<template>
  <HomeAdminSection title="首页歌单" :summary="`${playlists.length} 个歌单`" class="playlist-editor">
    <div class="playlist-editor-head">
      <p id="music-drag-help">拖动六点手柄调整歌单、歌曲顺序，也可将歌曲拖入另一个展开的歌单。手柄获得焦点后可用 ↑ ↓ 调整。保存首页后生效。</p>
      <button type="button" class="add-playlist" :disabled="busy || uploading || playlists.length >= 20" @click="addPlaylist">+ 新建歌单</button>
    </div>
    <p class="library-note">排在第一的歌单为默认歌单，从第一首开始播放。</p>
    <div v-if="!playlists.length" class="playlist-empty">还没有歌单，新建一个，放入喜欢的音乐吧。</div>
    <draggable v-model="playlists" item-key="_key" handle=".playlist-drag-handle" class="playlist-cards"
      :animation="180" :force-fallback="true" :fallback-on-body="true" :disabled="busy || uploading"
      ghost-class="music-sort-ghost" fallback-class="music-sort-floating" :fallback-tolerance="5">
      <template #item="{ element: playlist, index: playlistIndex }">
        <article class="playlist-card">
          <header class="playlist-card-head">
            <button type="button" class="drag-handle playlist-drag-handle" :disabled="busy || uploading" :aria-label="`拖动歌单 ${playlist.title}`" aria-describedby="music-drag-help"
              @keydown.up.prevent="move(playlists, playlistIndex, -1)" @keydown.down.prevent="move(playlists, playlistIndex, 1)"><i v-for="n in 6" :key="n"></i></button>
            <div class="playlist-name"><label :for="`playlist-${playlist._key}`">歌单 {{ playlistIndex + 1 }} <span v-if="playlistIndex === 0" class="default-badge">默认播放</span></label><input :id="`playlist-${playlist._key}`" v-model="playlist.title" maxlength="120" :disabled="busy || uploading" placeholder="歌单名称" /></div>
            <span class="song-count">{{ playlist.tracks.length }} / 100 首</span>
            <div class="playlist-actions"><button type="button" :aria-expanded="!collapsed.has(playlist._key)" @click="toggleList(playlist._key)">{{ collapsed.has(playlist._key) ? '展开' : '收起' }}</button><button type="button" :disabled="busy || uploading" @click="playlists.splice(playlistIndex, 1)">删除歌单</button></div>
          </header>
          <div v-show="!collapsed.has(playlist._key)" class="playlist-card-body">
            <label class="music-upload">上传音乐 · 可多选<input type="file" accept=".mp3,audio/mpeg" multiple :disabled="busy || uploading" @change="upload($event, playlist)" /></label>
            <draggable v-model="playlist.tracks" item-key="_key" handle=".track-drag-handle" group="home-music-tracks" class="track-cards" :data-track-count="playlist.tracks.length" :move="canMoveTrack"
              :animation="180" :force-fallback="true" :fallback-on-body="true" :disabled="busy || uploading" :empty-insert-threshold="24"
              ghost-class="music-sort-ghost" fallback-class="music-sort-floating" :fallback-tolerance="5">
              <template #item="{ element: track, index }">
                <div class="track-editor">
                  <button type="button" class="drag-handle track-drag-handle" :disabled="busy || uploading" :aria-label="`拖动歌曲 ${track.title}`" aria-describedby="music-drag-help"
                    @keydown.up.prevent="move(playlist.tracks, index, -1)" @keydown.down.prevent="move(playlist.tracks, index, 1)"><i v-for="n in 6" :key="n"></i></button>
                  <strong class="track-order">{{ String(index + 1).padStart(2, '0') }}</strong>
                  <div class="track-fields"><label>歌曲名称<input v-model="track.title" maxlength="120" :disabled="busy || uploading" placeholder="歌曲名称" /></label><label>歌手（可选）<input v-model="track.artist" maxlength="120" :disabled="busy || uploading" placeholder="歌手或演奏者" /></label><small>{{ track.url }}</small></div>
                  <button type="button" class="remove-track" :disabled="busy || uploading" @click="playlist.tracks.splice(index, 1)">移除</button>
                </div>
              </template>
            </draggable>
            <p v-if="!playlist.tracks.length" class="playlist-empty">上传 MP3，或从其他歌单拖入歌曲。</p>
          </div>
        </article>
      </template>
    </draggable>
  </HomeAdminSection>
</template>

<style scoped>
.playlist-editor { margin: 28px 0; padding: 25px; }.playlist-editor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 12px; }.playlist-editor h2 { margin: 0; font-size: 23px; }.playlist-editor p { color: var(--muted); font-size: 12px; line-height: 1.8; }.playlist-editor-head p { margin: 8px 0 0; }.library-note { margin: 0 0 18px; }
label { display: flex; flex-direction: column; gap: 8px; color: var(--ink); font-size: 12px; font-weight: 700; }input { width: 100%; padding: 10px 12px; border: 0; border-radius: 4px; background: var(--field-bg); color: var(--ink); box-shadow: inset 0 0 0 1px var(--field-line); font-size: 13px; }input:focus { outline: 2px solid var(--accent); }
button { border: 0; border-radius: 4px; color: var(--ink); font-size: 12px; cursor: pointer; }button:disabled { opacity: .4; cursor: not-allowed; }button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.add-playlist { flex: none; padding: 10px 12px; background: var(--accent-soft); }.playlist-cards { display: grid; gap: 18px; }.playlist-card { min-width: 0; border-radius: 5px; background: var(--paper-deep); box-shadow: 3px 4px 0 var(--sky); }.playlist-card-head { display: flex; align-items: center; gap: 12px; padding: 16px; }.playlist-name { flex: 1; min-width: 0; }.playlist-name label { display: block; margin-bottom: 8px; }.default-badge { margin-left: 7px; padding: 2px 5px; color: var(--cocoa); background: var(--sun); font-size: 10px; font-weight: 400; }.song-count { flex: none; color: var(--muted); font-size: 11px; }.playlist-actions { display: flex; flex-direction: column; gap: 6px; }.playlist-actions button { padding: 6px 8px; background: var(--paper); white-space: nowrap; }.playlist-card-body { padding: 0 16px 16px; }
.drag-handle { display: grid; grid-template-columns: repeat(2, 3px); grid-template-rows: repeat(3, 3px); gap: 3px; place-content: center; width: 28px; height: 38px; padding: 6px; flex: none; color: var(--muted); background: transparent; touch-action: none; cursor: grab; }.drag-handle:active { cursor: grabbing; }.drag-handle i { width: 3px; height: 3px; border-radius: 50%; background: currentColor; }.drag-handle:hover { color: var(--ink); background: var(--accent-soft); }
.music-upload { color: var(--cocoa); margin-bottom: 8px; }.playlist-empty { margin: 0; padding: 12px; background: var(--paper); border-radius: 4px; }.track-cards { min-height: 16px; display: grid; gap: 8px; }.track-editor { display: flex; align-items: flex-start; gap: 10px; padding: 14px 10px; border-radius: 4px; background: var(--paper); }.track-order { padding-top: 9px; color: var(--cocoa); font-family: Georgia, serif; font-size: 13px; }.track-fields { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }.track-fields small { grid-column: 1 / -1; color: var(--soft); font-size: 10px; overflow-wrap: anywhere; }.remove-track { margin-top: 26px; padding: 7px; background: var(--accent-soft); }
.music-sort-ghost { opacity: .22; background: var(--sky); box-shadow: none; }.music-sort-floating { opacity: .95; box-shadow: 5px 7px 0 var(--denim); cursor: grabbing; }
@media (max-width: 650px) { .playlist-editor { padding: 16px; }.playlist-editor-head { gap: 12px; }.playlist-card-head { flex-wrap: wrap; gap: 8px; padding: 12px; }.playlist-name { flex-basis: calc(100% - 44px); }.song-count { margin-left: 36px; }.playlist-actions { margin-left: auto; flex-direction: row; }.playlist-card-body { padding: 0 10px 12px; }.track-editor { gap: 6px; padding: 12px 6px; }.track-fields { grid-template-columns: 1fr; gap: 8px; }.track-order { display: none; }.remove-track { padding: 6px; } }
</style>
