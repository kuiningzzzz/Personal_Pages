<script setup>
defineProps({ name: { type: String, required: true } })
</script>
<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'play'" d="m8 4 13 8-13 8Z" fill="currentColor" stroke="none" />
    <path v-else-if="name === 'pause'" d="M7 5v14M17 5v14" stroke-width="4" />
    <template v-else-if="name === 'previous'"><path d="m18 5-11 7 11 7Z" fill="currentColor" stroke="none" /><path d="M5 5v14" stroke-width="3" /></template>
    <template v-else-if="name === 'next'"><path d="m6 5 11 7-11 7Z" fill="currentColor" stroke="none" /><path d="M19 5v14" stroke-width="3" /></template>
    <path v-else-if="name === 'playlist'" d="M4 6h16M4 12h16M4 18h16" />
    <template v-else-if="name.startsWith('volume-')">
      <path d="M2 9h3l5-4v14l-5-4H2Z" />
      <path v-if="name === 'volume-muted'" d="m15 9 6 6m0-6-6 6" />
      <template v-else>
        <path d="M13 9a5 5 0 0 1 0 6" />
        <path v-if="name === 'volume-medium' || name === 'volume-high'" d="M16 6a9 9 0 0 1 0 12" />
        <path v-if="name === 'volume-high'" d="M19 3a13 13 0 0 1 0 18" />
      </template>
    </template>
    <template v-else-if="name === 'list' || name === 'single'"><path d="m17 2 4 4-4 4M3 10V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14 0v2a2 2 0 0 1-2 2H3" /><path v-if="name === 'single'" d="m10 10 2-1v6m-2 0h4" /></template>
    <path v-else-if="name === 'shuffle'" d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c1.7 0 3.5-2.2 5-4.5M14 9c1.4-1.8 2.7-3 4-3h3m-4-4 4 4-4 4" />
    <path v-else-if="name === 'up'" d="m5 15 7-7 7 7" />
    <path v-else-if="name === 'down'" d="m5 9 7 7 7-7" />
  </svg>
</template>
