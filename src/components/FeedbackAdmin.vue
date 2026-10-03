<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import PaginationNav from './PaginationNav.vue'

const status = ref('unread'), rows = ref([]), page = ref(1), total = ref(0), totalPages = ref(1)
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const labels = { experience: '体验优化', bug: 'bug反馈', music: '音乐推荐', rights: '侵权通知', other: '其他内容' }
let revision = 0
async function request(path, method = 'GET') {
  const response = await fetch(`/api/admin/feedback${path}`, { method, credentials: 'same-origin', cache: 'no-store' })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || '操作失败')
  return result
}
async function load() {
  const version = ++revision; loading.value = true; error.value = ''
  try {
    const result = await request(`?status=${status.value}&page=${page.value}`)
    if (version !== revision) return
    if (page.value > result.totalPages) { page.value = result.totalPages; await load(); return }
    rows.value = result.data; total.value = result.total; totalPages.value = result.totalPages
  } catch (cause) { if (version === revision) error.value = cause.message }
  finally { if (version === revision) loading.value = false }
}
async function approve(row) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { const result = await request(`/${row.id}/approve`, 'POST'); notice.value = result.message; await load() }
  catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
function paginate(next) { page.value = next; load() }
watch(status, () => { page.value = 1; notice.value = ''; load() })
onMounted(load)
onUnmounted(() => { revision++ })
</script>
<template>
  <section class="feedback-admin">
    <header class="feedback-heading"><div><h2>反馈管理</h2><p>阅读访客的建议与诉求，审批后移至已处理列表。</p></div><button class="ghost-button" :disabled="loading || busy" @click="load">刷新</button></header>
    <p v-if="error" class="feedback-message error" role="alert">{{ error }}</p><p v-if="notice" class="feedback-message" role="status">{{ notice }}</p>
    <div class="feedback-tabs" role="group" aria-label="反馈状态"><button v-for="item in ['unread','read']" :key="item" :class="{ active: status === item }" :disabled="busy" @click="status = item">{{ item === 'unread' ? '待处理' : '已处理' }}</button><span>{{ total }} 条</span></div>
    <p v-if="loading" class="surface state" role="status">正在读取…</p><p v-else-if="!rows.length" class="surface state">{{ status === 'unread' ? '暂无待处理反馈' : '暂无已处理反馈' }}</p>
    <div v-else class="feedback-list"><article v-for="row in rows" :key="row.id" class="surface feedback-card"><header><div><strong>{{ row.username }}</strong><small>{{ row.email }}</small></div><span>{{ labels[row.category] }} · {{ row.is_read ? '已读' : '未读' }}</span></header><time>{{ new Date(row.created_at).toLocaleString('zh-CN') }}</time><div v-if="row.category === 'music'" class="feedback-content"><p><b>歌名：</b>{{ row.song }}</p><p><b>歌手名：</b>{{ row.artist }}</p><p v-if="row.notes"><b>其他备注：</b>{{ row.notes }}</p></div><p v-else class="feedback-content">{{ row.body }}</p><div v-if="row.images.length" class="feedback-images"><a v-for="image in row.images" :key="image.id" :href="image.url" target="_blank" rel="noopener"><img :src="image.url" :alt="image.name" loading="lazy" /><small>{{ image.name }}</small></a></div><footer><small v-if="row.is_read">已审批 · {{ new Date(row.read_at).toLocaleString('zh-CN') }}</small><button v-else class="primary-button" :disabled="busy" @click="approve(row)">审批</button></footer></article></div>
    <PaginationNav :page="page" :total-pages="totalPages" @change="paginate" />
  </section>
</template>
<style scoped>
.feedback-admin { max-width: 930px; }.feedback-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }h2 { margin: 0 0 8px; font-size: 27px; }.feedback-heading p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.8; }.feedback-tabs { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }.feedback-tabs button { padding: 8px 12px; border: 0; border-radius: 4px; color: var(--ink); background: var(--paper); box-shadow: 3px 3px 0 var(--paper-deep); font-size: 12px; font-weight: 700; }.feedback-tabs .active { background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); }.feedback-tabs span { margin-left: auto; color: var(--muted); font-size: 12px; }.feedback-list { display: grid; gap: 18px; }.feedback-card { padding: 23px; }.feedback-card header { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }.feedback-card small,time,.feedback-card header>span { font-size: 11px; color: var(--muted); }.feedback-card header small { display: block; margin-top: 5px; overflow-wrap: anywhere; }.feedback-card header>span { padding: 5px 8px; align-self: start; border-radius: 3px; background: var(--accent-soft); color: var(--ink); }.feedback-content { margin: 16px 0; padding: 15px; border-radius: 4px; background: var(--paper-deep); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.8; }.feedback-content p { margin: 0; }.feedback-content p+p { margin-top: 8px; }.feedback-images { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; margin: 16px 0; }.feedback-images a { min-width: 0; text-decoration: none; }.feedback-images img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; }.feedback-images small { display: block; margin-top: 5px; overflow-wrap: anywhere; }.feedback-card footer { display: flex; justify-content: flex-end; align-items: center; margin-top: 18px; }.feedback-card footer button { min-height: 36px; padding: 8px 14px; font-size: 12px; }.feedback-message { padding: 12px 15px; border-radius: 4px; background: var(--sky); font-size: 13px; }.feedback-message.error { background: var(--warning-bg); color: var(--error-text); }button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width:600px) { .feedback-card { padding: 18px; }.feedback-images { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>
