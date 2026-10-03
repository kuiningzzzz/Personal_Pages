<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import MarkdownContent from './MarkdownContent.vue'
import PaginationNav from './PaginationNav.vue'
import UiDialog from './UiDialog.vue'

const rows = ref([]), tags = ref([]), page = ref(1), totalPages = ref(1), total = ref(0)
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const editor = ref(null), newTag = ref(''), deletion = ref(null)
let revision = 0
async function request(path = '', method = 'GET', body) {
  const response = await fetch(`/api/admin/announcements${path}`, { method, credentials: 'same-origin', cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '操作失败')
  return result
}
async function load() {
  const current = ++revision; loading.value = true; error.value = ''
  try {
    const [list, labels] = await Promise.all([request(`?page=${page.value}`), request('/tags')])
    if (current !== revision) return
    rows.value = list.data; page.value = list.page; totalPages.value = list.totalPages; total.value = list.total
    tags.value = labels.data
  } catch (cause) { if (current === revision) error.value = cause.message }
  finally { if (current === revision) loading.value = false }
}
async function mutate(action, message) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await action()
    notice.value = [message, ...(result?.warnings || [])].join('；')
    await load()
    return true
  } catch (cause) { error.value = cause.message; return false }
  finally { busy.value = false }
}
function localDate(value) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16) }
function edit(row) {
  error.value = ''; notice.value = ''
  editor.value = row ? { ...row, tag_ids: row.tags.map(tag => tag.id), date: localDate(row.published_at) } : { id: null, title: '', body: '', status: 'published', pinned: false, tag_ids: [], date: localDate(new Date()) }
}
async function save() {
  const value = editor.value
  if (!value || !Number.isFinite(Date.parse(value.date))) { error.value = '请填写有效的发布时间'; return }
  const saved = await mutate(() => request(value.id ? `/${value.id}` : '', value.id ? 'PUT' : 'POST', { title: value.title, body: value.body, status: value.status, pinned: value.pinned, tag_ids: value.tag_ids, published_at: new Date(value.date).toISOString() }), '公告已保存')
  if (saved) editor.value = null
}
function togglePin(row) { mutate(() => request(`/${row.id}`, 'PUT', { ...row, tag_ids: row.tags.map(tag => tag.id), pinned: !row.pinned }), row.pinned ? '已取消置顶' : '已置顶') }
async function addTag() { if (await mutate(() => request('/tags', 'POST', { name: newTag.value }), '标签已添加')) newTag.value = '' }
function renameTag(tag) { mutate(() => request(`/tags/${tag.id}`, 'PUT', { name: tag.name }), '标签已更新') }
async function remove() {
  const target = deletion.value
  if (await mutate(() => request(target.kind === 'tag' ? `/tags/${target.id}` : `/${target.id}`, 'DELETE'), target.kind === 'tag' ? '标签已删除' : '公告已删除')) {
    if (target.kind === 'tag' && editor.value) editor.value.tag_ids = editor.value.tag_ids.filter(id => id !== target.id)
    deletion.value = null
  }
}
async function upload(event) {
  const file = event.target.files?.[0]; if (!file || busy.value) return
  busy.value = true; error.value = ''
  try {
    const data = new FormData(); data.append('file', file)
    const response = await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', body: data })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.message || '上传失败')
    const name = String(result.name || file.name).replace(/[\[\]\\]/g, '\\$&')
    editor.value.body += `\n\n${file.type.startsWith('image/') ? '!' : ''}[${name}](${result.url})\n`
    notice.value = '已插入正文，保存公告后生效'
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false; event.target.value = '' }
}
function paginate(next) { page.value = next; load() }
const date = value => new Date(value).toLocaleString('zh-CN')
onMounted(load)
onUnmounted(() => { revision++ })
</script>

<template>
  <section class="announcements-admin">
    <header class="management-heading"><div><h2>公告管理</h2><p>公告显示在首页右侧下方，最多置顶 2 条，按发布时间排列。</p></div><button v-if="!editor" class="primary-button" :disabled="loading || busy" @click="edit(null)">+ 新建公告</button></header>
    <p v-if="error" class="management-notice error" role="alert">{{ error }}</p><p v-if="notice" class="management-notice" role="status">{{ notice }}</p>
    <details class="tag-manager"><summary>公告标签管理 · {{ tags.length }} 个标签</summary><p>标签会显示在标题前；修改名称同步更新已有公告，删除标签不会删除公告。</p><fieldset :disabled="busy || loading"><form class="tag-row" @submit.prevent="addTag"><input v-model="newTag" aria-label="新标签名称" maxlength="30" placeholder="例如：更新日志、重要提醒" required /><button class="primary-button">添加标签</button></form><div v-for="tag in tags" :key="tag.id" class="tag-row"><input v-model="tag.name" aria-label="标签名称" maxlength="30" /><button type="button" class="ghost-button" @click="renameTag(tag)">保存</button><button type="button" class="ghost-button" @click="deletion = { kind: 'tag', ...tag }">删除</button></div></fieldset></details>
    <form v-if="editor" class="surface announcement-editor" @submit.prevent="save">
      <div class="editor-heading"><h3>{{ editor.id ? '编辑公告' : '新建公告' }}</h3><button type="button" class="ghost-button" :disabled="busy" @click="editor = null">返回列表</button></div>
      <fieldset :disabled="busy">
        <label>标题<input v-model="editor.title" maxlength="200" required /></label>
        <label>正文 · Markdown<textarea v-model="editor.body" rows="10" placeholder="支持链接、图片、加粗、代码块等"></textarea></label>
        <label class="upload-field">上传图片或文件并插入正文<input type="file" @change="upload" /></label>
        <details class="preview"><summary>预览正文</summary><MarkdownContent :source="editor.body" /></details>
        <div class="editor-options"><label>发布状态<select v-model="editor.status" @change="editor.status === 'draft' && (editor.pinned = false)"><option value="published">发布</option><option value="draft">草稿</option></select></label><label>发布时间<input v-model="editor.date" type="datetime-local" required /></label></div>
        <label class="check"><input v-model="editor.pinned" type="checkbox" :disabled="editor.status !== 'published'" />置顶公告（最多 2 条，仅限已发布公告）</label>
        <div class="tag-options"><span>标题标签</span><p v-if="!tags.length">暂无标签，可在上方的标签管理中添加。</p><label v-for="tag in tags" :key="tag.id" class="check"><input v-model="editor.tag_ids" type="checkbox" :value="tag.id" />{{ tag.name }}</label></div>
        <button type="submit" class="primary-button">{{ busy ? '正在保存…' : '保存公告' }}</button>
      </fieldset>
    </form>
    <template v-else>
      <p v-if="loading" class="surface state">正在读取公告…</p>
      <p v-else-if="!rows.length" class="surface state">还没有公告，点击「新建公告」开始编写。</p>
      <div v-else class="admin-announcement-list"><article v-for="row in rows" :key="row.id" class="surface admin-announcement"><div><div class="row-labels"><span :class="{ published: row.status === 'published' }">{{ row.status === 'published' ? '已发布' : '草稿' }}</span><span v-if="row.pinned">置顶</span><span v-for="tag in row.tags" :key="tag.id">{{ tag.name }}</span></div><h3>{{ row.title }}</h3><time :datetime="row.published_at">{{ date(row.published_at) }}</time></div><div class="row-actions"><button type="button" class="ghost-button" :disabled="busy || loading" @click="edit(row)">编辑</button><button v-if="row.status === 'published'" type="button" class="ghost-button" :disabled="busy || loading" @click="togglePin(row)">{{ row.pinned ? '取消置顶' : '置顶' }}</button><button type="button" class="ghost-button" :disabled="busy || loading" @click="deletion = { kind: 'announcement', ...row }">删除</button></div></article></div>
      <PaginationNav :page="page" :total-pages="totalPages" :disabled="loading || busy" @change="paginate" /><p class="list-total">共 {{ total }} 条公告</p>
    </template>
    <UiDialog :open="Boolean(deletion)" title="确认删除" :busy="busy" @close="deletion = null"><p v-if="deletion">{{ deletion.kind === 'tag' ? `删除标签「${deletion.name}」？已有公告将移除这个标签。` : `删除公告「${deletion.title}」？此操作无法恢复。` }}</p><p v-if="error" role="alert" class="management-notice error">{{ error }}</p><div class="row-actions"><button class="ghost-button" :disabled="busy" @click="deletion = null">取消</button><button class="primary-button" :disabled="busy" @click="remove">确认删除</button></div></UiDialog>
  </section>
</template>

<style scoped>
.announcements-admin { max-width: 1080px; }h2,h3 { margin: 0; }.management-heading,.editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }.management-heading h2 { font-size: 27px; }.management-heading p,.tag-manager p { color: var(--muted); font-size: 12px; line-height: 1.8; }.tag-manager { padding: 16px 18px; margin: 22px 0; background: var(--paper-deep); border-radius: 5px; }.tag-manager summary { cursor: pointer; font-size: 14px; font-weight: 600; }.tag-row { display: flex; gap: 8px; margin-top: 10px; }.tag-row input { flex: 1; min-width: 0; }
fieldset { margin: 0; border: 0; padding: 0; min-width: 0; }input:not([type=checkbox]),textarea,select { width: 100%; box-sizing: border-box; padding: 12px; border: 0; border-radius: 4px; background: var(--field-bg); color: var(--ink); font: inherit; font-size: 13px; }textarea { resize: vertical; }button { white-space: nowrap; }button:disabled,fieldset:disabled { opacity: .6; }
.announcement-editor { padding: 22px; }.announcement-editor label:not(.check) { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; font-size: 13px; }.editor-options { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }.check { display: inline-flex; gap: 8px; align-items: center; margin: 0 14px 12px 0; color: var(--ink); font-size: 12px; }.check input { accent-color: var(--ink); }.tag-options { margin: 12px 0 20px; }.tag-options>span { display: block; font-size: 13px; margin-bottom: 12px; }.tag-options p { color: var(--muted); font-size: 12px; }.preview { margin: 0 0 22px; font-size: 13px; }.preview summary { cursor: pointer; margin-bottom: 12px; }
.admin-announcement-list { display: grid; gap: 13px; }.admin-announcement { padding: 18px; display: flex; justify-content: space-between; align-items: center; gap: 18px; }.admin-announcement>div:first-child { min-width: 0; }.admin-announcement h3 { margin: 8px 0; font-size: 16px; overflow-wrap: anywhere; }.row-labels { display: flex; flex-wrap: wrap; gap: 6px; }.row-labels span { padding: 3px 7px; font-size: 10px; border-radius: 2px; background: var(--paper-deep); color: var(--muted); }.row-labels .published { color: var(--ink); background: var(--accent-soft); }.admin-announcement time,.list-total { color: var(--muted); font-size: 11px; }.row-actions { display: flex; flex-wrap: wrap; gap: 8px; }.row-actions button { min-height: 34px; padding: 7px 10px; font-size: 12px; }.management-notice { padding: 13px; background: var(--sky); color: var(--ink); border-radius: 4px; font-size: 13px; overflow-wrap: anywhere; }.management-notice.error { background: var(--warning-bg); color: var(--error-text); }
@media(max-width:600px) { .management-heading { align-items: flex-start; }.admin-announcement { align-items: flex-start; flex-direction: column; gap: 12px; }.editor-options { grid-template-columns: 1fr; gap: 0; }.announcement-editor { padding: 17px; }.tag-row { flex-wrap: wrap; }.tag-row input { flex-basis: 100%; } }
</style>
