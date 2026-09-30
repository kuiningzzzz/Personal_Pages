<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({ images: { type: Array, default: () => [] } })
const container = ref(null)
const columnCount = ref(3)
const dimensions = ref({})
const failed = ref({})
const previewIndex = ref(-1)
const dialog = ref(null)
const current = computed(() => props.images[previewIndex.value])
let observer
let trigger
let previousOverflow = ''
const columns = computed(() => {
  const result = Array.from({ length: columnCount.value }, () => [])
  const heights = result.map(() => 0)
  props.images.forEach((image, index) => {
    const size = dimensions.value[index] || image
    const ratio = size.width && size.height ? size.height / size.width : 1
    const column = heights.indexOf(Math.min(...heights))
    result[column].push({ ...image, index })
    heights[column] += ratio + (image.caption ? .24 : 0) + .08
  })
  return result
})
function imageLoaded(event, index) {
  const image = event.target
  const old = dimensions.value[index]
  if (old?.width !== image.naturalWidth || old?.height !== image.naturalHeight) dimensions.value[index] = { width: image.naturalWidth, height: image.naturalHeight }
}
async function open(index, event) {
  previewIndex.value = index
  trigger = event.currentTarget
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  await nextTick()
  dialog.value.showModal()
}
function close() {
  dialog.value?.close()
  previewIndex.value = -1
  document.body.style.overflow = previousOverflow
  trigger?.focus()
}
function move(step) { previewIndex.value = (previewIndex.value + step + props.images.length) % props.images.length }
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { columnCount.value = entry.contentRect.width >= 1000 ? 4 : entry.contentRect.width >= 700 ? 3 : 2 })
  observer.observe(container.value)
})
onUnmounted(() => { observer?.disconnect(); if (previewIndex.value >= 0) document.body.style.overflow = previousOverflow })
</script>

<template>
  <div ref="container" class="gallery-container">
    <div v-if="!images.length" class="surface state">图集里暂时还没有图片</div>
    <div v-else class="gallery-columns" :style="{ '--columns': columnCount }">
      <div v-for="(column, index) in columns" :key="index" class="gallery-column">
        <figure v-for="image in column" :key="image.index" class="gallery-tile">
          <button type="button" :aria-label="`放大查看：${image.caption || `第 ${image.index + 1} 张图片`}`" @click="open(image.index, $event)">
            <span v-if="failed[image.index]" class="image-failed">图片加载失败</span>
            <img v-else :src="image.url" :alt="image.caption || `第 ${image.index + 1} 张图片`" :width="image.width || undefined" :height="image.height || undefined" loading="lazy" @load="imageLoaded($event, image.index)" @error="failed[image.index] = true" />
            <span class="image-number">{{ String(image.index + 1).padStart(2, '0') }}</span>
          </button>
          <figcaption v-if="image.caption">{{ image.caption }}</figcaption>
        </figure>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <dialog ref="dialog" class="image-dialog" aria-label="图集大图预览" @cancel.prevent="close" @close="previewIndex >= 0 && close()" @click="$event.target === dialog && close()" @keydown.left.prevent="move(-1)" @keydown.right.prevent="move(1)">
      <div v-if="current" class="image-dialog-content">
        <div class="image-dialog-bar"><span>{{ previewIndex + 1 }} / {{ images.length }}</span><button type="button" class="ghost-button" aria-label="关闭大图预览" @click="close">关闭 ×</button></div>
        <div class="image-dialog-stage"><button type="button" :disabled="images.length < 2" aria-label="上一张图片" @click="move(-1)">←</button><img :src="current.url" :alt="current.caption || `第 ${previewIndex + 1} 张图片`" /><button type="button" :disabled="images.length < 2" aria-label="下一张图片" @click="move(1)">→</button></div>
        <div class="image-dialog-footer"><p>{{ current.caption }}</p><a class="ghost-button" :href="current.url" target="_blank" rel="noopener noreferrer">打开原图 ↗</a></div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.gallery-container { margin-top: 34px; }
.gallery-columns { display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); gap: 22px; }
.gallery-column { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.gallery-tile { margin: 0; padding: 9px; border-radius: 6px; background: var(--paper); box-shadow: 5px 6px 0 var(--sky); transition: transform .2s ease, box-shadow .2s ease; }
.gallery-column:nth-child(2n) .gallery-tile { box-shadow: 5px 6px 0 var(--accent-soft); }
.gallery-tile:hover { transform: translateY(-3px); box-shadow: 8px 9px 0 var(--denim); }
.gallery-tile button { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: 3px; overflow: hidden; background: var(--paper-deep); cursor: zoom-in; }
.gallery-tile img { display: block; width: 100%; height: auto; }
.image-number { position: absolute; right: 7px; bottom: 7px; padding: 3px 6px; border-radius: 3px; color: var(--ink); background: var(--paper); font-size: 10px; font-weight: 800; }
figcaption { padding: 11px 5px 4px; color: var(--muted); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.image-failed { display: grid; min-height: 180px; place-items: center; color: var(--muted); font-size: 12px; }
.image-dialog { width: min(1200px, calc(100vw - 40px)); max-width: none; max-height: calc(100dvh - 40px); padding: 20px; border: 0; border-radius: 8px; color: var(--ink); background: var(--paper); box-shadow: 8px 8px 0 var(--denim); }
.image-dialog::backdrop { background: var(--dialog-backdrop); }
.image-dialog-bar, .image-dialog-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 13px; }
.image-dialog-bar { margin-bottom: 16px; font-weight: 800; }
.image-dialog-stage { display: grid; grid-template-columns: 40px minmax(0, 1fr) 40px; align-items: center; gap: 12px; }
.image-dialog-stage img { display: block; max-width: 100%; max-height: calc(100dvh - 225px); width: auto; height: auto; margin: auto; object-fit: contain; }
.image-dialog-stage button { min-height: 42px; border: 0; border-radius: 4px; background: var(--accent-soft); color: var(--ink); font-weight: 800; }
.image-dialog-stage button:disabled { opacity: .4; cursor: default; }
.image-dialog-footer { margin-top: 16px; }
.image-dialog-footer p { margin: 0; overflow-wrap: anywhere; }
.image-dialog-footer a { flex-shrink: 0; }
@media (max-width: 600px) { .gallery-columns, .gallery-column { gap: 15px; } .gallery-tile { padding: 6px; } .image-dialog { width: calc(100vw - 24px); padding: 12px; } .image-dialog-stage { grid-template-columns: 28px minmax(0, 1fr) 28px; gap: 6px; } .image-dialog-footer { align-items: flex-start; } }
@media (prefers-reduced-motion: reduce) { .gallery-tile { transition: none; } .gallery-tile:hover { transform: none; } }
</style>
