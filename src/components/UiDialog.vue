<script setup>
import { nextTick, onUnmounted, ref, useId, watch } from 'vue'
import { lockPageScroll, trapFocus } from '../lib/layers'
const props = defineProps({ open: Boolean, title: { type: String, default: '' }, busy: Boolean })
const emit = defineEmits(['close'])
const panel = ref(null)
const titleId = useId()
let release
let previousFocus
function keydown(event) {
  if (!props.open) return
  if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); if (!props.busy) emit('close') }
  trapFocus(event, panel.value)
}
watch(() => props.open, async value => {
  if (value) {
    previousFocus = document.activeElement
    release = lockPageScroll()
    document.addEventListener('keydown', keydown, true)
    await nextTick()
    panel.value?.querySelector('input,textarea,button')?.focus()
  } else {
    release?.(); release = null
    document.removeEventListener('keydown', keydown, true)
    if (previousFocus?.isConnected) previousFocus.focus()
  }
}, { immediate: true })
onUnmounted(() => { release?.(); document.removeEventListener('keydown', keydown, true) })
</script>
<template>
  <Teleport to="body"><Transition name="site-dialog"><div v-if="open" class="dialog-backdrop" @click.self="!busy && emit('close')"><section ref="panel" class="dialog-card" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1"><header><h2 :id="titleId">{{ title }}</h2><button type="button" :disabled="busy" aria-label="关闭弹窗" @click="emit('close')">×</button></header><slot /></section></div></Transition></Teleport>
</template>
<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 24px; background: var(--dialog-backdrop); }
.dialog-card { width: min(100%, 460px); max-height: calc(100dvh - 48px); overflow-y: auto; padding: 26px; border-radius: 7px; background: var(--paper); color: var(--ink); box-shadow: 8px 9px 0 var(--home-stack); }
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
h2 { margin: 0; font-size: 21px; line-height: 1.4; }
header button { flex: none; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 4px; background: var(--paper-deep); color: var(--ink); font-size: 23px; line-height: 1; }
.site-dialog-enter-active, .site-dialog-leave-active { transition: opacity .2s ease; }
.site-dialog-enter-active .dialog-card, .site-dialog-leave-active .dialog-card { transition: transform .2s ease; }
.site-dialog-enter-from, .site-dialog-leave-to { opacity: 0; }
.site-dialog-enter-from .dialog-card, .site-dialog-leave-to .dialog-card { transform: translateY(12px); }
@media (prefers-reduced-motion: reduce) { .site-dialog-enter-active, .site-dialog-leave-active, .site-dialog-enter-active .dialog-card, .site-dialog-leave-active .dialog-card { transition: none; } }
</style>
