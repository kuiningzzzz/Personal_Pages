<script setup>
import { computed, onMounted } from 'vue'
import { isSubscribed, loadSubscriptions, subscriptionsBusy, toggleSubscription } from '../lib/subscriptions'
const props = defineProps({ scope: { type: String, required: true }, targetId: { type: [String, Number], default: 0 }, label: { type: String, default: '' }, subscribeText: { type: String, default: '订阅' }, cancelText: { type: String, default: '取消订阅' } })
const subscribed = computed(() => isSubscribed(props.scope, props.targetId))
onMounted(() => { loadSubscriptions().catch(() => {}) })
</script>
<template>
  <button type="button" class="subscribe-button" :class="{ subscribed }" :disabled="subscriptionsBusy" :aria-pressed="subscribed" :aria-label="`${subscribed ? '取消订阅' : '订阅'}${label}`" @click.stop="toggleSubscription(scope, targetId)">
    <svg v-if="!subscribed" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4 14h12l-1.5-2V8a4.5 4.5 0 0 0-9 0v4L4 14ZM8 16a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <svg v-else aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m4.5 10 3.5 3.5 7.5-7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    {{ subscribed ? cancelText : subscribeText }}
  </button>
</template>
<style scoped>
.subscribe-button { display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 6px; height: 34px; min-height: 34px; padding: 0 12px; border: 0; border-radius: 4px; background: var(--accent-soft); color: var(--ink); box-shadow: 3px 3px 0 var(--sun); font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; transition: transform .2s ease, background-color .2s ease; }
.subscribe-button svg { width: 17px; height: 17px; flex: none; }
.subscribe-button.subscribed { background: var(--sky); box-shadow: 3px 3px 0 var(--denim); }
.subscribe-button:hover:not(:disabled) { transform: translateY(-2px); }
.subscribe-button:disabled { opacity: .65; cursor: wait; }
</style>
