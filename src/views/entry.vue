<script setup>
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownContent from '../components/MarkdownContent.vue'
import GalleryViewer from '../components/GalleryViewer.vue'
import ResourceBreadcrumbs from '../components/ResourceBreadcrumbs.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import { lockPageScroll, trapFocus } from '../lib/layers'
import { entryPath, resourceLabel } from '../lib/resources'
import { followActiveOutline } from '../lib/reading-outline'

const route = useRoute()
const router = useRouter()
const entry = ref(null)
const error = ref('')
const downloading = ref(false)
const downloadError = ref('')
let downloadController
async function downloadGallery() {
  if (downloading.value || !entry.value?.images.length) return
  downloading.value = true; downloadError.value = ''
  downloadController = new AbortController()
  try {
    const response = await fetch(`/api/content/entries/${entry.value.id}/gallery-archive`, { method: 'POST', signal: downloadController.signal })
    const result = await response.json()
    if (!result.success) throw new Error(result.message || '图包打包失败')
    // Let the browser stream the ZIP to disk instead of buffering it in a Blob.
    const link = document.createElement('a')
    link.href = result.downloadUrl; link.download = `${entry.value.title || '图集'}.zip`
    document.body.append(link); link.click(); link.remove()
  } catch (cause) {
    if (cause.name !== 'AbortError') downloadError.value = cause.message || '图包下载失败，请重试'
  } finally { downloading.value = false }
}
const headings = ref([])
const activeSection = ref('')
const sidebar = ref(null)
const tocNav = ref(null)
const readingPane = ref(null)
const drawerTrigger = ref(null)
const media = window.matchMedia('(max-width: 900px)')
const mobile = ref(media.matches)
const drawerOpen = ref(false)
const outline = computed(() => [...headings.value, ...(entry.value?.resource_kind === 'gallery' ? [{ id: `gallery-${entry.value.id}`, text: '图集', level: 1 }] : [])])
const minimumLevel = computed(() => Math.min(...outline.value.map(item => item.level), 6))
let releaseScroll, frame = 0, resizeObserver, followPending = false
function trackSection() {
  frame = 0
  const follow = followPending; followPending = false
  if (!outline.value.length) { activeSection.value = ''; return }
  let current = outline.value[0].id
  for (const item of outline.value) {
    const element = document.getElementById(item.id)
    if (element && element.getBoundingClientRect().top <= Math.max(120, window.innerHeight * .22)) current = item.id
  }
  const changed = activeSection.value !== current
  activeSection.value = current
  if (follow || changed) nextTick(() => followActiveOutline(tocNav.value))
}
function scheduleTracking() { if (!frame) frame = requestAnimationFrame(trackSection) }
function readingScrolled() { followPending = true; scheduleTracking() }
function closeDrawer(restoreFocus = false) { drawerOpen.value = false; if (restoreFocus) drawerTrigger.value?.focus() }
async function jumpTo(id) {
  closeDrawer()
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  activeSection.value = id
}
function drawerKeys(event) {
  if (!mobile.value || !drawerOpen.value) return
  if (event.key === 'Escape') { event.preventDefault(); closeDrawer(true) }
  trapFocus(event, sidebar.value)
}
function screenChanged(event) { mobile.value = event.matches; if (!event.matches) closeDrawer() }
watch(drawerOpen, async open => {
  releaseScroll?.(); releaseScroll = null
  if (open && mobile.value) {
    releaseScroll = lockPageScroll()
    await nextTick(); sidebar.value?.querySelector('button')?.focus(); followActiveOutline(tocNav.value)
  }
})
watch(outline, async () => { await nextTick(); scheduleTracking() })
onMounted(async () => {
  media.addEventListener('change', screenChanged)
  window.addEventListener('scroll', readingScrolled, { passive: true })
  window.addEventListener('resize', scheduleTracking, { passive: true })
  try {
    const result = await (await fetch(`/api/content/entries/${route.params.id}`)).json()
    if (!result.success) throw new Error(result.message)
    if (result.data.kind === 'moment' && result.data.format === 'short') { router.replace('/moments'); return }
    if (result.data.kind === 'resource' && result.data.resource_kind === 'collection') { router.replace(entryPath(result.data)); return }
    entry.value = result.data
    await nextTick()
    if (window.ResizeObserver && readingPane.value) { resizeObserver = new ResizeObserver(scheduleTracking); resizeObserver.observe(readingPane.value) }
    if (mobile.value && Number(route.query.comment) > 0) drawerOpen.value = true
    scheduleTracking()
  } catch (cause) { error.value = cause.message || '内容加载失败' }
})
onUnmounted(() => {
  downloadController?.abort()
  releaseScroll?.(); cancelAnimationFrame(frame); resizeObserver?.disconnect()
  media.removeEventListener('change', screenChanged)
  window.removeEventListener('scroll', readingScrolled)
  window.removeEventListener('resize', scheduleTracking)
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
      <div class="reading-layout">
        <Teleport to="body" :disabled="!mobile">
          <aside :id="`reading-sidebar-${entry.id}`" ref="sidebar" class="reading-sidebar" :class="{ 'drawer-open': drawerOpen, 'mobile-sidebar': mobile }" :role="mobile ? 'dialog' : 'complementary'" :aria-modal="mobile && drawerOpen ? true : undefined" :aria-hidden="mobile && !drawerOpen ? true : undefined" aria-label="目录与评论" @keydown="drawerKeys">
            <div v-if="mobile" class="drawer-heading"><strong>目录与评论</strong><button type="button" aria-label="收起目录与评论" @click="closeDrawer(true)">×</button></div>
            <section class="toc-panel"><h2>本页目录</h2><nav v-if="outline.length" ref="tocNav" aria-label="文章目录"><a v-for="item in outline" :key="item.id" :href="`#${item.id}`" :class="{ active: activeSection === item.id }" :style="{ '--depth': item.level - minimumLevel }" :aria-current="activeSection === item.id ? 'location' : undefined" @click.prevent="jumpTo(item.id)">{{ item.text }}</a></nav><p v-else>这页没有章节标题。</p></section>
            <CommentsPanel :entry-id="entry.id" />
          </aside>
        </Teleport>
        <div ref="readingPane" class="reading-content">
      <article class="article">
        <div class="article-meta"><span>{{ entry.kind === 'resource' ? resourceLabel(entry) : entry.format === 'short' ? '短帖' : '长文' }}</span><span v-if="entry.resource_kind === 'gallery'">{{ entry.images.length }} 张图片</span><time :datetime="entry.published_at">{{ date(entry.published_at) }}</time></div>
        <h1 v-if="entry.title">{{ entry.title }}</h1>
        <img v-if="entry.cover_image && entry.resource_kind !== 'gallery'" class="article-cover" :src="entry.cover_image" :alt="`${entry.title || '动态'}的封面`" />
        <p v-if="entry.summary" class="lead">{{ entry.summary }}</p>
        <div v-if="entry.tags.length" class="tags"><span v-for="tag in entry.tags" :key="tag">#{{ tag }}</span></div>
        <MarkdownContent :source="entry.body" :heading-prefix="`entry-${entry.id}-section-`" @outline="headings = $event" />
        <div v-if="entry.actions.length" class="actions"><a v-for="action in entry.actions" :key="action.label + action.url" class="ghost-button" :href="action.url" target="_blank" rel="noopener noreferrer">{{ action.label }} ↗</a></div>
      </article>
      <section v-if="entry.resource_kind === 'gallery'" :id="`gallery-${entry.id}`" class="gallery-section"><div class="gallery-heading"><h2>图集</h2><button type="button" class="ghost-button gallery-download" :disabled="downloading || !entry.images.length" :aria-busy="downloading" @click="downloadGallery"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ downloading ? '正在打包…' : '下载整个图包' }}</button></div><p v-if="downloadError" class="gallery-download-error" role="alert">{{ downloadError }}</p><GalleryViewer :images="entry.images" /></section>
        </div>
      </div>
      <Teleport v-if="mobile" to="body"><button ref="drawerTrigger" type="button" class="reading-drawer-trigger" :aria-expanded="drawerOpen" :aria-controls="`reading-sidebar-${entry.id}`" @click="drawerOpen = true">目录 / 评论</button><Transition name="drawer-backdrop"><div v-if="drawerOpen" class="reading-drawer-backdrop" aria-hidden="true" @click="closeDrawer(true)"></div></Transition></Teleport>
    </template>
  </div>
</template>

<style scoped>
.detail-page { width: min(1400px, calc(100% - 56px)); max-width: 1400px; padding-top: 47px; padding-bottom: 80px; }
.reading-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); gap: 26px; align-items: start; }
.reading-content { min-width: 0; }
.reading-sidebar { position: sticky; top: 105px; display: flex; flex-direction: column; gap: 18px; min-width: 0; height: calc(100dvh - 130px); padding: 0 5px 6px 0; }
.toc-panel { flex: none; padding: 16px; border-radius: 6px; background: var(--card-sky); box-shadow: 4px 5px 0 var(--card-sky-stack); }
.toc-panel h2 { margin: 0 0 12px; color: var(--ink); font-size: 16px; font-weight: 800; }
.toc-panel nav { max-height: 28vh; overflow-y: auto; padding-right: 3px; scrollbar-width: thin; }
.toc-panel a { display: block; padding: 6px 0 6px calc(var(--depth) * 9px); color: var(--muted); font-size: max(11px, calc(13px - var(--depth) * .5px)); line-height: 1.65; overflow-wrap: anywhere; text-decoration: none; transition: color .2s ease; }
.toc-panel a.active { color: var(--link); font-size: 16px; font-weight: 800; }
.toc-panel p { color: var(--muted); font-size: 12px; line-height: 1.7; }
.gallery-section { scroll-margin-top: 105px; margin-top: 38px; }
.gallery-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; }
.gallery-heading h2 { margin: 0; color: var(--ink); font-family: var(--heading-font); font-size: 24px; }
.gallery-download { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; font-size: 12px; }
.gallery-download svg { width: 16px; height: 16px; }
.gallery-download:disabled { opacity: .55; cursor: not-allowed; }
.gallery-download-error { margin: 14px 0 0; color: var(--danger); font-size: 13px; line-height: 1.7; }
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
.article :deep(.markdown h1), .article :deep(.markdown h2), .article :deep(.markdown h3), .article :deep(.markdown h4), .article :deep(.markdown h5), .article :deep(.markdown h6) { scroll-margin-top: 110px; }
.article > h1, .article > .lead, .article > .tags, .article > .markdown { max-width: 800px; margin-inline: auto; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 48px; padding-top: 24px; }
@media (max-width: 640px) { .detail-page { padding-top: 32px; } .article { padding: 36px 25px 38px; } }
.reading-drawer-trigger { position: fixed; z-index: 125; left: 0; top: 38%; padding: 12px 10px; border: 0; border-radius: 0 5px 5px 0; color: var(--ink); background: var(--accent-soft); box-shadow: 4px 5px 0 var(--sun); font-size: 12px; font-weight: 800; writing-mode: vertical-rl; }
.reading-drawer-backdrop { position: fixed; inset: 0; z-index: 140; background: var(--dialog-backdrop); }
.drawer-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--ink); font-size: 14px; }
.drawer-heading button { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: var(--paper-deep); color: var(--ink); font-size: 22px; line-height: 1; }
.reading-sidebar.mobile-sidebar { position: fixed; z-index: 150; top: 0; bottom: 0; left: 0; width: 66.666vw; height: 100dvh; padding: 20px 12px 20px 10px; padding-top: max(20px, env(safe-area-inset-top)); gap: 14px; background: var(--page-bg); transform: translateX(-108%); visibility: hidden; pointer-events: none; transition: transform .32s cubic-bezier(.22,.72,.18,1), visibility .32s; }
.reading-sidebar.mobile-sidebar.drawer-open { transform: translateX(0); visibility: visible; pointer-events: auto; }
.drawer-backdrop-enter-active, .drawer-backdrop-leave-active { transition: opacity .32s ease; }
.drawer-backdrop-enter-from, .drawer-backdrop-leave-to { opacity: 0; }
@media (max-width: 900px) { .reading-layout { grid-template-columns: minmax(0, 1fr); } .detail-page { width: calc(100% - 36px); } .article { padding: 34px 26px; } }
@media (prefers-reduced-motion: reduce) { .reading-sidebar.mobile-sidebar, .drawer-backdrop-enter-active, .drawer-backdrop-leave-active, .toc-panel a { transition: none; } }
</style>
