<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const props = defineProps({ document: Object, page: Number })
const canvas = ref(null), container = ref(null), error = ref(''), ready = ref(false)
let observer, resize, pageProxy, render, disposed = false, started = false, width = 0, timer
async function draw() {
  if (!pageProxy || disposed) return
  if (render) { render.cancel(); await render.promise.catch(() => {}) }
  if (disposed) return
  const available = Math.max(200, container.value.clientWidth)
  width = available
  const natural = pageProxy.getViewport({ scale: 1 })
  // Bound canvas pixels even for poster-size pages and high-DPI phones.
  const scale = Math.min(available / natural.width * Math.min(devicePixelRatio || 1, 1.5), Math.sqrt(4000000 / (natural.width * natural.height)))
  const viewport = pageProxy.getViewport({ scale })
  canvas.value.width = Math.ceil(viewport.width); canvas.value.height = Math.ceil(viewport.height)
  render = pageProxy.render({ canvasContext: canvas.value.getContext('2d'), viewport })
  try { await render.promise; if (!disposed) ready.value = true } catch (cause) { if (!disposed && cause.name !== 'RenderingCancelledException') error.value = '本页渲染失败，可下载原文件查看。' }
}
async function load() {
  if (started || disposed) return
  started = true
  try { pageProxy = await props.document.getPage(props.page); if (!disposed) await draw() } catch { if (!disposed) error.value = '本页加载失败，请重新选页重试。' }
}
onMounted(() => {
  observer = new IntersectionObserver(entries => { if (entries.some(item => item.isIntersecting)) { observer.disconnect(); load() } }, { rootMargin: '400px' })
  observer.observe(container.value)
  resize = new ResizeObserver(() => { if (pageProxy && Math.abs(container.value.clientWidth - width) > 2) { clearTimeout(timer); timer = setTimeout(draw, 150) } })
  resize.observe(container.value)
})
onUnmounted(() => { disposed = true; observer?.disconnect(); resize?.disconnect(); clearTimeout(timer); render?.cancel(); pageProxy?.cleanup() })
</script>
<template>
  <section :id="`pdf-page-${page}`" ref="container" class="pdf-page" :aria-label="`第${page}页`">
    <div class="pdf-page-number">第 {{ page }} 页</div>
    <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!ready" class="pdf-placeholder">第 {{ page }} 页 · 等待预览…</p>
    <canvas ref="canvas" v-show="ready" :aria-label="`PDF 第${page}页`" role="img" />
  </section>
</template>
<style scoped>
.pdf-page { scroll-margin-top: 110px; margin: 18px 0; min-width: 0; }.pdf-page-number { margin-bottom: 8px; color: var(--muted); font-size: 12px; }.pdf-placeholder { aspect-ratio: var(--pdf-ratio, .707); display: grid; place-items: center; background: var(--paper-deep); color: var(--muted); }.pdf-page canvas { display: block; width: 100%; height: auto; background: white; box-shadow: 3px 4px 0 var(--sky); }.pdf-page p[role=alert] { color: var(--error-text); }
</style>
