<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import MarkdownContent from './MarkdownContent.vue'

const emit = defineEmits(['notice'])
const config = ref(null), collections = ref([]), tasks = ref([]), selected = ref(null)
const busy = ref(false), error = ref(''), files = ref([]), fileInput = ref(null)
const form = ref({ title: '', collection_id: '', prompt: '', links: '' })
const statusText = { queued: '排队中', running: '正在学习', published: '已发布', failed: '失败', cancelled: '已取消' }
const working = task => task && (['queued', 'running'].includes(task.status) || task.stopping)
const ready = computed(() => config.value?.keyConfigured && collections.value.some(item => item.publishable))
const request = async (path, options = {}) => {
  const response = await fetch(`/api/admin/ai${path}`, { credentials: 'same-origin', ...options })
  const result = await response.json()
  if (!result.success) throw new Error(result.message || '操作失败')
  return result.data
}
const json = (method, body = {}) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
async function refresh() {
  tasks.value = await request('/tasks')
  if (selected.value) selected.value = await request(`/tasks/${selected.value.id}`)
}
async function select(task) { try { selected.value = await request(`/tasks/${task.id}`); error.value = '' } catch (cause) { error.value = cause.message } }
async function start() {
  busy.value = true; error.value = ''
  try {
    const data = new FormData()
    for (const [key, value] of Object.entries(form.value)) data.append(key, value)
    for (const file of files.value) data.append('files', file)
    selected.value = await request('/tasks', { method: 'POST', body: data })
    form.value.title = ''; form.value.prompt = ''; form.value.links = ''; files.value = []
    if (fileInput.value) fileInput.value.value = ''
    await refresh()
    emit('notice', '学习任务已创建，可以离开此页面，后台会继续处理。')
  } catch (cause) { error.value = cause.message } finally { busy.value = false }
}
async function action(task, name) {
  busy.value = true; error.value = ''
  try { selected.value = await request(`/tasks/${task.id}/${name}`, json('POST')); await refresh() }
  catch (cause) { error.value = cause.message } finally { busy.value = false }
}
async function remove(task) {
  if (!confirm('删除任务记录和任务日志？已发布的报告会保留，未被任何内容引用的任务附件会被清理。')) return
  busy.value = true
  try { await request(`/tasks/${task.id}`, { method: 'DELETE' }); if (selected.value?.id === task.id) selected.value = null; await refresh() }
  catch (cause) { error.value = cause.message } finally { busy.value = false }
}
async function saveConfig() {
  busy.value = true
  try { await request('/config', json('PUT', config.value)); emit('notice', '学习配置已保存，下次新建或重试任务时生效。') }
  catch (cause) { error.value = cause.message } finally { busy.value = false }
}
function pickFiles(event) {
  const picked = [...(event.target.files || [])]
  if (picked.length > 12 || picked.some(file => file.size > 50 * 1024 * 1024)) { error.value = '最多 12 个文件，每个文件不超过 50 MB'; event.target.value = ''; return }
  files.value = picked; error.value = ''
}
let timer, disposed = false
async function poll() {
  try { await refresh() } catch (cause) { error.value = cause.message }
  if (!disposed) timer = setTimeout(poll, tasks.value.some(working) ? 2500 : 10000)
}
onMounted(async () => {
  try {
    const [configuration, destinations] = await Promise.all([request('/config'), request('/collections')])
    config.value = configuration; collections.value = destinations
    form.value.collection_id = destinations.find(item => item.publishable)?.id || ''
    await poll()
  } catch (cause) { error.value = cause.message }
})
onUnmounted(() => { disposed = true; clearTimeout(timer) })
</script>

<template>
  <section class="learning-admin">
    <header class="learning-heading"><div><h2>AI 学习</h2><p>放进课件、链接或一个学习要求，让它整理成一篇可复习的报告。</p></div><span class="model-label">{{ config?.model || 'deepseek-flash' }}</span></header>
    <p v-if="error" class="learning-error" role="alert">{{ error }}</p>
    <p v-if="config && !config.keyConfigured" class="learning-error">服务端尚未配置 API key。在根目录 .env 设置 DEEPSEEK_API_KEY 后重启后端。</p>
    <p v-if="config && !collections.some(item => item.publishable)" class="learning-error">请先在资源库创建并发布一个合集。报告会直接公开，目标合集及上级合集都需要已发布。</p>
    <form class="surface learning-form" @submit.prevent="start">
      <div class="learning-grid"><label>任务名称<input v-model="form.title" maxlength="200" placeholder="例如：线性代数 · 第三课" /></label><label>报告目的地<select v-model="form.collection_id" required><option value="" disabled>选择一个合集</option><option v-for="collection in collections" :key="collection.id" :value="collection.id" :disabled="!collection.publishable">{{ collection.path }}{{ collection.publishable ? '' : '（尚未公开）' }}</option></select></label></div>
      <label>课件与图片<input ref="fileInput" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md" :disabled="busy" @change="pickFiles" /><small>PDF、图片、文本；最多 12 个文件，每个不超过 50 MB。提交任务时一并上传。</small></label>
      <ul v-if="files.length" class="picked-files"><li v-for="(file, index) in files" :key="index">{{ file.name }} <span>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</span><button type="button" :disabled="busy" @click="files.splice(index, 1)">移除</button></li></ul>
      <label>资料链接<textarea v-model="form.links" rows="2" placeholder="每行一个网址，可与文件、学习要求一起提供" /></label>
      <label>学习要求<textarea v-model="form.prompt" rows="4" maxlength="20000" placeholder="例如：学习这份课件，详细讲解核心概念和推导过程，再给出复习总结。也可以只输入一个学习主题。" /></label>
      <div class="learning-submit"><p>包含全部子合集和草稿作为可读上下文。报告提交成功后直接公开发布。</p><button class="primary-button" :disabled="busy || !ready || !form.collection_id || (!files.length && !form.links.trim() && !form.prompt.trim())">{{ busy ? '正在处理…' : '开始学习' }}</button></div>
    </form>
    <details v-if="config" class="surface learning-config"><summary>学习设置 <small>Harness {{ config.harnessVersion }} · 密钥{{ config.keyConfigured ? '已配置' : '未配置' }}</small></summary><div class="learning-grid"><label>每次请求的输出上限<input v-model.number="config.maxOutputTokens" type="number" min="4096" max="32768" step="1024" /></label><label>单个任务时限（分钟）<input v-model.number="config.taskTimeoutMinutes" type="number" min="5" max="120" /></label></div><label>附加报告要求<textarea v-model="config.reportInstructions" rows="3" maxlength="10000" placeholder="例如：尽量用直观类比解释，所有代码注明语言。" /></label><button type="button" class="ghost-button" :disabled="busy" @click="saveConfig">保存设置</button></details>
    <div class="learning-heading"><h2>学习记录</h2><button class="ghost-button" @click="refresh().catch(cause => error = cause.message)">刷新</button></div>
    <p v-if="!tasks.length" class="surface state">还没有学习任务</p>
    <div v-else class="learning-history">
      <div class="task-list"><button v-for="task in tasks" :key="task.id" type="button" class="surface task-card" :class="{ selected: selected?.id === task.id }" @click="select(task)"><div><strong>{{ task.title }}</strong><span class="task-status" :class="task.status">{{ statusText[task.status] }}</span></div><small>{{ task.collection_title }} · {{ new Date(task.created_at).toLocaleString('zh-CN') }}</small><p>{{ task.iterations }} / {{ task.budget }} 次迭代</p></button></div>
      <article v-if="selected" class="surface task-detail">
        <header><h3>{{ selected.title }}</h3><span class="task-status" :class="selected.status">{{ statusText[selected.status] }}</span></header>
        <p class="task-progress">{{ selected.iterations }} / {{ selected.budget }} 次迭代 · 总上限 48</p><progress :value="selected.iterations" :max="selected.budget" />
        <p v-if="selected.error" class="learning-error">{{ selected.error }}</p>
        <div class="task-actions"><a v-if="selected.result_entry_id && selected.status === 'published'" class="primary-button" :href="`/entry/${selected.result_entry_id}`" target="_blank" rel="noopener">查看报告</a><a class="ghost-button" :href="`/api/admin/ai/tasks/${selected.id}/report`">下载 Markdown</a><button v-if="['queued','running'].includes(selected.status)" class="ghost-button" :disabled="busy" @click="action(selected, 'cancel')">取消任务</button><button v-if="['failed','cancelled'].includes(selected.status)" class="ghost-button" :disabled="busy || selected.stopping" @click="action(selected, 'retry')">{{ selected.stopping ? '正在停止…' : '重新学习' }}</button><button v-if="!working(selected)" class="ghost-button" :disabled="busy" @click="remove(selected)">删除记录</button></div>
        <details><summary>资料与学习要求</summary><p class="task-prompt">{{ selected.prompt || '按默认要求学习资料' }}</p><ul><li v-for="file in selected.files" :key="file.id"><a :href="file.url" target="_blank" rel="noopener">{{ file.name }}</a> <small>{{ file.role === 'derived' ? '生成附件' : '源资料' }}</small></li><li v-for="link in selected.links" :key="link"><a :href="link" target="_blank" rel="noopener">{{ link }}</a></li></ul></details>
        <p class="task-usage">主模型用量：输入 {{ (selected.usage.inputTokens || 0).toLocaleString() }} / 输出 {{ (selected.usage.outputTokens || 0).toLocaleString() }} tokens。搜索与压缩会另有消耗。</p>
        <details v-if="selected.draft?.body"><summary>已保存报告预览</summary><MarkdownContent :source="selected.draft.body" /></details>
        <h4>运行日志</h4><ol class="task-log" aria-live="polite"><li v-for="item in selected.events" :key="item.id" :class="item.kind"><time>{{ new Date(item.created_at).toLocaleTimeString('zh-CN') }}</time><span>{{ item.message }}</span></li></ol>
      </article>
      <div v-else class="surface state">选择任务查看进度、资料和报告</div>
    </div>
  </section>
</template>

<style scoped>
.learning-admin { max-width: 1050px; }
.learning-heading,.learning-submit { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 20px; }
h2 { margin: 0; font-size: 27px; font-weight: 900; } h3 { margin: 0; font-size: 19px; } p, small { color: var(--muted); line-height: 1.7; } .learning-heading p { margin: 6px 0 0; font-size: 13px; }
.model-label { background: var(--sky); padding: 8px 12px; border-radius: 4px; font-size: 12px; white-space: nowrap; box-shadow: 3px 3px 0 var(--denim); }
.learning-form { padding: 25px; margin-bottom: 24px; } .learning-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }
label { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; font-size: 13px; font-weight: 700; }
input,textarea,select { width: 100%; padding: 11px 12px; border: 0; border-radius: 5px; outline: 0; color: var(--ink); background: var(--paper-deep); } input:focus,textarea:focus,select:focus { background: var(--sky); box-shadow: 0 3px 0 var(--accent); } textarea { resize: vertical; line-height: 1.7; }
small { font-size: 11px; font-weight: 400; } .learning-submit { margin: 0; } .learning-submit p { margin: 0; max-width: 550px; font-size: 12px; } .learning-submit button { flex-shrink: 0; }
.learning-error { padding: 12px 15px; background: var(--accent-soft); border-radius: 4px; font-size: 13px; white-space: pre-wrap; }
.picked-files { padding: 0; list-style: none; } .picked-files li { display: flex; align-items: center; gap: 12px; padding: 6px 0; overflow-wrap: anywhere; font-size: 13px; } .picked-files span { margin-left: auto; font-size: 11px; color: var(--muted); } .picked-files button { color: var(--ink); padding: 5px; border: 0; background: var(--sky); border-radius: 3px; }
.learning-config { padding: 20px 25px; margin-bottom: 32px; } summary { cursor: pointer; font-size: 13px; font-weight: 700; } .learning-config summary { margin-bottom: 18px; } .learning-config summary small { margin-left: 12px; }
.learning-history { display: grid; grid-template-columns: minmax(220px, .75fr) minmax(0,1.6fr); align-items: start; gap: 22px; } .task-list { display: grid; gap: 13px; } .task-card { border: 0; color: var(--ink); padding: 18px; text-align: left; transition: transform .2s ease,background .2s ease; } .task-card:hover { transform: translateY(-2px); } .task-card.selected { background: var(--sky); box-shadow: 5px 6px 0 var(--denim); } .task-card>div { display: flex; justify-content: space-between; gap: 10px; } .task-card strong { overflow-wrap: anywhere; } .task-card small { display: block; margin-top: 8px; } .task-card p { margin: 8px 0 0; font-size: 12px; }
.task-status { flex-shrink: 0; font-size: 11px; padding: 4px 8px; align-self: start; background: var(--paper-deep); border-radius: 3px; } .task-status.running,.task-status.queued { background: var(--accent-soft); } .task-status.published { background: var(--mint); } .task-status.failed { background: var(--failed-bg); }
.task-detail { padding: 23px; min-width: 0; } .task-detail header { display: flex; justify-content: space-between; gap: 12px; } .task-progress,.task-usage { font-size: 12px; } progress { width: 100%; height: 8px; accent-color: var(--denim); } .task-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; } .task-actions a,.task-actions button { min-height: 35px; padding: 6px 10px; font-size: 12px; } .task-detail details { padding: 14px; margin: 15px 0; border-radius: 4px; background: var(--paper-deep); } .task-detail details p,.task-detail details li { font-size: 12px; overflow-wrap: anywhere; } .task-prompt { white-space: pre-wrap; } .task-detail details .markdown { margin-top: 16px; }
.task-log { padding: 0; list-style: none; max-height: 460px; overflow-y: auto; } .task-log li { display: grid; grid-template-columns: 62px minmax(0,1fr); gap: 10px; padding: 10px 0; font-size: 12px; } .task-log li:nth-child(even) { background: var(--paper-deep); } .task-log time { color: var(--soft); font-size: 10px; } .task-log span { white-space: pre-wrap; overflow-wrap: anywhere; } .task-log .tool-error,.task-log .failed { color: var(--error-text); }
@media (max-width: 760px) { .learning-history { grid-template-columns: 1fr; } .learning-heading,.learning-submit { align-items: flex-start; flex-wrap: wrap; } .learning-grid { grid-template-columns: 1fr; gap: 0; } .learning-form,.task-detail,.learning-config { padding: 18px; } }
</style>
