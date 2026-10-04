<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import UiDialog from './UiDialog.vue'
import PaginationNav from './PaginationNav.vue'

const emit = defineEmits(['restored'])
const rows = ref([]), job = ref(null), error = ref(''), notice = ref(''), loading = ref(false)
const file = ref(null), input = ref(null), mode = ref('merge'), dragging = ref(false), uploading = ref(false), uploadProgress = ref(0)
const confirmation = ref(null), deleting = ref(false), page = ref(1)
const busy = computed(() => uploading.value || deleting.value || job.value?.status === 'running')
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 15)))
const visible = computed(() => rows.value.slice((page.value - 1) * 15, page.value * 15))
let interval, stopped = false, xhr, lastFinished = ''
const size = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`
async function request(path = '', options = {}) {
  const response = await fetch(`/api/admin/backups${path}`, { credentials: 'same-origin', cache: 'no-store', ...options })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '操作失败')
  return result
}
function observe(value, notify = true) {
  job.value = value
  if (!value || value.status === 'running') return
  if (lastFinished === value.id) return
  lastFinished = value.id
  if (!notify) return
  if (value.status === 'failed') error.value = value.message
  else {
    const result = value.result
    notice.value = value.kind === 'restore' ? `${value.message}：导入 ${result.importedRecords} 条数据、${result.importedFiles} 个文件。还原前的自动备份已保留。` : '备份包已生成，可在下方下载。'
    if (value.kind === 'restore') { file.value = null; if (input.value) input.value.value = ''; emit('restored') }
  }
}
async function load(first = false) {
  loading.value = true
  try {
    const result = await request()
    if (stopped) return
    rows.value = result.data; page.value = Math.min(page.value, pages.value); observe(result.job, !first)
  } catch (cause) { if (!stopped) error.value = cause.message }
  finally { loading.value = false }
}
async function poll() {
  if (stopped || uploading.value) return
  try {
    const result = await request('/job')
    if (stopped) return
    const wasRunning = job.value?.status === 'running'
    observe(result.data)
    if (wasRunning && result.data?.status !== 'running') await load()
  } catch (cause) { if (!stopped) error.value = cause.message }
}
async function generate() {
  if (busy.value) return
  error.value = ''; notice.value = ''
  // Mark busy immediately so a double click cannot start two requests.
  job.value = { status: 'running', message: '正在提交备份请求…' }
  try { observe((await request('', { method: 'POST' })).data) }
  catch (cause) { job.value = null; error.value = cause.message }
}
function select(files) {
  if (busy.value) return
  error.value = ''
  const selected = files?.[0]
  if (!selected) return
  if (!/\.zip$/i.test(selected.name)) { error.value = '请选择本站生成的 ZIP 备份包'; return }
  if (selected.size > 2 * 1024 ** 3) { error.value = '备份包不能超过 2GB'; return }
  file.value = selected
}
function drop(event) { dragging.value = false; select(event.dataTransfer.files) }
function startRestore() {
  if (!file.value || busy.value) return
  confirmation.value = { kind: 'restore', title: mode.value === 'overwrite' ? '确认覆盖还原' : '确认增量导入' }
}
async function restore() {
  const form = new FormData(); form.append('mode', mode.value); form.append('file', file.value)
  uploading.value = true; uploadProgress.value = 0; error.value = ''; notice.value = ''
  try {
    const result = await new Promise((resolve, reject) => {
      xhr = new XMLHttpRequest(); xhr.open('POST', '/api/admin/backups/restore'); xhr.withCredentials = true
      xhr.upload.onprogress = event => { if (event.lengthComputable) uploadProgress.value = Math.round(event.loaded / event.total * 100) }
      xhr.onload = () => {
        try { const data = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300 || !data.success) reject(new Error(data.message || '上传失败')); else resolve(data) }
        catch { reject(new Error('上传失败，请检查网络连接或服务器上传限制')) }
      }
      xhr.onerror = () => reject(new Error('上传失败，请检查网络连接')); xhr.onabort = () => reject(new Error('上传已取消'))
      xhr.send(form)
    })
    observe(result.data); confirmation.value = null
  } catch (cause) { if (!stopped) { error.value = cause.message; confirmation.value = null } }
  finally { uploading.value = false; xhr = null }
}
async function confirm() {
  if (confirmation.value.kind === 'restore') return restore()
  deleting.value = true; error.value = ''; notice.value = ''
  try { await request(`/${confirmation.value.row.id}`, { method: 'DELETE' }); confirmation.value = null; await load(); notice.value = '备份包已删除' }
  catch (cause) { error.value = cause.message; confirmation.value = null }
  finally { deleting.value = false }
}
onMounted(async () => { await load(true); if (!stopped) interval = setInterval(poll, 2000) })
onUnmounted(() => { stopped = true; clearInterval(interval); xhr?.abort() })
</script>

<template>
  <section class="backup-admin">
    <header class="backup-heading"><div><h2>备份管理</h2><p>保存网站数据，也可以从备份包恢复内容。</p></div><button class="primary-button" :disabled="busy" @click="generate">生成备份包</button></header>
    <p v-if="error" class="backup-message error" role="alert">{{ error }}</p>
    <p v-if="notice" class="backup-message" role="status">{{ notice }}</p>
    <div v-if="job?.status === 'running'" class="surface job-status" role="status"><span class="working-dot"></span><div><strong>{{ job.kind === 'restore' ? '正在还原' : '正在备份' }}</strong><p>{{ job.message }}</p><small>可以切换管理模块，任务会在后台继续。</small></div></div>
    <section class="surface restore-panel">
      <h3>从备份包还原</h3><p>文章、图片、附件、歌单、评论、用户、订阅、公告及 AI 学习记录都会纳入备份。</p>
      <div class="restore-modes" role="group" aria-label="导入方式"><label :class="{ selected: mode === 'merge' }"><input v-model="mode" type="radio" value="merge" :disabled="busy" /><span><strong>增量导入</strong><small>保留现有数据，只补充备份中缺少的内容。</small></span></label><label :class="{ selected: mode === 'overwrite' }"><input v-model="mode" type="radio" value="overwrite" :disabled="busy" /><span><strong>覆盖导入</strong><small>将当前数据和上传文件替换为备份中的内容。</small></span></label></div>
      <div class="backup-drop" :class="{ dragging, disabled: busy }" @dragover.prevent="dragging = !busy" @dragleave.prevent="dragging = false" @drop.prevent="drop"><input ref="input" class="file-input" type="file" accept=".zip,application/zip" :disabled="busy" aria-label="选择备份包" @change="select($event.target.files)" /><strong>{{ file ? file.name : '将备份包拖到这里' }}</strong><small>{{ file ? size(file.size) : '支持本站生成的 ZIP 备份包，最大 2GB' }}</small><button type="button" class="ghost-button" :disabled="busy" @click="input?.click()">{{ file ? '重新选择' : '选择备份包' }}</button></div>
      <footer><small>上传、校验通过后才会替换数据。还原前会自动保存一份当前备份。</small><button class="primary-button" :disabled="busy || !file" @click="startRestore">开始还原</button></footer>
    </section>
    <header class="history-heading"><h3>历史备份 <span>{{ rows.length }}</span></h3><button class="ghost-button" :disabled="loading || busy" @click="load()">刷新</button></header>
    <p v-if="!rows.length" class="surface state">{{ loading ? '正在读取备份记录…' : '还没有备份，先生成一份吧。' }}</p>
    <div v-else class="backup-history"><article v-for="row in visible" :key="row.id" class="surface backup-row"><div><strong>{{ new Date(row.created_at).toLocaleString('zh-CN', { hour12: false }) }}</strong><span v-if="row.reason === 'before-restore'" class="backup-tag">还原前自动备份</span><small>{{ size(row.size) }} · {{ row.records }} 条数据 · {{ row.files }} 个文件</small></div><div class="row-actions"><a class="ghost-button" :href="`/api/admin/backups/${row.id}/download`">下载</a><button class="ghost-button delete-button" :disabled="busy" @click="confirmation = { kind: 'delete', title: '删除备份包', row }">删除</button></div></article></div>
    <PaginationNav :page="page" :total-pages="pages" :disabled="busy" @change="page = $event" />
    <UiDialog :open="!!confirmation" :title="confirmation?.title || ''" :busy="uploading || deleting" @close="confirmation = null"><p class="confirm-copy">{{ confirmation?.kind === 'delete' ? '删除后将无法从此备份包还原。' : mode === 'overwrite' ? '当前数据将被备份中的内容替换。文件上传成功并完成校验后，才会开始替换；还原前的自动备份会保留在历史列表。' : '现有内容会保留，只导入备份中新增的数据和文件。重复导入同一备份不会重复创建内容。' }}</p><p v-if="uploading" role="status">正在上传：{{ uploadProgress }}%</p><div v-if="uploading" class="upload-track"><span :style="{ width: `${uploadProgress}%` }"></span></div><div class="confirm-actions"><button class="ghost-button" :disabled="uploading || deleting" @click="confirmation = null">取消</button><button class="primary-button" :disabled="uploading || deleting" @click="confirm">{{ uploading ? '正在上传…' : deleting ? '正在删除…' : confirmation?.kind === 'delete' ? '确认删除' : '上传并还原' }}</button></div></UiDialog>
  </section>
</template>

<style scoped>
.backup-admin{max-width:1000px}.backup-heading,.history-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}h2{font-size:27px;margin:0 0 8px}h3{font-size:20px;margin:0}.backup-heading p,.restore-panel>p{color:var(--muted);font-size:13px;line-height:1.8;margin:0}.restore-panel{padding:26px;margin:24px 0 32px}.restore-panel>p{margin:12px 0 22px}.restore-modes{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px}.restore-modes label{display:flex;align-items:flex-start;gap:10px;padding:16px;border-radius:5px;background:var(--paper-deep);cursor:pointer;margin:0}.restore-modes label.selected{background:var(--accent-soft);box-shadow:3px 3px 0 var(--sun)}.restore-modes input{width:auto;margin:3px 0 0;accent-color:var(--ink)}.restore-modes strong{font-size:14px}.restore-modes small,.backup-row small,.job-status small{display:block;font-size:12px;color:var(--muted);line-height:1.7;margin-top:6px}.backup-drop{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;padding:28px 18px;background:var(--paper-deep);border-radius:5px;transition:background .2s,transform .2s;text-align:center}.backup-drop.dragging{background:var(--accent-soft);transform:translateY(-3px)}.backup-drop strong{font-size:14px;overflow-wrap:anywhere}.backup-drop small{font-size:12px;color:var(--muted)}.file-input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none}.restore-panel footer{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:24px}.restore-panel footer small{max-width:500px;color:var(--muted);font-size:12px;line-height:1.8}.history-heading h3 span{margin-left:8px;color:var(--muted);font-size:14px}.backup-history{display:grid;gap:16px}.backup-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 22px}.backup-row strong{font-size:15px}.backup-tag{display:inline-block;background:var(--accent-soft);color:var(--ink);font-size:10px;padding:4px 6px;border-radius:3px;margin-left:10px}.row-actions{display:flex;gap:10px;flex:none}.row-actions a{display:inline-flex;align-items:center;text-decoration:none}.delete-button{color:var(--error-text)}.backup-message{padding:14px 16px;background:var(--sky);border-radius:4px;line-height:1.8;font-size:13px;overflow-wrap:anywhere}.backup-message.error{color:var(--error-text);background:var(--warning-bg)}.job-status{display:flex;gap:16px;padding:20px;margin:20px 0}.job-status p{font-size:13px;margin:6px 0}.working-dot{width:11px;height:11px;background:var(--sun);border-radius:50%;margin-top:5px;flex:none;animation:working 1.6s ease-in-out infinite}.confirm-copy{font-size:14px;line-height:1.9;color:var(--muted)}.confirm-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.upload-track{height:5px;background:var(--paper-deep);border-radius:3px;overflow:hidden}.upload-track span{display:block;height:100%;background:var(--sun);transition:width .2s}button:disabled,.backup-drop.disabled{opacity:.55}button:disabled{cursor:not-allowed}@keyframes working{50%{opacity:.3}}@media(max-width:600px){.backup-heading{align-items:flex-start}.backup-heading .primary-button{font-size:12px;flex:none}.restore-panel{padding:20px}.restore-modes{grid-template-columns:1fr;gap:12px}.restore-panel footer{align-items:flex-start;flex-direction:column}.restore-panel footer button{width:100%}.backup-row{padding:18px;align-items:flex-start;flex-wrap:wrap}.row-actions{margin-left:auto}.backup-tag{display:block;width:fit-content;margin:8px 0 0}}@media(prefers-reduced-motion:reduce){.working-dot{animation:none}.backup-drop,.upload-track span{transition:none}}
</style>
