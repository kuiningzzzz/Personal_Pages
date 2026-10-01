<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ThemeToggle from './ThemeToggle.vue'
import { visitor, loadVisitor } from '../lib/auth'

const name = ref('个人主页')
const open = ref(false)
const route = useRoute()
useRouter().afterEach(() => { open.value = false })
watch([name, () => route.path], () => {
  const label = route.path.startsWith('/moments') ? '动态'
    : route.path.startsWith('/resource') ? '资源库'
      : route.path.startsWith('/activities') ? '活动'
        : route.path.startsWith('/admin') ? '内容管理'
          : route.path === '/register' ? '注册' : route.path === '/login' ? '登录' : route.path === '/reset-password' ? '重设密码' : route.path === '/account' ? '我的账号' : ''
  document.title = label ? `${label} · ${name.value}` : name.value
}, { immediate: true })
onMounted(async () => {
  loadVisitor()
  try {
    const response = await fetch('/api/content/profile')
    const data = await response.json()
    if (data.success) name.value = data.data.profile.name
  } catch { /* keep the navigation usable without the API */ }
})
</script>

<template>
  <header class="site-header">
    <div class="page-shell header-inner">
      <div class="brand-controls"><router-link class="brand" to="/"><span>{{ name }}</span></router-link><ThemeToggle /></div>
      <div class="header-actions">
      <button class="menu-button" type="button" :aria-expanded="open" aria-controls="main-navigation" @click="open = !open">
        {{ open ? '收起' : '目录' }}<span aria-hidden="true">{{ open ? '−' : '+' }}</span>
      </button>
      <nav id="main-navigation" :class="{ open }" aria-label="主导航">
        <router-link to="/">首页</router-link>
        <router-link to="/moments">动态</router-link>
        <router-link to="/resource">资源库</router-link>
        <router-link to="/activities">活动</router-link>
      </nav>
      <div class="visitor-entry"><router-link v-if="visitor" class="user-tag" to="/account" :title="visitor.username" :aria-label="`${visitor.username}的账号`"><span>{{ visitor.username }}</span></router-link><router-link v-else class="user-tag" :to="{ path: '/login', query: { redirect: route.fullPath } }">登录/注册</router-link></div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header { position: relative; z-index: 10; background: var(--paper); }
.header-inner { min-height: 78px; display: flex; align-items: stretch; justify-content: space-between; gap: 22px; perspective: 900px; }
.brand-controls { display: flex; align-items: center; gap: 16px; min-width: 0; flex: 1; }
.header-actions { display: flex; align-items: stretch; gap: 18px; flex: none; margin-left: auto; }
.visitor-entry { display: flex; align-items: center; }
.user-tag { display: inline-flex; align-items: center; max-width: 160px; min-height: 36px; padding: 7px 12px; border-radius: 4px; background: var(--accent-soft); color: var(--ink); box-shadow: 3px 3px 0 var(--sun); text-decoration: none; font-size: 13px; font-weight: 800; transition: transform .2s ease, box-shadow .2s ease; }
.user-tag span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.user-tag:hover { transform: translate(-1px, -2px); box-shadow: 4px 5px 0 var(--sun); }
.brand { display: inline-flex; align-items: center; gap: 12px; min-width: 0; overflow: hidden; color: var(--ink); font-family: var(--heading-font); font-size: 20px; font-weight: 900; letter-spacing: -.055em; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.brand::before { flex: none; width: 11px; height: 29px; border-radius: 3px; background: var(--sun); box-shadow: 3px 3px 0 var(--accent-soft); content: ''; }
.brand span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
nav { display: flex; align-items: stretch; gap: 0; }
nav a { display: inline-flex; align-items: center; position: relative; padding: 0 20px; color: var(--ink); font-size: 14px; font-weight: 800; text-decoration: none; transform-origin: top center; transition: transform .28s cubic-bezier(.2,.8,.2,1), background-color .2s ease; }
nav a:hover { background: var(--sky); transform: rotateX(-5deg); }
nav a.router-link-active { background: var(--accent-soft); }
nav a.router-link-active::before { position: absolute; right: 12px; bottom: 9px; left: 12px; height: 3px; border-radius: 3px; background: var(--accent); content: ''; }
.menu-button { display: none; flex: none; align-self: center; gap: 7px; align-items: center; border: 0; border-radius: 5px; padding: 7px 11px; background: var(--button-bg); color: var(--button-ink); font-size: 13px; font-weight: 800; box-shadow: 4px 4px 0 var(--denim); }
.menu-button span { color: var(--button-ink); font-size: 17px; line-height: 1; }
@media (max-width: 720px) {
  .header-inner { min-height: 64px; align-items: center; gap: 10px; }
  .header-actions { gap: 8px; align-items: center; }
  .user-tag { max-width: 96px; padding-inline: 9px; font-size: 12px; }
  .brand-controls { gap: 12px; }
  .brand { font-size: 18px; }
  .brand::before { width: 9px; height: 25px; }
  .menu-button { display: inline-flex; }
  nav { display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 20; padding: 12px 16px; background: var(--paper); box-shadow: 0 7px 0 var(--paper-deep); }
  nav.open { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  nav a { min-height: 43px; padding: 0 14px; border-radius: 5px; background: var(--page-bg); }
}
</style>
