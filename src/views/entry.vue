<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownContent from '../components/MarkdownContent.vue'
import GalleryViewer from '../components/GalleryViewer.vue'
import ResourceBreadcrumbs from '../components/ResourceBreadcrumbs.vue'
import { entryPath, resourceLabel } from '../lib/resources'

const route = useRoute()
const router = useRouter()
const entry = ref(null)
const error = ref('')
onMounted(async () => {
  try {
    const result = await (await fetch(`/api/content/entries/${route.params.id}`)).json()
    if (!result.success) throw new Error(result.message)
    if (result.data.kind === 'resource' && result.data.resource_kind === 'collection') { router.replace(entryPath(result.data)); return }
    entry.value = result.data
  } catch (cause) { error.value = cause.message || '内容加载失败' }
})
const date = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
</script>

<template>
  <div class="page-shell detail-page" :class="{ 'gallery-page': entry?.resource_kind === 'gallery' }">
    <div v-if="error" class="surface state">{{ error }}</div>
    <div v-else-if="!entry" class="surface state">加载中…</div>
    <template v-else>
      <ResourceBreadcrumbs v-if="entry.kind === 'resource'" :ancestors="entry.ancestors" :current="entry.title" />
      <router-link v-else class="back-link" to="/moments">← 返回动态</router-link>
      <article class="article">
        <div class="article-meta"><span>{{ entry.kind === 'resource' ? resourceLabel(entry) : entry.format === 'short' ? '短帖' : '动态' }}</span><span v-if="entry.resource_type_name">{{ entry.resource_type_name }}</span><span v-if="entry.resource_kind === 'gallery'">{{ entry.images.length }} 张图片</span><time :datetime="entry.published_at">{{ date(entry.published_at) }}</time></div>
        <h1 v-if="entry.title">{{ entry.title }}</h1>
        <img v-if="entry.cover_image && entry.resource_kind !== 'gallery'" class="article-cover" :src="entry.cover_image" :alt="`${entry.title || '动态'}的封面`" />
        <p v-if="entry.summary" class="lead">{{ entry.summary }}</p>
        <div v-if="entry.tags.length" class="tags"><span v-for="tag in entry.tags" :key="tag">#{{ tag }}</span></div>
        <MarkdownContent :source="entry.body" />
        <div v-if="entry.actions.length" class="actions"><a v-for="action in entry.actions" :key="action.label + action.url" class="ghost-button" :href="action.url" target="_blank" rel="noopener noreferrer">{{ action.label }} ↗</a></div>
      </article>
      <GalleryViewer v-if="entry.resource_kind === 'gallery'" :images="entry.images" />
    </template>
  </div>
</template>

<style scoped>
.detail-page { max-width: 920px; padding-top: 47px; padding-bottom: 80px; }
.gallery-page { max-width: 1120px; }
.gallery-page .article { padding: clamp(26px, 4vw, 42px); }
.gallery-page .article h1 { margin-top: 10px; }
.gallery-page .article .tags { margin-bottom: 18px; }
.back-link { display: inline-block; margin-bottom: 25px; padding: 8px 12px; border-radius: 5px; color: var(--ink); background: var(--accent-soft); box-shadow: 4px 4px 0 var(--sun); font-size: 13px; font-weight: 800; text-decoration: none; transition: transform .2s ease, box-shadow .2s ease; }
.back-link:hover { transform: translate(-2px, -2px); }
.article { position: relative; padding: clamp(30px, 6vw, 70px); border-radius: 10px; background: var(--paper); box-shadow: 7px 8px 0 var(--sky); }
.article::before { position: absolute; top: 0; right: 0; left: 0; height: 9px; border-radius: 10px 10px 0 0; background: var(--accent); content: ''; }
.article-meta { display: flex; flex-wrap: wrap; gap: 12px 18px; padding-bottom: 14px; color: var(--muted); font-size: 12px; font-weight: 700; }
.article-meta span { padding: 2px 9px; color: var(--ink); background: var(--accent-soft); font-weight: 800; }
h1 { margin: 28px 0 18px; font-family: var(--heading-font); font-size: clamp(34px, 5vw, 58px); font-weight: 900; letter-spacing: -.055em; line-height: 1.2; overflow-wrap: anywhere; }
.article-cover { display: block; width: 100%; max-height: 420px; margin: 22px 0 29px; border-radius: 6px; box-shadow: 7px 7px 0 var(--accent-soft); object-fit: cover; }
.lead { margin: 0 0 20px; color: var(--muted); font-size: 17px; line-height: 1.8; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 34px; }
.tags span { padding: 3px 8px; border-radius: 3px; color: var(--ink); background: var(--accent-soft); font-size: 12px; font-weight: 700; }
.article :deep(.markdown) { color: var(--ink); font-size: 15px; line-height: 1.9; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 48px; padding-top: 24px; }
@media (max-width: 640px) { .detail-page { padding-top: 32px; } .article { padding: 36px 25px 38px; } }
</style>
