<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick, useId } from 'vue'
const model = defineModel({ default: null })
const props = defineProps({ items: { type: Array, default: () => [] }, label: { type: String, required: true }, rootLabel: { type: String, default: '资源库首页' }, rootValue: { default: null }, allowRoot: { type: Boolean, default: true }, documents: Boolean, disabled: Boolean, placeholder: { type: String, default: '选择一个合集' } })
const emit = defineEmits(['change'])
const open = ref(false), currentId = ref(null), query = ref(''), root = ref(null), trigger = ref(null), search = ref(null)
const panelId = useId()
const key = id => id == null || id === '' ? '' : String(id)
const folders = computed(() => new Map(props.items.filter(item => item.isFolder !== false).map(item => [key(item.id), item])))
const byId = computed(() => new Map(props.items.map(item => [key(item.id), item])))
const selected = computed(() => byId.value.get(key(model.value)))
const current = computed(() => folders.value.get(key(currentId.value)))
function ancestors(item) {
  const path = [], seen = new Set()
  while (item && !seen.has(key(item.id))) { seen.add(key(item.id)); path.unshift(item); item = folders.value.get(key(item.parent_id)) }
  return path
}
const crumbs = computed(() => ancestors(current.value))
const pathText = item => [props.rootLabel, ...ancestors(item).map(row => row.title)].join(' / ')
const selectedText = computed(() => selected.value ? pathText(selected.value) : props.allowRoot && key(model.value) === '' ? props.rootLabel : props.placeholder)
const selectable = item => item ? !item.disabled && (props.documents ? item.isFolder === false : item.isFolder !== false) : props.allowRoot && !props.documents
const visible = computed(() => {
  const text = query.value.trim().toLocaleLowerCase()
  return props.items.filter(item => {
    if (!text) return key(item.parent_id) === key(currentId.value)
    return (!current.value || ancestors(item).some(parent => key(parent.id) === key(current.value.id)) && key(item.id) !== key(current.value.id)) && pathText(item).toLocaleLowerCase().includes(text)
  }).sort((a, b) => Number(b.isFolder !== false) - Number(a.isFolder !== false) || a.title.localeCompare(b.title, 'zh-CN'))
})
async function toggle() {
  open.value = !open.value
  if (open.value) {
    currentId.value = selected.value ? selected.value.isFolder === false ? selected.value.parent_id : selected.value.id : null
    query.value = ''; await nextTick(); search.value?.focus()
  }
}
function enter(id) { currentId.value = id; query.value = '' }
function close(focus = false) { open.value = false; if (focus) trigger.value?.focus() }
function choose(item) {
  if (props.disabled || !selectable(item)) return
  model.value = item ? item.id : props.rootValue
  emit('change', model.value); close(true)
}
function outside(event) { if (!root.value?.contains(event.target)) close() }
watch(() => props.disabled, disabled => { if (disabled) close() })
watch(folders, () => { if (currentId.value != null && !current.value) enter(null) })
onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
</script>
<template>
  <div ref="root" class="location-picker" @keydown.esc.stop.prevent="close(true)">
    <span class="location-label">{{ label }}</span>
    <button ref="trigger" type="button" class="location-trigger" :disabled="disabled" :aria-label="`${label}：${selectedText}`" :aria-expanded="open" :aria-controls="panelId" @click="toggle"><span>{{ selectedText }}</span><span aria-hidden="true">▾</span></button>
    <div v-if="open" :id="panelId" class="location-panel" role="group" :aria-label="`${label}目录选择`">
      <nav class="location-crumbs" aria-label="当前位置"><button type="button" @click="enter(null)">{{ rootLabel }}</button><template v-for="crumb in crumbs" :key="crumb.id"><span aria-hidden="true">/</span><button type="button" :aria-current="crumb.id === currentId ? 'location' : undefined" @click="enter(crumb.id)">{{ crumb.title }}</button></template></nav>
      <div class="location-tools"><button type="button" :disabled="!current" @click="enter(current?.parent_id ?? null)">↑ 上一级</button><input ref="search" v-model="query" type="search" :aria-label="`搜索${label}`" placeholder="搜索当前目录及子目录" /></div>
      <div class="location-items">
        <div v-for="item in visible" :key="item.id" class="location-item">
          <button type="button" :disabled="item.isFolder === false && !selectable(item)" :aria-label="`${item.isFolder === false ? '选择文档' : '进入合集'} ${item.title}`" @click="item.isFolder === false ? choose(item) : enter(item.id)">
            <svg v-if="item.isFolder !== false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7V5h6l2 2h10v13H3Z" /></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6" /></svg>
            <span><strong>{{ item.title }}</strong><small v-if="query">{{ pathText(item) }}</small><small v-if="item.disabled">不可选择 · 尚未公开</small><small v-else-if="item.status === 'draft'">草稿</small></span><span v-if="item.isFolder !== false" aria-hidden="true">›</span>
          </button>
        </div>
        <p v-if="!visible.length">{{ query ? '没有找到匹配内容' : documents ? '此目录没有文档或子合集' : '此目录没有子合集' }}</p>
      </div>
      <footer><small>{{ documents ? '进入合集浏览，点击文档即可选择' : '进入目标合集后，点击下方按钮确认' }}</small><div><button type="button" @click="close(true)">取消</button><button v-if="!documents" type="button" :disabled="!selectable(current)" @click="choose(current)">{{ current ? '选择此合集' : '选择根目录' }}</button></div></footer>
    </div>
  </div>
</template>
<style scoped>
.location-picker { position: relative; min-width: 0; margin-bottom: 18px; color: var(--ink); font-size: 13px; font-weight: 700; }.location-label { display: block; margin-bottom: 8px; }.location-picker button { border: 0; border-radius: 4px; color: var(--ink); cursor: pointer; font: inherit; }.location-picker button:disabled { opacity: .45; cursor: not-allowed; }.location-trigger { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; background: var(--field-bg, var(--paper-deep)); text-align: left; }.location-trigger span:first-child { overflow-wrap: anywhere; min-width: 0; }.location-panel { margin-top: 10px; padding: 12px; border-radius: 5px; background: var(--paper); box-shadow: 4px 5px 0 var(--sky); }.location-crumbs { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin-bottom: 12px; }.location-crumbs button { max-width: 100%; overflow-wrap: anywhere; padding: 5px 7px; background: var(--paper-deep); font-size: 12px; }.location-crumbs button[aria-current] { background: var(--accent-soft); }.location-tools { display: flex; gap: 8px; align-items: center; }.location-tools button { flex: none; padding: 8px; background: var(--paper-deep); font-size: 12px; }.location-picker .location-tools input { min-width: 0; width: 100%; padding: 9px; border: 0; border-radius: 4px; background: var(--field-bg, var(--paper-deep)); color: var(--ink); font: inherit; font-size: 12px; }.location-items { max-height: 270px; overflow-y: auto; margin-top: 10px; }.location-item>button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 8px; background: transparent; text-align: left; }.location-item>button:hover,.location-item>button:focus-visible { background: var(--paper-deep); }.location-item svg { flex: none; width: 21px; height: 21px; color: var(--cocoa); }.location-item span:first-of-type { flex: 1; min-width: 0; }.location-item strong { overflow-wrap: anywhere; font-size: 13px; }.location-item small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; font-weight: 400; overflow-wrap: anywhere; }.location-items p { color: var(--muted); font-size: 12px; font-weight: 400; }.location-panel footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; }.location-panel footer small { color: var(--muted); font-size: 11px; font-weight: 400; }.location-panel footer div { display: flex; gap: 8px; margin-left: auto; }.location-panel footer button { padding: 8px 10px; background: var(--paper-deep); font-size: 12px; }.location-panel footer button:last-child:not(:first-child) { background: var(--accent-soft); }
</style>
