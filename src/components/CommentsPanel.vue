<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CommentCard from './CommentCard.vue'
import UiDialog from './UiDialog.vue'
import { visitor, loadVisitor } from '../lib/auth'
import { commentsRequest } from '../lib/comments'
import { showSubscriptionNotice } from '../lib/subscriptions'
const props = defineProps({ entryId: { type: Number, required: true }, inline: Boolean, focusCommentId: { type: Number, default: null } })
const route = useRoute()
const roots = ref([]), total = ref(0), page = ref(1), sort = ref('likes'), loading = ref(false), error = ref('')
const draft = ref(''), replying = ref(null), posting = ref(false), composer = ref(null), pending = ref({})
const expanded = ref({}), replyPages = ref({})
const focusId = ref(props.inline ? props.focusCommentId : Number(route.query.comment) || null)
const loginRedirect = computed(() => props.inline ? `/moments?post=${props.entryId}` : route.fullPath)
const reportTarget = ref(null), reasons = ref([]), description = ref(''), reportBusy = ref(false), reportError = ref(''), reportSuccess = ref(false)
const withdrawTarget = ref(null), withdrawBusy = ref(false)
const reportReasons = ['广告营销', '色情低俗', '引战暴力', '政治敏感', '侵犯权益', '其他描述']
const length = computed(() => [...draft.value.trim()].length)
let version = 0, successTimer
async function ensureUser() {
  const user = await loadVisitor(true)
  if (!user) showSubscriptionNotice('登录/注册后即可参与评论')
  return user
}
async function load() {
  const current = ++version
  loading.value = true; error.value = ''
  try {
    const params = new URLSearchParams({ sort: sort.value, page: String(page.value) })
    if (focusId.value) params.set('focus', String(focusId.value))
    const result = await commentsRequest(`/${props.entryId}?${params}`)
    if (current !== version) return
    roots.value = result.data; total.value = result.total
    expanded.value = {}; replyPages.value = {}
    const focused = result.focusedComment
    if (focused?.root_id) {
      const root = roots.value.find(row => row.id === focused.root_id)
      if (root && !root.replies.some(row => row.id === focused.id)) root.replies.push(focused)
      expanded.value[focused.root_id] = true
    }
    await nextTick()
    if (focusId.value) document.getElementById(`comment-${focusId.value}`)?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  } catch (cause) { if (current === version) error.value = cause.message }
  finally { if (current === version) loading.value = false }
}
function updateComment(comment) {
  for (const root of roots.value) {
    if (root.id === comment.id) Object.assign(root, comment)
    else { const reply = root.replies.find(row => row.id === comment.id); if (reply) Object.assign(reply, comment) }
  }
  if (sort.value === 'likes') roots.value.sort((a, b) => b.likes - a.likes || b.created_at.localeCompare(a.created_at) || b.id - a.id)
}
async function like(comment) {
  if (pending.value[comment.id] || !await ensureUser()) return
  pending.value[comment.id] = true
  try { updateComment((await commentsRequest(`/items/${comment.id}/like`, 'POST', { enabled: !comment.liked })).data) }
  catch (cause) { showSubscriptionNotice(cause.message) }
  finally { pending.value[comment.id] = false }
}
async function reply(comment) {
  if (!await ensureUser()) return
  replying.value = comment
  await nextTick(); composer.value?.focus()
}
async function post() {
  if (posting.value || !length.value || length.value > 2000 || !await ensureUser()) return
  posting.value = true
  try {
    const result = await commentsRequest(`/${props.entryId}`, 'POST', { body: draft.value, replyTo: replying.value?.id || null })
    draft.value = ''; replying.value = null; focusId.value = result.data.id; page.value = 1
    await load(); showSubscriptionNotice('评论已发布')
  } catch (cause) { showSubscriptionNotice(cause.message) }
  finally { posting.value = false }
}
async function loadReplies(root, more = false) {
  if (pending.value[`replies-${root.id}`]) return
  pending.value[`replies-${root.id}`] = true
  try {
    const next = more ? (replyPages.value[root.id] || 1) + 1 : 1
    const result = await commentsRequest(`/${props.entryId}/replies/${root.id}?page=${next}`)
    const combined = more ? [...root.replies, ...result.data] : result.data
    root.replies = [...new Map(combined.map(row => [row.id, row])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    root.reply_count = result.total; replyPages.value[root.id] = next; expanded.value[root.id] = true
  } catch (cause) { showSubscriptionNotice(cause.message) }
  finally { pending.value[`replies-${root.id}`] = false }
}
async function toggleReplies(root) {
  if (expanded.value[root.id]) { expanded.value[root.id] = false; return }
  await loadReplies(root)
}
async function startReport(comment) {
  if (!await ensureUser()) return
  clearTimeout(successTimer)
  reasons.value = []; description.value = ''; reportError.value = ''; reportSuccess.value = false; reportTarget.value = comment
}
async function submitReport() {
  if (reportBusy.value) return
  reportBusy.value = true; reportError.value = ''
  try {
    await commentsRequest(`/items/${reportTarget.value.id}/report`, 'POST', { reasons: reasons.value, description: description.value })
    reportSuccess.value = true
    successTimer = setTimeout(() => { reportTarget.value = null }, 1600)
  } catch (cause) { reportError.value = cause.message }
  finally { reportBusy.value = false }
}
async function withdraw() {
  withdrawBusy.value = true
  try {
    await commentsRequest(`/items/${withdrawTarget.value.id}`, 'DELETE')
    if (replying.value?.id === withdrawTarget.value.id || replying.value?.root_id === withdrawTarget.value.id) replying.value = null
    withdrawTarget.value = null; focusId.value = null; await load(); showSubscriptionNotice('评论已撤回')
  } catch (cause) { showSubscriptionNotice(cause.message) }
  finally { withdrawBusy.value = false }
}
function changeSort() { focusId.value = null; page.value = 1; sort.value = sort.value === 'likes' ? 'latest' : 'likes'; load() }
function changePage(next) { focusId.value = null; page.value = next; load() }
watch(() => visitor.value?.id, () => { replying.value = null; load() })
onMounted(load)
onUnmounted(() => { version++; clearTimeout(successTimer) })
</script>
<template>
  <section class="comments-panel" :class="{ 'inline-comments': inline }" aria-label="评论区">
    <header class="comments-heading"><h2>评论</h2><button type="button" :disabled="loading" :aria-label="`当前${sort === 'likes' ? '点赞优先' : '最新优先'}，点击切换排序`" @click="changeSort">⇅ {{ sort === 'likes' ? '点赞优先' : '最新优先' }}</button></header>
    <form v-if="visitor" class="comment-composer" @submit.prevent="post">
      <div v-if="replying" class="replying-label"><span>回复 @{{ replying.username }}</span><button type="button" @click="replying = null">取消</button></div>
      <label class="sr-only" :for="`comment-compose-${entryId}`">{{ replying ? '回复内容' : '评论内容' }}</label>
      <textarea :id="`comment-compose-${entryId}`" ref="composer" v-model="draft" :rows="inline ? 2 : 3" maxlength="4000" :disabled="posting" :placeholder="replying ? '写下你的回复…' : '说说你的想法…'"></textarea>
      <div class="composer-footer"><small>{{ length }} / 2000</small><button type="submit" :disabled="posting || !length || length > 2000">{{ posting ? '发布中…' : replying ? '发布回复' : '发布评论' }}</button></div>
      <small class="comment-privacy">账号名和脱敏邮箱将随评论显示。</small>
    </form>
    <p v-else class="guest-comment"><router-link :to="{ path: '/login', query: { redirect: loginRedirect } }">登录 / 注册</router-link>，一起聊聊这页内容。</p>
    <div class="comment-scroll" aria-live="polite" :aria-busy="loading">
      <p v-if="error" class="comment-state" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
      <p v-else-if="loading && !roots.length" class="comment-state">正在读取评论…</p>
      <p v-else-if="!roots.length" class="comment-state">还没有评论，来留下第一句话吧。</p>
      <div v-for="root in roots" :key="root.id" class="comment-thread">
        <CommentCard :comment="root" :busy="pending[root.id]" :focused="focusId === root.id" @like="like" @reply="reply" @report="startReport" @withdraw="withdrawTarget = $event" />
        <div v-if="root.replies.length" class="reply-list"><CommentCard v-for="item in (expanded[root.id] ? root.replies : root.replies.slice(0, 3))" :key="item.id" :comment="item" :busy="pending[item.id]" :focused="focusId === item.id" @like="like" @reply="reply" @report="startReport" @withdraw="withdrawTarget = $event" /></div>
        <div v-if="root.reply_count > 3" class="reply-controls"><button type="button" :disabled="pending[`replies-${root.id}`]" @click="toggleReplies(root)">{{ expanded[root.id] ? '收起' : `展开 ${root.reply_count} 条回复` }}</button><button v-if="expanded[root.id] && root.replies.length < root.reply_count" type="button" :disabled="pending[`replies-${root.id}`]" @click="loadReplies(root, Boolean(replyPages[root.id]))">{{ pending[`replies-${root.id}`] ? '读取中…' : '查看更多回复' }}</button></div>
      </div>
      <nav v-if="total > 10" class="comment-pagination" aria-label="评论分页"><button :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button><span>{{ page }} / {{ Math.ceil(total / 10) }}</span><button :disabled="page * 10 >= total || loading" @click="changePage(page + 1)">下一页</button></nav>
    </div>
    <UiDialog :open="Boolean(reportTarget)" title="举报评论" :busy="reportBusy" @close="reportTarget = null">
      <div v-if="reportSuccess" class="report-success" role="status"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m9 21 7 7 15-17" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg><strong>举报已提交</strong><p>感谢你的反馈。</p></div>
      <form v-else class="report-form" @submit.prevent="submitReport"><p>请选择原因，可多选。</p><p v-if="reportError" class="form-error" role="alert">{{ reportError }}</p><fieldset :disabled="reportBusy"><legend class="sr-only">举报原因</legend><label v-for="reason in reportReasons" :key="reason"><input v-model="reasons" type="checkbox" :value="reason" />{{ reason }}</label></fieldset><label v-if="reasons.includes('其他描述')" class="other-description">补充说明<textarea v-model="description" rows="4" required maxlength="2000" :disabled="reportBusy" placeholder="请描述你遇到的问题"></textarea></label><button type="submit" class="primary-button" :disabled="reportBusy || !reasons.length">{{ reportBusy ? '提交中…' : '提交举报' }}</button></form>
    </UiDialog>
    <UiDialog :open="Boolean(withdrawTarget)" title="撤回评论" :busy="withdrawBusy" @close="withdrawTarget = null"><p class="withdraw-note">{{ withdrawTarget?.root_id ? '确定撤回这条回复吗？其他回复会保留。' : '确定撤回这条评论吗？它的全部回复也会一并删除。' }}</p><button class="primary-button" :disabled="withdrawBusy" @click="withdraw">{{ withdrawBusy ? '撤回中…' : '确认撤回' }}</button></UiDialog>
  </section>
</template>
<style scoped>
.comments-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 14px; border-radius: 6px; background: var(--paper); box-shadow: 4px 5px 0 var(--home-stack); }
.comments-panel.inline-comments { flex: none; padding: 0; background: transparent; box-shadow: none; }
.inline-comments .comment-scroll { flex: none; overflow: visible; padding: 0 4px 4px 0; }
.inline-comments .comments-heading h2 { font-size: 16px; }
.inline-comments .comment-composer { margin-bottom: 20px; }
.comments-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.comments-heading h2 { margin: 0; color: var(--ink); font-size: 17px; font-weight: 800; }
.comments-heading button, .reply-controls button, .comment-pagination button { padding: 5px 7px; border: 0; border-radius: 3px; background: var(--accent-soft); color: var(--ink); font-size: 10px; }
.comment-composer { margin: 0 0 12px; }
textarea { display: block; width: 100%; padding: 10px; border: 0; border-radius: 4px; background: var(--field-bg); color: var(--ink); box-shadow: inset 0 0 0 1px var(--field-line); font-size: 13px; line-height: 1.6; resize: vertical; max-height: 180px; }
.replying-label { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--link); font-size: 11px; overflow-wrap: anywhere; }
.replying-label button { border: 0; background: transparent; color: var(--muted); font-size: 11px; }
.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.composer-footer small, .comment-privacy { color: var(--soft); font-size: 10px; line-height: 1.6; }
.composer-footer button { padding: 6px 9px; border: 0; border-radius: 3px; background: var(--accent-soft); color: var(--ink); box-shadow: 2px 2px 0 var(--sun); font-size: 11px; font-weight: 700; }
.comment-privacy { display: block; margin-top: 8px; }
.guest-comment { margin: 0 0 14px; color: var(--muted); font-size: 12px; line-height: 1.8; }
.guest-comment a { color: var(--link); }
.comment-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-right: 2px; overscroll-behavior: contain; scrollbar-width: thin; }
.comment-thread { margin-bottom: 12px; }
.reply-list { display: grid; gap: 6px; margin: 7px 0 0 10px; }
.reply-controls { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; margin-top: 8px; }
.comment-state { color: var(--muted); font-size: 12px; line-height: 1.8; }
.comment-pagination { display: flex; align-items: center; justify-content: space-between; gap: 5px; padding: 8px 0; font-size: 10px; color: var(--muted); }
button:disabled { opacity: .5; cursor: default; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.report-form > p, .withdraw-note { color: var(--muted); font-size: 14px; line-height: 1.8; }
.report-form fieldset { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0; margin: 18px 0; border: 0; }
.report-form fieldset label { display: flex; gap: 8px; align-items: center; padding: 10px; border-radius: 4px; background: var(--paper-deep); color: var(--ink); font-size: 13px; cursor: pointer; }
.report-form input { accent-color: var(--ink); }
.other-description { display: grid; gap: 8px; margin-bottom: 20px; color: var(--ink); font-size: 13px; }
.form-error { padding: 10px; border-radius: 4px; background: var(--warning-bg); color: var(--error-text) !important; }
.report-success { display: grid; justify-items: center; padding: 20px 0; color: var(--ink); }
.report-success svg { width: 52px; height: 52px; margin-bottom: 18px; color: var(--link); animation: report-check .35s ease both; }
.report-success p { color: var(--muted); font-size: 13px; }
@keyframes report-check { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .report-success svg { animation: none; } }
</style>
