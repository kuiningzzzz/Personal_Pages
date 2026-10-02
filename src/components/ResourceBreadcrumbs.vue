<script setup>
defineProps({ ancestors: { type: Array, default: () => [] }, current: { type: String, default: '' } })
</script>
<template>
  <nav class="resource-trail" aria-label="资源库位置">
    <router-link to="/resource">资源库</router-link>
    <template v-for="ancestor in ancestors" :key="ancestor.id"><span aria-hidden="true">/</span><router-link :to="`/resource/collection/${ancestor.id}`">{{ ancestor.title }}</router-link></template>
    <template v-if="current"><span aria-hidden="true">/</span><span class="current" aria-current="page">{{ current }}</span></template>
  </nav>
</template>
<style scoped>
.resource-trail { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 24px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.resource-trail a { padding: 3px 7px; border-radius: 3px; color: var(--ink); background: var(--accent-soft); text-decoration: none; font-weight: 700; }
.resource-trail a:hover { background: var(--sky); }
.current { overflow-wrap: anywhere; }
</style>
