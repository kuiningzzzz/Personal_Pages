<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { activityRequest } from '../lib/activities'
import { loadVisitor } from '../lib/auth'
import { showSubscriptionNotice } from '../lib/subscriptions'
const route = useRoute(), router = useRouter()
const items = ref([]), tags = ref([]), parent = ref(null), ancestors = ref([]), introduction = ref(''), loading = ref(true), error = ref('')
const date = value => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
async function load() {
  loading.value = true; error.value = ''
  try {
    const result = await activityRequest(`/items${route.params.collectionId ? `?parent=${route.params.collectionId}` : ''}`)
    items.value = result.data; tags.value = result.tags; parent.value = result.parent; ancestors.value = result.ancestors
    const settings = await (await fetch('/api/content/settings')).json(); introduction.value = settings.data?.activitiesMessage || ''
  } catch (cause) { error.value = cause.message } finally { loading.value = false }
}
async function enter(item) {
  if (item.kind === 'collection') { router.push(`/activities/collection/${item.id}`); return }
  if (!item.open) { showSubscriptionNotice('不在开放时段，无法进入'); return }
  if (item.login_required && !await loadVisitor(true)) { showSubscriptionNotice('登录/注册后即可进入此活动'); return }
  router.push(`/activities/play/${item.id}`)
}
onMounted(load)
</script>
<template>
  <div class="page-shell plaza-page">
    <nav v-if="parent" class="plaza-trail" aria-label="活动位置"><RouterLink to="/activities">广场</RouterLink><template v-for="entry in ancestors" :key="entry.id"><span>/</span><RouterLink :to="`/activities/collection/${entry.id}`">{{ entry.title }}</RouterLink></template><span>/</span><span>{{ parent.title }}</span></nav>
    <h1 class="page-heading">{{ parent?.title || '广场' }}<span>。</span></h1>
    <p class="plaza-intro">{{ parent?.summary || introduction }}</p>
    <div v-if="loading" class="surface plaza-state" role="status">正在打开广场…</div>
    <div v-else-if="error" class="surface plaza-state" role="alert">{{ error }} <button class="ghost-button" @click="load">重试</button></div>
    <div v-else-if="!items.length" class="surface plaza-state">这里还没有活动，过段时间再来看看吧。</div>
    <div v-else class="plaza-list">
      <article v-for="(item, index) in items" :key="item.id" class="plaza-card" :style="{ '--delay': `${Math.min(index, 8) * 45}ms` }">
        <img v-if="item.cover" :src="item.cover" :alt="item.title" class="plaza-cover" loading="lazy" />
        <div v-else class="plaza-mark" aria-hidden="true">{{ item.kind === 'collection' ? '▤' : '▷' }}</div>
        <div class="plaza-copy"><div class="plaza-tags"><span v-if="item.kind === 'collection'">活动合集</span><span v-else>{{ item.schedule === 'permanent' ? '常驻' : item.open ? '开放中' : '未开放' }}</span><span v-for="id in item.tags" :key="id">{{ tags.find(tag => tag.id === id)?.name }}</span></div><h2>{{ item.title }}</h2><p v-if="item.summary">{{ item.summary }}</p><small v-if="item.schedule === 'timed' && item.kind !== 'collection'">{{ date(item.starts_at) }} — {{ date(item.ends_at) }}</small></div>
        <button class="primary-button plaza-enter" @click="enter(item)">{{ item.kind === 'collection' ? '打开合集' : item.entry_label }} <span aria-hidden="true">↗</span></button>
      </article>
    </div>
  </div>
</template>
<style scoped>
.plaza-page { padding-block: 52px 80px; }.page-heading span { color: var(--accent); }.plaza-intro { color: var(--muted); line-height: 1.8; margin: 12px 0 32px; white-space: pre-line; }.plaza-trail { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; font-size: 14px; }.plaza-trail a { color: var(--accent); }.plaza-state { padding: 35px; }.plaza-list { display: grid; gap: 25px; }.plaza-card { display: flex; align-items: center; gap: 26px; padding: 24px; background: var(--paper); border-radius: 8px; box-shadow: 6px 7px 0 var(--home-stack); animation: arrive .45s both; animation-delay: var(--delay); }.plaza-cover, .plaza-mark { flex: none; width: 145px; height: 120px; border-radius: 5px; object-fit: cover; }.plaza-mark { display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 56px; }.plaza-copy { flex: 1; min-width: 0; }.plaza-copy h2 { margin: 10px 0; font-size: 23px; overflow-wrap: anywhere; }.plaza-copy p { color: var(--muted); line-height: 1.7; margin: 0 0 9px; white-space: pre-line; }.plaza-copy small { color: var(--muted); }.plaza-tags { display: flex; gap: 6px; flex-wrap: wrap; }.plaza-tags span { padding: 3px 8px; background: var(--paper-deep); color: var(--cocoa); border-radius: 3px; font-size: 12px; }.plaza-enter { flex: none; display: flex; align-items: center; gap: 16px; }
@keyframes arrive { from { opacity: 0; transform: translateY(15px) rotateX(5deg); } to { opacity: 1; transform: none; } }
@media(max-width: 640px) { .plaza-card { gap: 16px; flex-wrap: wrap; padding: 20px; }.plaza-cover, .plaza-mark { width: 85px; height: 85px; }.plaza-copy h2 { font-size: 20px; }.plaza-enter { margin-left: auto; }.plaza-copy p { font-size: 14px; } }
@media(prefers-reduced-motion: reduce) { .plaza-card { animation: none; } }
</style>
