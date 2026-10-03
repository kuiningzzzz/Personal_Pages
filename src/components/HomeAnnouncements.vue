<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MarkdownContent from './MarkdownContent.vue'
import PaginationNav from './PaginationNav.vue'

const announcements = ref([]), pinned = ref([]), total = ref(0), page = ref(1), totalPages = ref(1)
const expanded = ref(false), loading = ref(false), error = ref(''), heading = ref(null)
const items = computed(() => [...pinned.value, ...announcements.value])
let revision = 0
async function load() {
  const current = ++revision; loading.value = true; error.value = ''
  try {
    const params = new URLSearchParams({ expanded: expanded.value ? '1' : '0', page: String(page.value) })
    const response = await fetch(`/api/content/announcements?${params}`, { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.message || '公告读取失败')
    if (current !== revision) return
    announcements.value = result.data; pinned.value = result.pinned; total.value = result.total
    page.value = result.page; totalPages.value = result.totalPages
  } catch (cause) { if (current === revision) error.value = cause.message }
  finally { if (current === revision) loading.value = false }
}
async function toggle() {
  expanded.value = !expanded.value; page.value = 1; await load()
  if (!expanded.value) heading.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function paginate(next) { page.value = next; await load(); heading.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
const date = value => new Date(value).toLocaleDateString('zh-CN')
onMounted(load)
onUnmounted(() => { revision++ })
</script>

<template>
  <section class="announcements" aria-labelledby="home-announcements-title" :aria-busy="loading">
    <header ref="heading" class="announcements-heading"><h2 id="home-announcements-title">公告</h2><span>{{ total + pinned.length }} 条记录</span></header>
    <p v-if="error" class="announcement-state" role="alert">{{ error }} <button class="ghost-button" @click="load">重试</button></p>
    <p v-else-if="!items.length" class="announcement-state">{{ loading ? '正在读取公告…' : '暂时没有公告' }}</p>
    <div class="announcement-list">
      <article v-for="item in items" :key="item.id" class="announcement" :class="{ pinned: item.pinned }">
        <div class="announcement-title"><span v-if="item.pinned" class="pin-label">置顶</span><span v-for="tag in item.tags" :key="tag.id" class="announcement-tag">{{ tag.name }}</span><h3>{{ item.title }}</h3></div>
        <MarkdownContent v-if="item.body" class="announcement-body" :source="item.body" :heading-prefix="`announcement-${item.id}`" />
        <time :datetime="item.published_at">{{ date(item.published_at) }}</time>
      </article>
    </div>
    <PaginationNav v-if="expanded && !error" :page="page" :total-pages="totalPages" :disabled="loading" @change="paginate" />
    <button v-if="total > 3 || expanded" type="button" class="announcement-toggle ghost-button" :aria-expanded="expanded" :disabled="loading" @click="toggle">{{ expanded ? '收回' : '展开更多公告' }} <span aria-hidden="true">{{ expanded ? '↑' : '↓' }}</span></button>
  </section>
</template>

<style scoped>
.announcements { margin-top: 34px; padding: 22px; background: var(--paper-deep); border-radius: 5px; box-shadow: 5px 6px 0 var(--home-stack); min-width: 0; }
.announcements-heading { display: flex; justify-content: space-between; gap: 14px; align-items: baseline; margin-bottom: 18px; scroll-margin-top: 100px; }.announcements-heading h2 { margin: 0; font-size: 21px; }.announcements-heading>span { color: var(--muted); font-size: 11px; }
.announcement-list { display: grid; gap: 12px; }.announcement { padding: 15px 17px; background: var(--paper); border-radius: 4px; overflow-wrap: anywhere; }.announcement.pinned { background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); margin: 0 3px 3px 0; }
.announcement-title { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }.announcement-title h3 { display: inline; margin: 0; font-size: 15px; line-height: 1.7; color: var(--ink); }.announcement-tag,.pin-label { padding: 2px 6px; font-size: 10px; line-height: 1.6; border-radius: 2px; color: var(--ink); background: var(--sky); }.pin-label { background: var(--sun); font-weight: 700; }
.announcement-body { font-size: 13px; margin-top: 8px; }.announcement-body :deep(h1),.announcement-body :deep(h2),.announcement-body :deep(h3) { font-size: 15px; }.announcement time { display: block; color: var(--muted); font-size: 10px; margin-top: 9px; }.announcement-toggle { display: flex; justify-content: center; align-items: center; gap: 9px; width: 100%; margin-top: 17px; font-size: 12px; }.announcement-state { color: var(--muted); font-size: 13px; line-height: 1.8; }button:disabled { opacity: .5; cursor: not-allowed; }
@media(max-width:720px) { .announcements { padding: 17px; margin-top: 25px; }.announcement { padding: 13px; }.announcements-heading { scroll-margin-top: calc(var(--player-height, 33dvh) + 95px); } }
</style>
