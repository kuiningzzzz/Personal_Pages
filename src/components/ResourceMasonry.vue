<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
const props = defineProps({ enabled: Boolean, count: Number })
const container = ref(null), columns = ref(1), height = ref(0)
let observer, frame = 0, lastWidth = 0, disposed = false
const gap = 22
function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(layout) }
async function layout() {
  frame = 0
  const element = container.value
  if (!element) return
  const width = element.clientWidth
  const nextColumns = props.enabled ? Math.max(1, Math.min(props.count, width >= 1000 ? 3 : width >= 680 ? 2 : 1)) : 1
  if (columns.value !== nextColumns) { columns.value = nextColumns; await nextTick() }
  if (disposed || container.value !== element) return
  if (nextColumns === 1) { height.value = 0; return }
  const heights = Array(nextColumns).fill(0)
  const columnWidth = (width - gap * (nextColumns - 1)) / nextColumns
  // Keep cards in their original DOM order, so keyboard navigation and sorting
  // follow the list order. Place the next card in the shortest visual column.
  for (const item of element.children) {
    const column = heights.indexOf(Math.min(...heights))
    item.style.setProperty('--masonry-x', `${column * (columnWidth + gap)}px`)
    item.style.setProperty('--masonry-y', `${heights[column]}px`)
    // Layout height excludes the list's 3D entrance and card hover transforms.
    heights[column] += item.offsetHeight + gap
  }
  height.value = Math.max(...heights) - gap
}
watch([container, () => props.enabled, () => props.count], async () => {
  observer?.disconnect()
  await nextTick()
  const element = container.value
  if (!element || disposed) return
  if (!props.enabled) { columns.value = 1; height.value = 0; return }
  lastWidth = element.clientWidth
  observer = new ResizeObserver(entries => {
    if (entries.some(entry => entry.target !== element) || element.clientWidth !== lastWidth) {
      lastWidth = element.clientWidth; schedule()
    }
  })
  observer.observe(element)
  for (const item of element.children) observer.observe(item)
  schedule()
}, { flush: 'post', immediate: true })
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); cancelAnimationFrame(frame) })
</script>
<template>
  <div ref="container" :class="{ 'resource-masonry': columns > 1 }" :data-columns="columns" :style="{ '--masonry-columns': columns, '--masonry-gap': `${gap}px`, '--masonry-height': `${height}px` }"><slot /></div>
</template>
