<script setup>
import { ref, useId } from 'vue'
import PlayerIcon from './PlayerIcon.vue'
defineProps({ title: { type: String, required: true }, summary: { type: String, default: '' } })
const expanded = ref(false)
const bodyId = useId()
</script>
<template>
  <section class="surface home-admin-section">
    <header class="fold-heading"><h2>{{ title }}</h2><span v-if="summary" class="fold-summary">{{ summary }}</span><button type="button" class="fold-toggle" :aria-label="`${expanded ? '收起' : '展开'}${title}`" :aria-expanded="expanded" :aria-controls="bodyId" @click="expanded = !expanded"><span>{{ expanded ? '收起' : '展开' }}</span><PlayerIcon :name="expanded ? 'up' : 'down'" /></button></header>
    <div v-if="expanded" :id="bodyId" class="fold-body"><slot /></div>
  </section>
</template>
<style scoped>
.home-admin-section { margin: 28px 0; padding: 22px 25px; }.fold-heading { display: flex; align-items: center; gap: 14px; }.fold-heading h2 { margin: 0; font-size: 23px; }.fold-summary { color: var(--muted); font-size: 12px; }.fold-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 5px; margin-left: auto; flex: none; padding: 8px 10px; border: 0; border-radius: 4px; color: var(--ink); background: var(--accent-soft); font-size: 12px; }.fold-toggle svg { width: 18px; height: 18px; }.fold-body { padding-top: 18px; }
@media (max-width: 650px) { .home-admin-section { padding: 18px 16px; }.fold-heading { gap: 10px; }.fold-heading h2 { font-size: 20px; } }
</style>
