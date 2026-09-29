<script setup>
import { ref, onMounted } from 'vue'

const name = ref('')
const icpNumber = ref('')
onMounted(async () => {
  try {
    const [profile, settings] = await Promise.all([
      fetch('/api/content/profile').then(response => response.json()),
      fetch('/api/content/settings').then(response => response.json())
    ])
    name.value = profile.data.profile.name
    icpNumber.value = settings.data.icpNumber
  } catch { /* footer remains usable */ }
})
</script>

<template>
  <footer class="site-footer">
    <div class="page-shell footer-inner">
      <span>© {{ new Date().getFullYear() }} {{ name }}</span>
      <div class="footer-links">
        <a v-if="icpNumber" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ icpNumber }}</a>
        <router-link to="/admin">内容管理 ↗</router-link>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { margin-top: 0; color: var(--ink); background: var(--accent-soft); font-size: 12px; font-weight: 700; }
.footer-inner { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 76px; }
.footer-links { display: flex; flex-wrap: wrap; gap: 22px; }
a { color: var(--ink); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { color: var(--cocoa); }
@media (max-width: 600px) { .footer-inner { align-items: flex-start; flex-direction: column; justify-content: center; gap: 10px; padding-block: 18px; } }
</style>
