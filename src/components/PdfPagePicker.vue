<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
const props = defineProps({ total: Number, start: Number })
const emit = defineEmits(['select'])
const open = ref(false), query = ref(''), error = ref(''), root = ref(null)
const ranges = computed(() => Array.from({ length: Math.ceil((props.total || 0) / 10) }, (_, i) => ({ start: i * 10 + 1, end: Math.min(i * 10 + 10, props.total) })))
function select(page) { emit('select', page); open.value = false; error.value = '' }
function search() {
  if (!/^[1-9]\d*$/.test(query.value.trim()) || !Number.isSafeInteger(Number(query.value))) { error.value = '请输入正整数页码'; return }
  const page = Number(query.value)
  if (page > props.total) { error.value = `共 ${props.total} 页，请输入范围内的页码`; return }
  select(page)
}
function outside(event) { if (!root.value?.contains(event.target)) open.value = false }
watch(open, () => { error.value = ''; query.value = '' })
onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
</script>
<template>
  <div ref="root" class="pdf-picker" @keydown.esc.stop="open = false">
    <button type="button" class="ghost-button" :disabled="!total" :aria-expanded="open" @click="open = !open">选页 ▾</button>
    <div v-if="open" class="pdf-page-menu">
      <form @submit.prevent="search"><input v-model="query" type="text" inputmode="numeric" placeholder="输入页码" aria-label="跳转到 PDF 页码" /><button type="submit">跳转</button></form>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="pdf-range-list"><button v-for="range in ranges" :key="range.start" type="button" :class="{ active: range.start === start }" @click="select(range.start)">{{ range.start }}–{{ range.end }}</button></div>
    </div>
  </div>
</template>
<style scoped>
.pdf-picker { position: relative; display: inline-block; flex-shrink: 0; }.pdf-picker>.ghost-button { padding: 6px 10px; min-height: 30px; font-size: 12px; }.pdf-page-menu { position: absolute; z-index: 15; right: 0; top: calc(100% + 8px); width: min(260px, 58vw); padding: 12px; border-radius: 5px; background: var(--paper); color: var(--ink); box-shadow: 5px 6px 0 var(--sky), 0 5px 24px #0002; }.pdf-page-menu form { display: flex; gap: 6px; }.pdf-page-menu input { min-width: 0; width: 100%; padding: 8px; border: 0; background: var(--field-bg); color: var(--ink); }.pdf-page-menu button { padding: 8px; border: 0; border-radius: 3px; background: var(--accent-soft); color: var(--ink); cursor: pointer; white-space: nowrap; }.pdf-range-list { display: grid; gap: 6px; max-height: 240px; overflow-y: auto; margin-top: 10px; }.pdf-range-list button { background: var(--paper-deep); text-align: left; }.pdf-range-list button.active { background: var(--sky); font-weight: 800; }.pdf-page-menu p { color: var(--error-text); font-size: 12px; }
</style>
