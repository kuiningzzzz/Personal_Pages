<script setup>
import { ref, onMounted } from 'vue'

const message = ref('')
onMounted(async () => {
  try { const result = await (await fetch('/api/content/settings')).json(); message.value = result.data.activitiesMessage || '' }
  catch { /* page remains usable */ }
})
</script>

<template>
  <div class="page-shell activity-page">
    <span class="eyebrow">04 / 预留</span>
    <h1 class="page-heading">活动<span>。</span></h1>
    <div class="activity-card">
      <span class="corner-note">空白页 / 待续</span>
      <div class="activity-content"><span class="work-mark" aria-hidden="true">〰</span><h2>施工中</h2><p>{{ message }}</p></div>
      <span class="page-number">04</span>
    </div>
  </div>
</template>

<style scoped>
.activity-page { padding-top: 70px; padding-bottom: 80px; }
.page-heading span { color: var(--accent); }
.activity-card { position: relative; display: grid; place-items: center; min-height: 450px; margin-top: 32px; padding: 55px; border-radius: 10px; background: var(--paper); box-shadow: 7px 8px 0 var(--sky); }
.activity-card::before { position: absolute; top: -12px; left: 46%; width: 85px; height: 25px; background: #d8c69f9c; transform: rotate(4deg); content: ''; }
.corner-note, .page-number { position: absolute; color: var(--cocoa); font-size: 12px; font-weight: 800; }
.corner-note { top: 24px; left: 29px; }.page-number { right: 29px; bottom: 24px; }
.activity-content { width: min(100%, 650px); padding: 38px 30px; border-radius: 8px; background: var(--accent-soft); box-shadow: 8px 8px 0 var(--sun); text-align: center; }
.work-mark { display: block; color: var(--accent); font-size: 57px; font-weight: 900; line-height: 1; }
h2 { margin: 15px 0 20px; font-family: var(--heading-font); font-size: clamp(34px, 5vw, 48px); font-weight: 900; }
p { max-width: 540px; margin: 0; color: var(--muted); font-size: 14px; line-height: 1.8; }
@media (max-width: 640px) { .activity-page { padding-top: 45px; } .activity-card { min-height: 360px; padding: 45px 18px; } .activity-content { padding: 30px 18px; } }
</style>
