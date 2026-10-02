<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, useId } from 'vue'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps({ source: { type: String, default: '' } })
const contentId = `short-post-${useId()}`
const viewport = ref(null)
const content = ref(null)
const expanded = ref(false)
const overflowing = ref(false)
const height = ref(0)
const collapsedHeight = ref(166.5)
const viewportStyle = computed(() => ({ maxHeight: `${expanded.value ? height.value : collapsedHeight.value}px` }))
let observer

function measure() {
  if (!viewport.value || !content.value) return
  collapsedHeight.value = parseFloat(getComputedStyle(viewport.value).lineHeight) * 5
  height.value = content.value.offsetHeight
  overflowing.value = height.value > collapsedHeight.value + 1
}
watch(() => props.source, async () => { expanded.value = false; await nextTick(); measure() })
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(content.value)
  measure()
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="short-post-body">
    <div :id="contentId" ref="viewport" class="short-viewport" :style="viewportStyle" @focusin="expanded = true">
      <div ref="content" class="short-content"><MarkdownContent :source="source" /></div>
    </div>
    <button v-if="overflowing" class="fold-button" type="button" :aria-expanded="expanded" :aria-controls="contentId" @click="expanded = !expanded">
      {{ expanded ? '收回' : '展开' }}<span aria-hidden="true">{{ expanded ? '↑' : '↓' }}</span>
    </button>
  </div>
</template>

<style scoped>
.short-post-body { margin: 12px 0 14px; font-size: 18px; line-height: 1.85; }
.short-viewport { overflow: hidden; transition: max-height .25s ease; }
.short-content { display: flow-root; }
.short-content :deep(.markdown) { color: var(--ink); }
.short-content :deep(p) { margin: 0 0 .6em; }
.short-content :deep(.markdown > :last-child) { margin-bottom: 0; }
.fold-button { display: inline-flex; align-items: center; gap: 9px; min-height: 34px; margin-top: 9px; padding: 5px 11px; border: 0; border-radius: 3px; color: var(--ink); background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); font-size: 13px; font-weight: 800; transition: transform .2s ease, box-shadow .2s ease; }
.fold-button:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--sun); }
.fold-button:focus-visible { outline: 2px solid var(--denim); outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { .short-viewport, .fold-button { transition: none; } }
</style>
