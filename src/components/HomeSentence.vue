<script setup>
import { ref, watch, computed } from 'vue'
import PlayerIcon from './PlayerIcon.vue'
const props = defineProps({ sentences: { type: Array, default: () => [] } })
const current = ref(null)
const refreshVersion = ref(0)
const alternatives = computed(() => props.sentences.filter(sentence => sentence.content !== current.value?.content))
function refresh(animate = false) {
  const options = alternatives.value
  if (options.length) {
    current.value = options[Math.floor(Math.random() * options.length)]
    if (animate) refreshVersion.value++
  }
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
    <button type="button" :disabled="!alternatives.length" aria-label="随机换一句" title="换一句" @click="refresh(true)"><PlayerIcon :key="refreshVersion" class="sentence-refresh-icon" :class="{ 'is-refreshing': refreshVersion > 0 }" name="refresh" /></button>
  </section>
</template>
<style scoped>
.home-sentence { display: flex; align-items: center; gap: 16px; flex: none; margin: 0 7px 22px 0; padding: 18px 20px; border-radius: 6px; background: var(--paper); box-shadow: 4px 5px 0 var(--sky); color: var(--ink); }.home-sentence p { flex: 1; min-width: 0; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.85; font-weight: 800; }.home-sentence button { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 8px; border: 0; border-radius: 4px; background: var(--accent-soft); color: var(--cocoa); cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background-color .18s ease, transform .18s ease; }.home-sentence button:active:not(:disabled) { transform: scale(.94); }.home-sentence button:disabled { opacity: .35; cursor: default; }.home-sentence .sentence-refresh-icon { display: block; flex: none; width: 20px; height: 20px; transform-origin: 50% 50%; }.sentence-refresh-icon.is-refreshing { animation: sentence-refresh-turn .45s ease-out; }
@keyframes sentence-refresh-turn { from { transform: rotate(0); } to { transform: rotate(360deg); } }.sentence-change-enter-active, .sentence-change-leave-active { transition: opacity .15s ease, transform .15s ease; }.sentence-change-enter-from { opacity: 0; transform: translateY(4px); }.sentence-change-leave-to { opacity: 0; transform: translateY(-4px); }
@media (hover: hover) and (pointer: fine) { .home-sentence button:hover:not(:disabled) { background: var(--sky); } }
@media (max-width: 720px) { .home-sentence { padding: 14px 16px; gap: 12px; margin-bottom: 17px; }.home-sentence p { font-size: 14px; }.home-sentence button { width: 44px; height: 44px; padding: 12px; } }
@media (prefers-reduced-motion: reduce) { .home-sentence button, .sentence-change-enter-active, .sentence-change-leave-active { transition: none; }.sentence-refresh-icon.is-refreshing { animation: none; } }
</style>
