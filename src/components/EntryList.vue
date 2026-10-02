<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import MarkdownContent from './MarkdownContent.vue'
import ShortPostBody from './ShortPostBody.vue'
import CommentsPanel from './CommentsPanel.vue'
import ResourceBreadcrumbs from './ResourceBreadcrumbs.vue'
import SubscribeButton from './SubscribeButton.vue'
import SubscriptionControls from './SubscriptionControls.vue'
import PaginationNav from './PaginationNav.vue'
import { CONTENT_PAGE_SIZE } from '../lib/pagination'
import { entryPath, resourceLabel } from '../lib/resources'
import { loadSubscriptions } from '../lib/subscriptions'

const props = defineProps({ kind: { type: String, required: true }, collectionId: { type: [String, Number], default: null } })
const route = useRoute()
const linkedPost = ref(null)
const isShort = row => props.kind === 'moment' && row.format === 'short'
const collection = ref(null)
const types = ref([])
const settings = ref({})
const selectedType = ref(null)
const selectedFormat = ref(null)
const momentFormats = [{ id: null, name: '全部' }, { id: 'short', name: '短帖' }, { id: 'article', name: '长文' }]
const input = ref('')
const query = ref('')
const sort = ref('relevance')
const page = ref(1)
const rows = ref([])
const total = ref(0)
const pending = ref(false)
const loaded = ref(false)
const resultVersion = ref(0)
const error = ref('')
let timer
let requestId = 0

watch(input, value => {
  clearTimeout(timer)
  timer = setTimeout(() => { query.value = value.trim(); page.value = 1 }, 250)
})
watch(sort, () => { page.value = 1 }, { flush: 'sync' })
watch([query, selectedType, selectedFormat, sort, page], load)

async function load() {
  const id = ++requestId
  pending.value = true
  error.value = ''
  const params = new URLSearchParams({ kind: props.kind, q: query.value, sort: sort.value, page: String(page.value), limit: String(CONTENT_PAGE_SIZE) })
  if (linkedPost.value && !loaded.value && !query.value) params.set('locate', String(linkedPost.value.id))
  if (props.kind === 'resource' && !props.collectionId && selectedType.value) params.set('type', String(selectedType.value))
  if (props.kind === 'moment' && selectedFormat.value) params.set('format', selectedFormat.value)
  if (props.collectionId) params.set('parent', String(props.collectionId))
  try {
    const response = await fetch(`/api/content/entries?${params}`)
    const result = await response.json()
    if (!result.success) throw new Error(result.message)
    if (id === requestId) {
      total.value = result.total
      if (result.page !== page.value) { page.value = result.page; return }
      rows.value = result.data
      loaded.value = true
      resultVersion.value++
    }
  } catch (cause) {
    if (id === requestId) error.value = cause.message || '加载失败'
  } finally {
    if (id === requestId) pending.value = false
  }
}
function selectType(id) { selectedType.value = id; page.value = 1 }
function selectFormat(id) { selectedFormat.value = id; page.value = 1 }
function changePage(next) {
  page.value = next
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
onMounted(async () => {
  loadSubscriptions(true).catch(() => {})
  const postId = Number(route.query.post)
  if (props.kind === 'moment' && Number.isSafeInteger(postId) && postId > 0) {
    try {
      const result = await (await fetch(`/api/content/entries/${postId}`)).json()
      if (result.success && result.data.kind === 'moment' && result.data.format === 'short') { linkedPost.value = result.data; selectedFormat.value = 'short' }
    } catch { /* normal list remains available */ }
  }
  try { const result = await (await fetch('/api/content/settings')).json(); settings.value = result.data || {} } catch { /* list still loads */ }
  if (props.kind === 'resource' && !props.collectionId) {
    try { const result = await (await fetch('/api/content/resource-types')).json(); types.value = result.data || [] } catch { /* list still loads */ }
  }
  if (props.collectionId) {
    try {
      const result = await (await fetch(`/api/content/entries/${props.collectionId}`)).json()
      if (!result.success || result.data.resource_kind !== 'collection') throw new Error(result.message || '合集不存在')
      collection.value = result.data
    } catch (cause) { error.value = cause.message || '合集加载失败'; loaded.value = true; return }
  }
  load()
})
onUnmounted(() => { clearTimeout(timer); requestId++ })
const date = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
</script>

<template>
  <div class="page-shell listing-page" :class="kind">
    <ResourceBreadcrumbs v-if="collection" :ancestors="collection.ancestors" :current="collection.title" />
    <div class="list-intro">
      <span class="eyebrow">{{ collection ? '合集' : kind === 'moment' ? '02 / 记事' : '03 / 收藏' }}</span>
      <h1 class="page-heading">{{ collection ? collection.title : kind === 'moment' ? '动态' : '资源库' }}<span class="heading-mark">。</span></h1>
      <div v-if="collection" class="collection-subscribe"><SubscribeButton scope="collection" :target-id="collection.id" :label="collection.title" /></div>
      <SubscriptionControls v-else-if="!collectionId" :kind="kind" :types="types" />
      <p class="page-description">{{ collection ? collection.summary : kind === 'moment' ? settings.momentsDescription : settings.resourceDescription }}</p>
      <MarkdownContent v-if="collection?.body" class="collection-description" :source="collection.body" />
      <div v-if="collection?.tags.length" class="tags"><span v-for="tag in collection.tags" :key="tag">#{{ tag }}</span></div>
      <div v-if="collection?.actions.length" class="entry-actions"><a v-for="action in collection.actions" :key="action.label + action.url" :href="action.url" target="_blank" rel="noopener noreferrer">{{ action.label }} ↗</a></div>
    </div>

    <nav v-if="kind === 'resource' && !collectionId" class="type-nav" aria-label="资源库根大类">
      <button type="button" :class="{ active: !selectedType }" @click="selectType(null)">全部</button>
      <button v-for="type in types" :key="type.id" type="button" :class="{ active: selectedType === type.id }" @click="selectType(type.id)">{{ type.name }}</button>
    </nav>

    <nav v-else-if="kind === 'moment'" class="type-nav" aria-label="动态形式">
      <button v-for="format in momentFormats" :key="format.id || 'all'" type="button" :class="{ active: selectedFormat === format.id }" :aria-pressed="selectedFormat === format.id" @click="selectFormat(format.id)">{{ format.name }}</button>
    </nav>

    <div class="list-toolbar">
      <label class="search-box"><span>搜索</span><input v-model="input" type="search" :placeholder="collection ? '搜索当前合集的标题、标签或正文' : '标题、标签或正文'" aria-label="搜索标题、标签或正文" /><span class="search-arrow" aria-hidden="true">↗</span></label>
      <label class="sort-box"><span>排序</span><select v-model="sort"><option value="relevance">{{ query ? '匹配程度' : '最新发布' }}</option><option value="latest">发布时间</option></select></label>
    </div>

    <div class="list-meta"><span>{{ query ? `“${query}” 的搜索结果` : collection ? '合集内容' : selectedFormat === 'short' ? '短帖' : selectedFormat === 'article' ? '长文' : '全部内容' }}</span><span>{{ pending && loaded ? '正在翻页…' : `共 ${total} 条` }}</span></div>
    <div class="entries-stage" aria-live="polite" :aria-busy="pending">
      <Transition name="note-turn" mode="out-in">
        <div v-if="error" :key="`error-${resultVersion}`" class="surface state">{{ error }}</div>
        <div v-else-if="!loaded" key="loading" class="surface state">整理中…</div>
        <div v-else-if="!rows.length" :key="`empty-${resultVersion}`" class="surface state">{{ query ? '没有找到匹配的内容' : '这里还没有内容' }}</div>
        <div v-else :key="resultVersion" class="entry-list">
          <article v-for="(row, index) in rows" :id="`entry-${row.id}`" :key="row.id" class="entry" :class="{ 'short-entry': isShort(row), 'without-cover': isShort(row) && !row.cover_image }">
            <span class="entry-index" aria-hidden="true">{{ String((page - 1) * CONTENT_PAGE_SIZE + index + 1).padStart(2, '0') }}</span>
            <component :is="isShort(row) ? 'div' : RouterLink" v-if="!isShort(row) || row.cover_image" class="entry-visual" :class="{ 'collection-visual': row.resource_kind === 'collection', 'gallery-visual': row.resource_kind === 'gallery' }" :to="isShort(row) ? undefined : entryPath(row)" :aria-label="isShort(row) ? undefined : `查看${row.title || '这条动态'}`">
              <img v-if="row.cover_image" :src="row.cover_image" :alt="`${row.title || '动态'}的封面`" loading="lazy" />
              <span v-else-if="row.resource_kind === 'collection'" class="collection-art" aria-hidden="true"><span></span><span></span><strong>合集</strong></span>
              <span v-else class="entry-art" aria-hidden="true"><strong>{{ (row.title || row.resource_type_name || '随记').slice(0, 2) }}</strong></span>
            </component>
            <div class="entry-content">
              <div class="entry-top"><span>{{ kind === 'resource' ? resourceLabel(row) : row.format === 'short' ? '短帖' : '长文' }}</span><span v-if="!collectionId && row.resource_type_name">{{ row.resource_type_name }}</span><small v-if="row.resource_kind === 'collection'">{{ row.child_count }} 项内容</small><small v-else-if="row.resource_kind === 'gallery'">{{ row.image_count }} 张图片</small><time :datetime="row.published_at">{{ date(row.published_at) }}</time></div>
              <h2 v-if="isShort(row) && row.title" class="entry-title">{{ row.title }}</h2>
              <router-link v-else-if="row.title" class="entry-title" :to="entryPath(row)">{{ row.title }}<span aria-hidden="true">↗</span></router-link>
              <ShortPostBody v-if="isShort(row)" :source="row.body" />
              <p v-else-if="row.summary" class="summary">{{ row.summary }}</p>
              <div v-if="!isShort(row) || row.tags.length" class="entry-bottom"><div class="tags"><span v-for="tag in row.tags" :key="tag">#{{ tag }}</span></div><router-link v-if="!isShort(row)" :to="entryPath(row)">{{ row.resource_kind === 'collection' ? '进入合集' : row.resource_kind === 'gallery' ? '浏览图集' : '打开这页' }} <span aria-hidden="true">→</span></router-link></div>
              <div v-if="kind === 'resource' && row.actions?.length" class="entry-actions"><a v-for="action in row.actions" :key="action.label + action.url" :href="action.url" target="_blank" rel="noopener noreferrer">{{ action.label }} ↗</a></div>
              <div v-if="kind === 'resource' && row.resource_kind === 'collection'" class="collection-subscribe"><SubscribeButton scope="collection" :target-id="row.id" :label="row.title" /></div>
            </div>
            <div v-if="isShort(row)" class="short-comments"><CommentsPanel :entry-id="row.id" inline :focus-comment-id="row.id === Number(route.query.post) ? Number(route.query.comment) || null : null" /></div>
          </article>
        </div>
      </Transition>
    </div>

    <PaginationNav :page="page" :total-pages="Math.ceil(total / CONTENT_PAGE_SIZE)" :disabled="pending" @change="changePage" />
  </div>
</template>

<style scoped src="../styles/entry-list.css"></style>
