<script setup>
defineProps({ name: { type: String, required: true }, filled: Boolean })
</script>
<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-if="name === 'like'" d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" :fill="filled ? 'currentColor' : 'none'" />
    <path v-else-if="name === 'reply'" d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5ZM7 10h8M7 14h5" />
    <g v-else-if="name === 'more'" fill="currentColor" stroke="none"><circle cx="4" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="20" cy="12" r="1.8" /></g>
    <path v-else-if="name === 'copy'" d="M9 9h11v12H9zM15 9V3H3v12h6" />
    <path v-else-if="name === 'report'" d="M5 22V3c5-4 9 4 14 0v11c-5 4-9-4-14 0" />
    <path v-else-if="name === 'withdraw'" d="m9 4-6 6 6 6M3 10h11a7 7 0 0 1 7 7v3" />
  </svg>
</template>
<style scoped>svg { flex: none; width: 17px; height: 17px; }</style>
