<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { positionFloatingMenu } from '../lib/floating-menu'
const props = defineProps({ total: Number, start: Number })
const emit = defineEmits(['select'])
const open = ref(false), query = ref(''), error = ref(''), root = ref(null), menu = ref(null), trigger = ref(null)
let frame = 0, observer, focusSearch = false
const ranges = computed(() => Array.from({ length: Math.ceil((props.total || 0) / 10) }, (_, i) => ({ start: i * 10 + 1, end: Math.min(i * 10 + 10, props.total) })))
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus({ preventScroll: true }) }
function toggle(event) { focusSearch = event.detail === 0; open.value = !open.value }
function select(page) { close(true); emit('select', page); error.value = '' }
function search() {
  if (!/^[1-9]\d*$/.test(query.value.trim()) || !Number.isSafeInteger(Number(query.value))) { error.value = '请输入正整数页码'; return }
  const page = Number(query.value)
  if (page > props.total) { error.value = `共 ${props.total} 页，请输入范围内的页码`; return }
  select(page)
}
function outside(event) { if (!root.value?.contains(event.target) && !menu.value?.contains(event.target)) close() }
function position() {
  frame = 0
  if (!open.value || !menu.value || !trigger.value) return
  const panel = menu.value, visual = window.visualViewport
  const viewport = { left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0, width: visual?.width || document.documentElement.clientWidth, height: visual?.height || window.innerHeight }
  panel.style.width = `${Math.max(0, Math.min(260, viewport.width - 24))}px`
  // Measure the natural form/error/list height, not a previous constrained one.
  panel.style.maxHeight = 'none'
  const placed = positionFloatingMenu(trigger.value.getBoundingClientRect(), panel.getBoundingClientRect(), viewport)
  Object.assign(panel.style, { left: `${placed.left}px`, top: `${placed.top}px`, width: `${placed.width}px`, maxHeight: `${placed.maxHeight}px`, visibility: 'visible' })
  panel.dataset.placement = placed.side
}
function schedule(event) {
  if (event?.target instanceof Node && menu.value?.contains(event.target)) return
  if (open.value && !frame) frame = requestAnimationFrame(position)
}
function stopFollowing() {
  cancelAnimationFrame(frame); frame = 0; observer?.disconnect()
  window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule)
  window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule)
}
watch(open, async value => {
  stopFollowing(); error.value = ''; query.value = ''
  if (!value) return
  await nextTick()
  if (!open.value || !menu.value) return
  position()
  window.addEventListener('scroll', schedule, { capture: true, passive: true }); window.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule)
  observer = new ResizeObserver(() => schedule()); observer.observe(trigger.value); observer.observe(menu.value)
  if (focusSearch) menu.value.querySelector('input')?.focus({ preventScroll: true })
})
watch([error, () => props.total], async () => { await nextTick(); schedule() })
onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => { stopFollowing(); document.removeEventListener('pointerdown', outside) })
</script>
<template>
  <div ref="root" class="pdf-picker" @keydown.esc.stop="close(true)">
    <button ref="trigger" type="button" class="ghost-button" :disabled="!total" :aria-expanded="open" @click="toggle">选页 ▾</button>
    <Teleport to="body"><div v-if="open" ref="menu" class="pdf-page-menu" @keydown.esc.stop.prevent="close(true)">
      <form @submit.prevent="search"><input v-model="query" type="text" inputmode="numeric" placeholder="输入页码" aria-label="跳转到 PDF 页码" /><button type="submit">跳转</button></form>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="pdf-range-list"><button v-for="range in ranges" :key="range.start" type="button" :class="{ active: range.start === start }" @click="select(range.start)">{{ range.start }}–{{ range.end }}</button></div>
    </div></Teleport>
  </div>
</template>
<style scoped>
.pdf-picker { position: relative; display: inline-block; flex-shrink: 0; }.pdf-picker>.ghost-button { padding: 6px 10px; min-height: 30px; font-size: 12px; }.pdf-page-menu { position: fixed; z-index: 2000; visibility: hidden; display: flex; flex-direction: column; box-sizing: border-box; overflow: auto; overscroll-behavior: contain; padding: 12px; border-radius: 5px; background: var(--paper); color: var(--ink); box-shadow: 5px 6px 0 var(--sky), 0 5px 24px #0002; }.pdf-page-menu form { flex: none; display: flex; gap: 6px; }.pdf-page-menu input { min-width: 0; width: 100%; padding: 8px; border: 0; background: var(--field-bg); color: var(--ink); }.pdf-page-menu button { padding: 8px; border: 0; border-radius: 3px; background: var(--accent-soft); color: var(--ink); cursor: pointer; white-space: nowrap; }.pdf-range-list { flex: 0 1 auto; min-height: 0; display: grid; overscroll-behavior: contain; gap: 6px; max-height: 240px; overflow-y: auto; margin-top: 10px; }.pdf-range-list button { background: var(--paper-deep); text-align: left; }.pdf-range-list button.active { background: var(--sky); font-weight: 800; }.pdf-page-menu p { color: var(--error-text); font-size: 12px; }
</style>
