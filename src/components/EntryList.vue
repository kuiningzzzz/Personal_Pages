<script setup>
import { ref, watch, onMounted } from 'vue'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps({ kind: { type: String, required: true } })
const types = ref([])
const settings = ref({})
const selectedType = ref(null)
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
watch([query, selectedType, sort, page], load)

async function load() {
  const id = ++requestId
  pending.value = true
  error.value = ''
  const params = new URLSearchParams({ kind: props.kind, q: query.value, sort: sort.value, page: String(page.value), limit: '10' })
  if (props.kind === 'resource' && selectedType.value) params.set('type', String(selectedType.value))
  try {
    const response = await fetch(`/api/content/entries?${params}`)
    const result = await response.json()
    if (!result.success) throw new Error(result.message)
    if (id === requestId) {
      rows.value = result.data
      total.value = result.total
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
function changePage(next) {
  page.value = next
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
onMounted(async () => {
  try { const result = await (await fetch('/api/content/settings')).json(); settings.value = result.data || {} } catch { /* list still loads */ }
  if (props.kind === 'resource') {
    try { const result = await (await fetch('/api/content/resource-types')).json(); types.value = result.data || [] } catch { /* list still loads */ }
  }
  load()
})
const date = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
</script>

<template>
  <div class="page-shell listing-page" :class="kind">
    <div class="list-intro">
      <span class="eyebrow">{{ kind === 'moment' ? '02 / 记事' : '03 / 收藏' }}</span>
      <h1 class="page-heading">{{ kind === 'moment' ? '动态' : '资源库' }}<span class="heading-mark">。</span></h1>
      <p class="page-description">{{ kind === 'moment' ? settings.momentsDescription : settings.resourceDescription }}</p>
    </div>

    <nav v-if="kind === 'resource'" class="type-nav" aria-label="资源分类">
      <button type="button" :class="{ active: !selectedType }" @click="selectType(null)">全部</button>
      <button v-for="type in types" :key="type.id" type="button" :class="{ active: selectedType === type.id }" @click="selectType(type.id)">{{ type.name }}</button>
    </nav>

    <div class="list-toolbar">
      <label class="search-box"><span>搜索</span><input v-model="input" type="search" placeholder="标题、标签或正文" aria-label="搜索标题、标签或正文" /><span class="search-arrow" aria-hidden="true">↗</span></label>
      <label class="sort-box"><span>排序</span><select v-model="sort"><option value="relevance">{{ query ? '匹配程度' : '最新发布' }}</option><option value="latest">发布时间</option></select></label>
    </div>

    <div class="list-meta"><span>{{ query ? `“${query}” 的搜索结果` : '全部内容' }}</span><span>{{ pending && loaded ? '正在翻页…' : `共 ${total} 条` }}</span></div>
    <div class="entries-stage" aria-live="polite" :aria-busy="pending">
      <Transition name="note-turn" mode="out-in">
        <div v-if="error" :key="`error-${resultVersion}`" class="surface state">{{ error }}</div>
        <div v-else-if="!loaded" key="loading" class="surface state">整理中…</div>
        <div v-else-if="!rows.length" :key="`empty-${resultVersion}`" class="surface state">{{ query ? '没有找到匹配的内容' : '这里还没有内容' }}</div>
        <div v-else :key="resultVersion" class="entry-list">
          <article v-for="(row, index) in rows" :key="row.id" class="entry">
            <span class="entry-index" aria-hidden="true">{{ String((page - 1) * 10 + index + 1).padStart(2, '0') }}</span>
            <router-link class="entry-visual" :to="`/entry/${row.id}`" :aria-label="`查看${row.title || '这条动态'}`">
              <img v-if="row.cover_image" :src="row.cover_image" :alt="`${row.title || '动态'}的封面`" loading="lazy" />
              <span v-else class="entry-art" aria-hidden="true"><strong>{{ (row.title || row.resource_type_name || '随记').slice(0, 2) }}</strong></span>
            </router-link>
            <div class="entry-content">
              <div class="entry-top"><span v-if="row.resource_type_name">{{ row.resource_type_name }}</span><span v-else>{{ row.format === 'short' ? '短帖' : '文章' }}</span><time :datetime="row.published_at">{{ date(row.published_at) }}</time></div>
              <router-link v-if="row.title" class="entry-title" :to="`/entry/${row.id}`">{{ row.title }}<span aria-hidden="true">↗</span></router-link>
              <MarkdownContent v-if="row.format === 'short'" class="short-body" :source="row.body" />
              <p v-else-if="row.summary" class="summary">{{ row.summary }}</p>
              <div class="entry-bottom"><div class="tags"><span v-for="tag in row.tags" :key="tag">#{{ tag }}</span></div><router-link :to="`/entry/${row.id}`">打开这页 <span aria-hidden="true">→</span></router-link></div>
              <div v-if="kind === 'resource' && row.actions?.length" class="entry-actions"><a v-for="action in row.actions" :key="action.label + action.url" :href="action.url" target="_blank" rel="noopener noreferrer">{{ action.label }} ↗</a></div>
            </div>
          </article>
        </div>
      </Transition>
    </div>

    <div v-if="total > 10" class="pagination">
      <button class="ghost-button" type="button" :disabled="page === 1 || pending" @click="changePage(page - 1)">← 上一页</button>
      <span>{{ page }} / {{ Math.ceil(total / 10) }}</span>
      <button class="ghost-button" type="button" :disabled="page * 10 >= total || pending" @click="changePage(page + 1)">下一页 →</button>
    </div>
  </div>
</template>

<style scoped src="../styles/entry-list.css"></style>
