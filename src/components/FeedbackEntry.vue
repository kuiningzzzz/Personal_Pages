<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import UiDialog from './UiDialog.vue'
import { loadVisitor, visitor } from '../lib/auth'
import { showSubscriptionNotice } from '../lib/subscriptions'

const open = ref(false), busy = ref(false), opening = ref(false), error = ref('')
const category = ref('experience'), body = ref(''), song = ref(''), artist = ref(''), notes = ref('')
const pictures = ref([]), picker = ref(null)
const categories = [{ id: 'experience', name: '体验优化' }, { id: 'bug', name: 'bug反馈' }, { id: 'music', name: '音乐推荐' }, { id: 'rights', name: '侵权通知' }, { id: 'other', name: '其他内容' }]
const musical = computed(() => category.value === 'music')
const length = value => [...value.trim()].length
const valid = computed(() => musical.value ? length(song.value) > 0 && length(song.value) <= 200 && length(artist.value) > 0 && length(artist.value) <= 200 && length(notes.value) <= 5000 : length(body.value) > 0 && length(body.value) <= 10000)
function clearPictures() { for (const picture of pictures.value) URL.revokeObjectURL(picture.url); pictures.value = [] }
function close() { if (!busy.value) open.value = false }
async function begin() {
  if (opening.value) return
  opening.value = true
  try {
    if (!await loadVisitor(true)) { showSubscriptionNotice('登录/注册后即可向我反馈'); return }
    error.value = ''; open.value = true
  } finally { opening.value = false }
}
function pick(event) {
  const files = [...(event.target.files || [])]; event.target.value = ''
  const all = [...pictures.value.map(item => item.file), ...files]
  if (all.length > 4 || all.some(file => file.size > 5 * 1024 * 1024) || all.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) { error.value = '最多 4 张图片，每张最多 5 MB，合计最多 10 MB'; return }
  if (files.some(file => !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type))) { error.value = '请选择 PNG、JPEG、GIF 或 WebP 图片'; return }
  pictures.value.push(...files.map(file => ({ file, url: URL.createObjectURL(file) }))); error.value = ''
}
function remove(index) { URL.revokeObjectURL(pictures.value[index].url); pictures.value.splice(index, 1) }
async function submit() {
  if (busy.value || !valid.value) return
  busy.value = true; error.value = ''
  try {
    const data = new FormData(); data.append('category', category.value)
    if (musical.value) { data.append('song', song.value.trim()); data.append('artist', artist.value.trim()); data.append('notes', notes.value.trim()) }
    else { data.append('body', body.value.trim()); for (const picture of pictures.value) data.append('images', picture.file) }
    const response = await fetch('/api/feedback', { method: 'POST', credentials: 'same-origin', body: data })
    const result = await response.json().catch(() => ({ message: '暂时无法提交，请稍后再试' }))
    if (!response.ok || !result.success) {
      if (response.status === 401) { await loadVisitor(true); showSubscriptionNotice('登录已失效，请重新登录后提交') }
      throw new Error(result.message || '提交失败，请稍后再试')
    }
    open.value = false; body.value = ''; song.value = ''; artist.value = ''; notes.value = ''; clearPictures()
    showSubscriptionNotice(result.message)
  } catch (cause) { error.value = cause.message || '暂时连接不到网站，请稍后再试' }
  finally { busy.value = false }
}
watch(category, () => { error.value = ''; if (musical.value) clearPictures() })
onUnmounted(clearPictures)
</script>
<template>
  <div class="feedback-entry">
    <button type="button" class="feedback-trigger" :disabled="opening" @click="begin">向我反馈</button>
    <UiDialog :open="open" title="向我反馈" :busy="busy" @close="close">
      <form class="feedback-form" @submit.prevent="submit">
        <fieldset :disabled="busy"><legend>反馈类型</legend><div class="feedback-categories"><label v-for="item in categories" :key="item.id" :class="{ selected: category === item.id }"><input v-model="category" type="radio" name="feedback-category" :value="item.id" /><span>{{ item.name }}</span></label></div></fieldset>
        <template v-if="musical"><label>歌名<input v-model="song" type="text" maxlength="200" required :disabled="busy" placeholder="想推荐的歌曲" /></label><label>歌手名<input v-model="artist" type="text" maxlength="200" required :disabled="busy" placeholder="这首歌的歌手" /></label><label>其他备注<textarea v-model="notes" rows="3" maxlength="5000" :disabled="busy" placeholder="可选：版本、收听链接，或推荐这首歌的理由" /></label></template>
        <template v-else><label>反馈内容<textarea v-model="body" rows="5" maxlength="10000" required :disabled="busy" placeholder="请描述您的建议、问题或诉求…" /></label><div class="feedback-upload"><input ref="picker" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden :disabled="busy" @change="pick" /><button type="button" class="ghost-button" :disabled="busy || pictures.length >= 4" @click="picker.click()">添加图片辅助说明</button><small>最多 4 张，每张 5 MB，合计 10 MB</small></div><ul v-if="pictures.length" class="feedback-previews"><li v-for="(picture, index) in pictures" :key="picture.url"><img :src="picture.url" :alt="picture.file.name" /><button type="button" :disabled="busy" :aria-label="`移除图片 ${picture.file.name}`" @click="remove(index)">×</button></li></ul></template>
        <div class="feedback-note"><p v-if="category === 'rights'">如果网站有内容侵犯了您的权益请联系我，若诉求合理我会第一时间下架相关内容并向您的账户邮箱致信沟通</p><p>本人受到并处理您的反馈后，若有其他问题会向您的账户邮箱发送邮件沟通，感谢您的反馈！</p></div>
        <p v-if="error" class="feedback-error" role="alert">{{ error }}</p>
        <div class="feedback-footer"><small>以 {{ visitor?.username }} 的身份提交</small><button type="submit" class="primary-button" :disabled="busy || !valid">{{ busy ? '提交中…' : '提交反馈' }}</button></div>
      </form>
    </UiDialog>
  </div>
</template>
<style scoped>
.feedback-entry { margin-right: auto; }.feedback-trigger { border: 0; padding: 7px 9px; border-radius: 4px; font-size: 11px; font-weight: 700; color: var(--ink); background: var(--paper-deep); transition: background .2s ease; }.feedback-trigger:hover { background: var(--accent-soft); }
.feedback-form label { display: flex; flex-direction: column; gap: 7px; margin: 0 0 15px; font-size: 13px; font-weight: 700; }.feedback-form input[type=text],textarea { width: 100%; padding: 11px 12px; border: 0; border-radius: 4px; color: var(--ink); background: var(--field-bg); font: inherit; line-height: 1.7; }.feedback-form input:focus-visible,textarea:focus-visible { outline: 2px solid var(--accent); }textarea { resize: vertical; }
fieldset { padding: 0; margin: 0 0 20px; border: 0; }legend { margin-bottom: 10px; font-size: 13px; font-weight: 700; }.feedback-categories { display: flex; flex-wrap: wrap; gap: 8px; }.feedback-categories label { flex-direction: row; align-items: center; gap: 5px; padding: 7px 9px; margin: 0; border-radius: 4px; background: var(--paper-deep); font-size: 12px; cursor: pointer; }.feedback-categories .selected { background: var(--accent-soft); box-shadow: 2px 3px 0 var(--sun); }.feedback-categories input { margin: 0; accent-color: var(--accent); }
.feedback-upload { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin: 4px 0 15px; }.feedback-upload button { min-height: 34px; padding: 7px 10px; font-size: 12px; }.feedback-upload small,.feedback-footer small { color: var(--muted); font-size: 11px; }
.feedback-previews { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; padding: 0; margin: 0 0 18px; list-style: none; }.feedback-previews li { position: relative; }.feedback-previews img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; }.feedback-previews button { position: absolute; right: -4px; top: -5px; border: 0; width: 23px; height: 23px; border-radius: 4px; color: var(--ink); background: var(--paper-deep); font-size: 17px; }
.feedback-note { padding: 12px 14px; border-radius: 4px; background: var(--paper-deep); }.feedback-note p { margin: 0; font-size: 12px; line-height: 1.85; color: var(--muted); }.feedback-note p+p { margin-top: 8px; }.feedback-error { color: var(--error-text); font-size: 12px; line-height: 1.7; }.feedback-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; }.feedback-footer button { padding: 10px 16px; min-height: 40px; }button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width:720px) { .feedback-trigger { padding: 5px 7px; font-size: 10px; } }
</style>
