<script setup>
import { ref } from 'vue'
const tracks = defineModel({ type: Array, default: () => [] })
defineProps({ busy: Boolean })
const emit = defineEmits(['notice', 'uploading'])
const uploading = ref(false)
function move(index, offset) {
  const target = index + offset
  if (target < 0 || target >= tracks.value.length) return
  ;[tracks.value[index], tracks.value[target]] = [tracks.value[target], tracks.value[index]]
}
async function upload(event) {
  const files = [...(event.target.files || [])]
  if (!files.length) return
  if (files.some(file => !/\.mp3$/i.test(file.name))) { emit('notice', '请上传 MP3 格式的音乐文件', true); event.target.value = ''; return }
  if (tracks.value.length + files.length > 100) { emit('notice', '歌单最多 100 首歌曲', true); event.target.value = ''; return }
  uploading.value = true; emit('uploading', true)
  let count = 0
  try {
    for (const file of files) {
      emit('notice', '正在上传音乐 ' + (count + 1) + ' / ' + files.length + '…', true)
      const data = new FormData(); data.append('file', file)
      const result = await (await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', body: data })).json()
      if (!result.success) throw new Error(result.message || '上传失败')
      tracks.value.push({ title: file.name.replace(/\.mp3$/i, '').slice(0, 120), artist: '', url: result.url }); count++
    }
    emit('notice', '已上传 ' + count + ' 首歌曲，保存首页后生效')
  } catch (error) { emit('notice', '已上传 ' + count + ' 首；' + error.message, true) }
  finally { uploading.value = false; emit('uploading', false); event.target.value = '' }
}
</script>
<template>
  <section class="playlist-editor surface"><div class="playlist-editor-head"><div><h2>首页歌单</h2><p>上传 MP3，调整名称和顺序。首次播放从第一首开始；空歌单时只展开首页，不播放音乐。</p></div><span>{{ tracks.length }} / 100 首</span></div>
    <label class="music-upload">上传音乐 · 可多选<input type="file" accept=".mp3,audio/mpeg" multiple :disabled="busy || uploading" @change="upload" /></label>
    <div v-if="!tracks.length" class="playlist-empty">还没有放入唱片，上传一首喜欢的歌吧。</div>
    <div v-for="(track, index) in tracks" :key="track.id || track.url" class="track-editor"><strong class="track-order">{{ String(index + 1).padStart(2, '0') }}</strong><div class="track-fields"><label>歌曲名称<input v-model="track.title" maxlength="120" placeholder="歌曲名称" /></label><label>歌手（可选）<input v-model="track.artist" maxlength="120" placeholder="歌手或演奏者" /></label><small>{{ track.url }}</small></div><div class="track-actions"><button type="button" :disabled="busy || index === 0" @click="move(index, -1)">上移</button><button type="button" :disabled="busy || index === tracks.length - 1" @click="move(index, 1)">下移</button><button type="button" :disabled="busy" @click="tracks.splice(index, 1)">移除</button></div></div>
  </section>
</template>
<style scoped>
.playlist-editor { margin: 28px 0; padding: 25px; }.playlist-editor-head { display: flex; justify-content: space-between; gap: 18px; margin-bottom: 18px; }.playlist-editor h2 { margin: 0; font-size: 23px; }.playlist-editor p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }.playlist-editor-head > span { flex: none; color: var(--soft); font-size: 12px; }
label { display: flex; flex-direction: column; gap: 8px; color: var(--ink); font-size: 12px; font-weight: 700; }input { width: 100%; padding: 10px 12px; border: 0; border-radius: 4px; background: var(--field-bg); color: var(--ink); box-shadow: inset 0 0 0 1px var(--field-line); font-size: 13px; }input:focus { outline: 2px solid var(--accent); }
.music-upload { color: var(--cocoa); margin-bottom: 18px; }.playlist-empty { padding: 16px; color: var(--muted); background: var(--paper-deep); border-radius: 5px; font-size: 12px; }
.track-editor { display: flex; align-items: flex-start; gap: 14px; padding: 17px 0; box-shadow: 0 1px 0 var(--paper-deep); }.track-order { padding-top: 8px; color: var(--cocoa); font-family: Georgia, serif; }.track-fields { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }.track-fields small { grid-column: 1 / -1; color: var(--soft); font-size: 10px; overflow-wrap: anywhere; }.track-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; max-width: 112px; padding-top: 20px; }.track-actions button { padding: 6px 8px; border: 0; border-radius: 3px; color: var(--ink); background: var(--accent-soft); font-size: 11px; }.track-actions button:disabled { opacity: .4; cursor: not-allowed; }
@media (max-width: 650px) { .playlist-editor { padding: 18px; }.track-editor { flex-wrap: wrap; }.track-fields { grid-template-columns: 1fr; }.track-actions { max-width: none; width: 100%; padding-top: 0; } }
</style>
