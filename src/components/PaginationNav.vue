<script setup>
import { computed } from 'vue'
import { paginationItems } from '../lib/pagination'

const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])
const items = computed(() => paginationItems(props.page, props.totalPages))
</script>

<template>
  <nav v-if="totalPages > 1" class="pagination-nav" aria-label="内容分页">
    <button type="button" :disabled="disabled || page <= 1" @click="emit('change', page - 1)">上一页</button>
    <template v-for="item in items" :key="item">
      <button v-if="typeof item === 'number'" type="button" class="page-number" :class="{ active: item === page }" :aria-label="`第 ${item} 页`" :aria-current="item === page ? 'page' : undefined" :disabled="disabled" @click="item !== page && emit('change', item)">{{ item }}</button>
      <span v-else class="page-gap" aria-hidden="true">…</span>
    </template>
    <button type="button" :disabled="disabled || page >= totalPages" @click="emit('change', page + 1)">下一页</button>
  </nav>
</template>

<style scoped>
.pagination-nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin-top: 32px; padding-bottom: 5px; }
.pagination-nav button { min-width: 36px; min-height: 36px; padding: 8px 12px; border: 0; border-radius: 4px; background: var(--paper); color: var(--ink); box-shadow: 3px 3px 0 var(--paper-deep); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform .2s ease, background-color .2s ease; }
.pagination-nav .page-number { padding-inline: 8px; }
.pagination-nav button:hover:not(:disabled) { background: var(--sky); transform: translateY(-2px); }
.pagination-nav button.active { background: var(--accent-soft); box-shadow: 3px 3px 0 var(--sun); }
.pagination-nav button:disabled { opacity: .45; cursor: not-allowed; }
.page-gap { min-width: 16px; color: var(--muted); text-align: center; }
@media (max-width: 500px) { .pagination-nav { gap: 6px; } .pagination-nav button { min-width: 30px; padding-inline: 8px; } }
@media (prefers-reduced-motion: reduce) { .pagination-nav button { transition: none; } }
</style>
