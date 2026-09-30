<script setup>
import { theme, switchingTheme, toggleTheme, prepareThemeTransition } from '../lib/theme'
</script>

<template>
  <button class="theme-toggle" type="button" :aria-label="theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'" :aria-pressed="theme === 'dark'" :disabled="switchingTheme" @pointerenter="prepareThemeTransition($event.currentTarget)" @focus="prepareThemeTransition($event.currentTarget)" @click="toggleTheme($event.currentTarget)">
    <svg v-if="theme === 'light'" class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 14.3A8.5 8.5 0 0 1 9.7 3.7a.65.65 0 0 0-.82-.84A9.6 9.6 0 1 0 21.14 15.1a.65.65 0 0 0-.84-.8Z" /></svg>
    <svg v-else class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
  </button>
</template>

<style scoped>
.theme-toggle { display: inline-grid; place-items: center; flex: none; width: 38px; height: 36px; padding: 8px; border: 0; border-radius: 4px; color: #fff; background: var(--theme-control); box-shadow: 3px 3px 0 var(--denim); transition: transform .2s ease, box-shadow .2s ease; }
.theme-toggle svg { display: block; width: 20px; height: 20px; }
.theme-toggle:hover { transform: translate(-1px, -2px); box-shadow: 4px 5px 0 var(--denim); }
.theme-toggle:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--denim); }
.theme-toggle:disabled { cursor: default; }
@media (max-width: 720px) { .theme-toggle { width: 34px; height: 34px; padding: 7px; } }
</style>
