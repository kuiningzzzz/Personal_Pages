<script setup>
import { ref, shallowRef, computed, onMounted, onUnmounted, nextTick } from 'vue'
import * as pdfjs from 'pdfjs-dist'
import { rangedPdfTask } from '../lib/pdf-range'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import PdfPagePicker from './PdfPagePicker.vue'
import PdfCanvasPage from './PdfCanvasPage.vue'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const props = defineProps({ src: String })
const emit = defineEmits(['pages', 'state', 'jump'])
const ratios = ref({})
const pdf = shallowRef(null), total = ref(0), start = ref(1), error = ref(''), loading = ref(true)
const pages = computed(() => pdf.value ? Array.from({ length: Math.min(10, total.value - start.value + 1) }, (_, i) => start.value + i) : [])
let task, disposed = false, selection = 0
const controller = new AbortController()
async function select(page, initial = false) {
  if (!Number.isSafeInteger(page) || page < 1 || page > total.value) return
  const token = ++selection
  loading.value = true
  const nextStart = Math.floor((page - 1) / 10) * 10 + 1
  try {
    const numbers = Array.from({ length: Math.min(10, total.value - nextStart + 1) }, (_, i) => nextStart + i)
    const sizes = await Promise.all(numbers.map(async number => {
      const proxy = await pdf.value.getPage(number)
      const view = proxy.getViewport({ scale: 1 })
      return [number, view.width / view.height]
    }))
    if (disposed || token !== selection) return
    ratios.value = Object.fromEntries(sizes); start.value = nextStart; loading.value = false
    emit('state', { total: total.value, start: start.value })
    emit('pages', pages.value.map(page => ({ id: `pdf-page-${page}`, text: `第${page}页`, level: 1 })))
    await nextTick(); if (!initial) emit('jump', `pdf-page-${page}`)
  } catch (cause) { if (!disposed && token === selection) { loading.value = false; error.value = cause.message || '无法加载此分片' } }
}

defineExpose({ select })
onMounted(async () => {
  try {
    task = await rangedPdfTask(pdfjs, props.src, { signal: controller.signal, onRangeError(cause) {
      if (disposed) return
      error.value = cause.message; loading.value = false; controller.abort(); task?.destroy()
    } })
    pdf.value = await task.promise
    if (disposed) return
    total.value = pdf.value.numPages
    await select(1, true)
  } catch (cause) { if (!disposed) error.value ||= cause.name === 'PasswordException' ? '此 PDF 已加密，请下载后使用密码打开。' : cause.message || 'PDF 预览失败' }
  finally { loading.value = false }
})
onUnmounted(() => { disposed = true; controller.abort(); task?.destroy() })
</script>
<template>
  <div class="pdf-viewer">
    <header class="pdf-toolbar"><span>{{ total ? `第 ${start}–${Math.min(start + 9, total)} 页 / 共 ${total} 页` : 'PDF 预览' }}</span><PdfPagePicker :total="total" :start="start" @select="select" /></header>
    <p v-if="loading" role="status">正在按需读取 PDF 索引…</p><p v-if="error" role="alert">{{ error }}</p>
    <template v-if="!loading"><PdfCanvasPage v-for="page in pages" :key="page" :document="pdf" :page="page" :style="{ '--pdf-ratio': ratios[page] }" /></template>
    <footer v-if="total" class="pdf-toolbar"><div><button type="button" class="ghost-button" :disabled="start === 1" @click="select(start - 10)">上一组</button> <button type="button" class="ghost-button" :disabled="start + 10 > total" @click="select(start + 10)">下一组</button></div><PdfPagePicker :total="total" :start="start" @select="select" /></footer>
  </div>
</template>
<style scoped>
.pdf-viewer { margin-top: 28px; min-width: 0; }.pdf-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: var(--muted); font-size: 13px; }.pdf-toolbar button { font-size: 12px; padding: 7px 10px; }.pdf-viewer>p { padding: 16px; background: var(--paper); }.pdf-viewer>p[role=alert] { color: var(--error-text); }
</style>
