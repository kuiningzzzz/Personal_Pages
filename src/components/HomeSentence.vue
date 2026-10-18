<script setup>
import { ref, watch, computed } from 'vue'
import PlayerIcon from './PlayerIcon.vue'
const props = defineProps({ sentences: { type: Array, default: () => [] } })
const current = ref(null)
const alternatives = computed(() => props.sentences.filter(sentence => sentence.content !== current.value?.content))
function refresh() {
  const options = alternatives.value
  if (options.length) current.value = options[Math.floor(Math.random() * options.length)]
}
watch(() => props.sentences, sentences => {
  const retained = sentences.find(sentence => sentence.id === current.value?.id)
  current.value = retained || null
  if (!current.value) refresh()
}, { immediate: true })
</script>
<template>
  <section v-if="current" class="home-sentence" aria-label="首页句子">
    <Transition name="sentence-change" mode="out-in"><p :key="current.content">{{ current.content }}</p></Transition>
    <button type="button" :disabled="!alternatives.length" aria-label="随机换一句" title="换一句" @click="refresh"><PlayerIcon name="refresh" /></button>
  </section>
</template>
<style scoped>
.home-sentence { display: flex; align-items: center; gap: 16px; flex: none; margin: 0 7px 22px 0; padding: 18px 20px; border-radius: 6px; background: var(--paper); box-shadow: 4px 5px 0 var(--sky); color: var(--ink); }.home-sentence p { flex: 1; min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.85; font-weight: 800; }.home-sentence button { display: grid; place-items: center; flex: none; width: 34px; height: 34px; padding: 7px; border: 0; border-radius: 4px; background: var(--accent-soft); color: var(--cocoa); transition: transform .2s ease; }.home-sentence button:active:not(:disabled) { transform: rotate(30deg); }.home-sentence button:disabled { opacity: .35; cursor: default; }.home-sentence svg { width: 20px; height: 20px; }.sentence-change-enter-active, .sentence-change-leave-active { transition: opacity .15s ease, transform .15s ease; }.sentence-change-enter-from { opacity: 0; transform: translateY(4px); }.sentence-change-leave-to { opacity: 0; transform: translateY(-4px); }
@media (hover: hover) and (pointer: fine) { .home-sentence button:hover:not(:disabled) { transform: rotate(30deg); } }
@media (max-width: 720px) { .home-sentence { padding: 14px 16px; gap: 12px; margin-bottom: 17px; }.home-sentence p { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .home-sentence button, .sentence-change-enter-active, .sentence-change-leave-active { transition: none; } }
</style>
