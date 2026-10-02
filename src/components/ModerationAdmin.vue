<script setup>
import { ref, watch, onUnmounted } from 'vue'
import UiDialog from './UiDialog.vue'

const props = defineProps({ mode: { type: String, default: 'reports' } })
const rows = ref([]), status = ref('pending'), page = ref(1), total = ref(0)
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const email = ref(''), reason = ref(''), confirmation = ref(null)
const labels = { delete: '删除内容', 'delete-ban': '删除内容并封禁邮箱', keep: '保留内容', 'keep-mute': '保留并不再提醒', withdrawn: '用户已撤回' }
let revision = 0
async function request(path, method = 'GET', body) {
  const response = await fetch(`/api/admin/moderation${path}`, { credentials: 'same-origin', cache: 'no-store', method,
    ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) } : {}) })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '操作失败')
  return result
}
async function load() {
  const version = ++revision
  loading.value = true; error.value = ''
  try {
    const result = await request(props.mode === 'reports' ? `/reports?status=${status.value}&page=${page.value}` : '/blacklist')
    if (version !== revision) return
    rows.value = result.data; total.value = result.total || 0
  } catch (cause) { if (version === revision) error.value = cause.message }
  finally { if (version === revision) loading.value = false }
}
async function perform() {
  const pending = confirmation.value
  if (!pending || busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = pending.remove
      ? await request('/blacklist', 'DELETE', { email: pending.row.email })
      : await request(`/reports/${pending.row.id}`, 'POST', { action: pending.action })
    confirmation.value = null; notice.value = result.message
    await load()
  } catch (cause) { error.value = cause.message; confirmation.value = null }
  finally { busy.value = false }
}
async function handle(row, action) {
  if (busy.value) return
  confirmation.value = { row, action }
  if (action === 'keep') await perform()
}
async function add() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await request('/blacklist', 'POST', { email: email.value, reason: reason.value })
    email.value = ''; reason.value = ''; notice.value = result.message; await load()
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
const date = value => new Date(value).toLocaleString('zh-CN')
watch(() => props.mode, () => { page.value = 1; rows.value = []; notice.value = ''; confirmation.value = null; load() }, { immediate: true })
watch(status, () => { page.value = 1; load() })
onUnmounted(() => { revision++ })
function paginate(shift) { page.value += shift; load() }
</script>
<template>
  <section class="moderation-admin">
    <header class="moderation-heading"><div><h2>{{ mode === 'reports' ? '举报内容处理' : '黑名单用户' }}</h2><p>{{ mode === 'reports' ? '查看举报原因与内容，决定保留、删除或封禁。' : '被封禁的邮箱不能注册、登录或参与评论。解除后需重新登录。' }}</p></div><button class="ghost-button" :disabled="loading || busy" @click="load">刷新</button></header>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p><p v-if="notice" class="feedback" role="status">{{ notice }}</p>
    <template v-if="mode === 'reports'">
      <div class="report-tabs" role="group" aria-label="举报状态"><button v-for="item in ['pending', 'resolved']" :key="item" :class="{ active: status === item }" :disabled="busy" @click="status = item">{{ item === 'pending' ? '待处理' : '已处理' }}</button><span>{{ total }} 条</span></div>
      <p v-if="loading" class="empty" role="status">正在读取…</p>
      <p v-else-if="!rows.length" class="surface empty">{{ status === 'pending' ? '暂无待处理举报' : '暂无处理记录' }}</p>
      <div v-else class="moderation-list">
        <article v-for="row in rows" :key="row.id" class="surface report-card">
          <header><div><strong>{{ row.author_name }}</strong><small>{{ row.author_email }}</small></div><time>{{ date(row.created_at) }}</time></header>
          <p class="source">来自 <a :href="row.entry_path" target="_blank" rel="noopener">{{ row.entry_title || '未命名内容' }} ↗</a><span v-if="!row.comment_id"> · 原内容已删除</span><span v-else>{{ row.comment_root_id ? ' · 回复' : ' · 根评论' }}</span></p>
          <p class="comment-snapshot">{{ row.body }}</p>
          <div class="reason-list"><span v-for="item in row.reasons" :key="item">{{ item }}</span></div>
          <p v-if="row.description" class="report-description">{{ row.description }}</p>
          <p class="reporter">举报人：{{ row.reporter_name || '已注销用户' }}<span v-if="row.reporter_email"> · {{ row.reporter_email }}</span></p>
          <div v-if="row.status === 'pending'" class="report-actions"><button :disabled="busy" @click="handle(row, 'keep')">保留内容</button><button :disabled="busy" @click="handle(row, 'keep-mute')">保留并不再提醒</button><button class="danger" :disabled="busy" @click="handle(row, 'delete')">删除内容</button><button class="danger" :disabled="busy" @click="handle(row, 'delete-ban')">删除并封禁邮箱</button></div>
          <p v-else class="resolution">{{ labels[row.action] || row.action }} · {{ date(row.resolved_at) }}</p>
        </article>
      </div>
      <div v-if="total > 20" class="pagination"><button class="ghost-button" :disabled="page === 1 || loading || busy" @click="paginate(-1)">上一页</button><span>{{ page }} / {{ Math.ceil(total / 20) }}</span><button class="ghost-button" :disabled="page * 20 >= total || loading || busy" @click="paginate(1)">下一页</button></div>
    </template>
    <template v-else>
      <form class="surface blacklist-form" @submit.prevent="add"><label>邮箱地址<input v-model="email" type="email" required maxlength="254" placeholder="需要封禁的邮箱" :disabled="busy" /></label><label>原因（可选）<input v-model="reason" maxlength="500" placeholder="仅在后台记录" :disabled="busy" /></label><button class="primary-button" :disabled="busy">{{ busy ? '保存中…' : '添加到黑名单' }}</button></form>
      <p v-if="loading" class="empty" role="status">正在读取…</p><p v-else-if="!rows.length" class="surface empty">黑名单为空</p>
      <div v-else class="moderation-list"><article v-for="row in rows" :key="row.email" class="surface blacklist-row"><div><strong>{{ row.email }}</strong><p v-if="row.reason">{{ row.reason }}</p><small>{{ date(row.created_at) }}</small></div><button class="ghost-button" :disabled="busy" @click="confirmation = { row, remove: true }">解除封禁</button></article></div>
    </template>
    <UiDialog :open="!!confirmation" :title="confirmation?.remove ? '解除封禁' : labels[confirmation?.action]" :busy="busy" @close="confirmation = null">
      <template v-if="confirmation"><p class="confirm-text" v-if="confirmation.remove">解除 {{ confirmation.row.email }} 的封禁？</p><template v-else><p class="confirm-text" v-if="confirmation.action === 'keep-mute'">保留这条内容，后续举报将不再生成处理记录或通知邮件。</p><p class="confirm-text" v-else>{{ confirmation.row.comment_root_id ? '删除这条回复。其他回复仍会保留。' : '删除这条根评论及其全部回复。' }}<template v-if="confirmation.action === 'delete-ban'">同时封禁 {{ confirmation.row.author_email }} 并撤销该用户的登录会话。</template></p></template><div class="dialog-actions"><button class="ghost-button" :disabled="busy" @click="confirmation = null">取消</button><button class="primary-button" :disabled="busy" @click="perform">{{ busy ? '处理中…' : '确认' }}</button></div></template>
    </UiDialog>
  </section>
</template>
<style scoped>
.moderation-admin { max-width: 930px; }
.moderation-heading { display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 22px; }
h2 { margin: 0 0 8px; font-size: 27px; font-family: var(--heading-font); }
.moderation-heading p, .source, .reporter, .resolution { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.feedback { padding: 12px 16px; background: var(--sky); border-radius: 5px; font-size: 13px; }
.feedback.error { color: var(--error-text); background: var(--warning-bg); }
.report-tabs { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.report-tabs button, .report-actions button { border: 0; border-radius: 4px; padding: 8px 12px; color: var(--ink); background: var(--paper); box-shadow: 3px 3px 0 var(--paper-deep); font-size: 12px; font-weight: 700; }
.report-tabs .active { background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); }
.report-tabs span { margin-left: auto; color: var(--muted); font-size: 12px; }
.moderation-list { display: grid; gap: 18px; }
.report-card { padding: 24px; }
.report-card header { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.report-card small { margin-left: 12px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
time { color: var(--muted); font-size: 11px; }
.source a { color: var(--accent); text-underline-offset: 3px; }
.comment-snapshot { margin: 16px 0; padding: 15px; background: var(--paper-deep); border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; font-size: 14px; }
.reason-list { display: flex; flex-wrap: wrap; gap: 7px; }
.reason-list span { padding: 5px 8px; background: var(--accent-soft); border-radius: 3px; font-size: 11px; }
.report-description { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.8; }
.reporter { margin-top: 12px; }
.report-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.report-actions button { background: var(--sky); }
.report-actions .danger { color: var(--danger); background: var(--warning-bg); }
.resolution { margin-top: 16px; color: var(--ink); }
.empty { padding: 25px; color: var(--muted); font-size: 13px; }
.pagination { display: flex; justify-content: space-between; align-items: center; gap: 15px; margin-top: 24px; font-size: 12px; }
.blacklist-form { padding: 24px; margin-bottom: 26px; }
label { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; font-size: 13px; font-weight: 700; }
input { padding: 11px 12px; border: 0; border-radius: 5px; background: var(--field-bg); color: var(--ink); font-size: 14px; }
input:focus-visible { outline: 2px solid var(--accent); }
.blacklist-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 22px; }
.blacklist-row > div { min-width: 0; overflow-wrap: anywhere; }
.blacklist-row p { white-space: pre-wrap; font-size: 13px; line-height: 1.7; margin: 8px 0; }
.blacklist-row small { color: var(--muted); font-size: 11px; }
.blacklist-row button { flex: none; font-size: 12px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 14px; margin-top: 22px; }
.confirm-text { overflow-wrap: anywhere; line-height: 1.8; font-size: 14px; }
button:disabled { opacity: .55; cursor: not-allowed; }
@media (max-width: 600px) { .report-card, .blacklist-form { padding: 18px; } .report-card small { display: block; margin: 6px 0 0; } .blacklist-row { align-items: flex-start; flex-direction: column; } }
</style>
