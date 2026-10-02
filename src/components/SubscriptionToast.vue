<script setup>
import { subscriptionNotice } from '../lib/subscriptions'
</script>
<template>
  <Teleport to="body"><Transition name="subscription-toast"><div v-if="subscriptionNotice" class="subscription-toast" role="status" aria-live="polite"><span class="toast-dot" aria-hidden="true"></span>{{ subscriptionNotice }}</div></Transition></Teleport>
</template>
<style scoped>
.subscription-toast { position: fixed; z-index: 10000; top: 100px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 40px); width: max-content; padding: 18px 22px; border-radius: 6px; background: var(--paper); color: var(--ink); box-shadow: 6px 7px 0 var(--home-stack); font-size: 14px; font-weight: 700; line-height: 1.6; pointer-events: none; }
.toast-dot { width: 9px; height: 9px; background: var(--accent); border-radius: 2px; flex: none; }
.subscription-toast-enter-active, .subscription-toast-leave-active { transition: opacity .3s ease, transform .3s ease; }
.subscription-toast-enter-from, .subscription-toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }
@media (prefers-reduced-motion: reduce) { .subscription-toast-enter-active, .subscription-toast-leave-active { transition: opacity .1s ease; } }
</style>
