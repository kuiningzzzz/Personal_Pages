<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ThemeToggle from './ThemeToggle.vue'
import { visitor, loadVisitor } from '../lib/auth'
import { music, loadStation } from '../lib/music'
import { navigationPath, readingNavigation } from '../lib/navigation'

const name = computed(() => music.profile?.name || '个人主页')
const open = ref(false)
const navMedia = window.matchMedia('(max-width: 720px)')
const mobileNav = ref(navMedia.matches)
const navMediaChanged = event => { mobileNav.value = event.matches }
const route = useRoute()
const nav = ref(null)
const links = [{ path: '/', label: '首页' }, { path: '/moments', label: '动态' }, { path: '/resource', label: '资源库' }, { path: '/activities', label: '活动' }]
const pendingSection = ref(null)
const activePath = computed(() => navigationPath(route.path, readingNavigation.value) || (route.path.startsWith('/entry/') ? pendingSection.value : null))
const activeIndex = computed(() => links.findIndex(item => item.path === activePath.value))
const slider = ref({ transform: 'translateX(0)', width: '0px', opacity: 0 })
const slide = ref(false)
let resizeObserver
function moveSlider() {
  const target = nav.value?.querySelectorAll('a')[activeIndex.value]
  if (!target) { slider.value = { ...slider.value, opacity: 0 }; return }
  slider.value = { transform: `translate3d(${target.offsetLeft}px, 0, 0)`, width: `${target.offsetWidth}px`, opacity: 1 }
}
watch(() => route.path, (_next, previous) => {
  pendingSection.value = navigationPath(previous || '', readingNavigation.value)
}, { flush: 'sync' })
watch([() => route.path, activeIndex], async ([, nextIndex], [, previousIndex]) => {
  slide.value = nextIndex >= 0 && previousIndex >= 0
  await nextTick(); moveSlider()
})
watch(open, async () => { await nextTick(); moveSlider() })
useRouter().afterEach(() => { open.value = false })
watch([name, () => route.path, activePath], () => {
  const label = activePath.value === '/moments' ? '动态'
    : activePath.value === '/resource' ? '资源库'
      : activePath.value === '/activities' ? '活动'
        : route.path.startsWith('/admin') ? '内容管理'
          : route.path === '/register' ? '注册' : route.path === '/login' ? '登录' : route.path === '/reset-password' ? '重设密码' : route.path === '/account' ? '我的账号' : ''
  document.title = label ? `${label} · ${name.value}` : name.value
}, { immediate: true })
onMounted(async () => {
  navMedia.addEventListener('change', navMediaChanged)
  loadVisitor()
  loadStation().catch(() => {})
  resizeObserver = new ResizeObserver(moveSlider)
  if (nav.value) resizeObserver.observe(nav.value)
  moveSlider()
})
onUnmounted(() => { resizeObserver?.disconnect(); navMedia.removeEventListener('change', navMediaChanged) })
</script>

<template>
  <header class="site-header">
    <div class="page-shell header-inner">
      <div class="brand-controls"><div class="brand-cluster"><span class="dock-slot" :class="{ reserved: music.surface === 'dock' }"><span data-player-dock></span></span><router-link class="brand" to="/"><span>{{ name }}</span></router-link></div><ThemeToggle /></div>
      <div class="header-actions">
      <button class="menu-button" type="button" :aria-expanded="open" aria-controls="main-navigation" @click="open = !open">
        {{ open ? '收起' : '目录' }}<span aria-hidden="true">{{ open ? '−' : '+' }}</span>
      </button>
      <Teleport to="body" :disabled="!mobileNav"><nav id="main-navigation" ref="nav" :class="{ open }" aria-label="主导航">
        <span class="nav-selector" :class="{ sliding: slide }" :style="slider" aria-hidden="true"></span>
        <router-link v-for="link in links" :key="link.path" :to="link.path" :class="{ 'section-active': activePath === link.path }" :aria-current="activePath === link.path ? 'page' : undefined">{{ link.label }}</router-link>
      </nav></Teleport>
      <div class="visitor-entry"><router-link v-if="visitor" class="user-tag" to="/account" :title="visitor.username" :aria-label="`${visitor.username}的账号`"><span>{{ visitor.username }}</span></router-link><router-link v-else class="user-tag" :to="{ path: '/login', query: { redirect: route.fullPath } }">登录/注册</router-link></div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header { position: sticky; top: 0; z-index: 80; background: var(--paper); }
/* Extend the same paper above the moving header during elastic scrolling. */
.site-header::before { content: ''; position: absolute; right: 0; bottom: 100%; left: 0; height: 100vh; height: 100dvh; background: var(--paper); pointer-events: none; }
.header-inner { min-height: 78px; display: flex; align-items: stretch; justify-content: space-between; gap: 22px; perspective: 900px; }
.brand-controls { display: flex; align-items: center; gap: 16px; min-width: 0; flex: 1; }
.brand-cluster { display: flex; align-items: center; min-width: 0; }
.dock-slot { position: relative; flex: none; width: 0; height: 44px; margin-right: 0; transition: width .9s cubic-bezier(.22,.75,.14,1), margin-right .9s cubic-bezier(.22,.75,.14,1); }
.dock-slot.reserved { width: 44px; margin-right: 12px; }
.dock-slot > span { position: absolute; top: 1px; left: 0; width: 42px; height: 42px; pointer-events: none; }
.header-actions { display: flex; align-items: stretch; gap: 18px; flex: none; margin-left: auto; }
.visitor-entry { display: flex; align-items: center; }
.user-tag { display: inline-flex; align-items: center; max-width: 160px; min-height: 36px; padding: 7px 12px; border-radius: 4px; background: var(--accent-soft); color: var(--ink); box-shadow: 3px 3px 0 var(--sun); text-decoration: none; font-size: 13px; font-weight: 800; transition: transform .2s ease, box-shadow .2s ease; }
.user-tag span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.user-tag:hover { transform: translate(-1px, -2px); box-shadow: 4px 5px 0 var(--sun); }
.brand { display: inline-flex; align-items: center; gap: 12px; min-width: 0; overflow: hidden; color: var(--ink); font-family: var(--heading-font); font-size: 20px; font-weight: 900; letter-spacing: -.055em; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.brand::before { flex: none; width: 11px; height: 29px; border-radius: 3px; background: var(--sun); box-shadow: 3px 3px 0 var(--accent-soft); content: ''; }
.brand span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
nav { display: flex; position: relative; align-items: stretch; gap: 0; }
nav a { display: inline-flex; align-items: center; position: relative; z-index: 1; padding: 0 20px; color: var(--ink); font-size: 14px; font-weight: 800; text-decoration: none; }
nav a:hover { color: var(--cocoa); }
.nav-selector { position: absolute; top: 10px; bottom: 10px; left: 0; border-radius: 4px; background: var(--accent-soft); pointer-events: none; }
.nav-selector.sliding { transition: transform .5s cubic-bezier(.22,.75,.14,1), width .5s cubic-bezier(.22,.75,.14,1), opacity .2s ease; }
.nav-selector::after { position: absolute; right: 14px; bottom: 7px; left: 14px; height: 3px; border-radius: 2px; background: var(--accent); content: ''; }
.menu-button { display: none; flex: none; align-self: center; gap: 7px; align-items: center; border: 0; border-radius: 5px; padding: 7px 11px; background: var(--button-bg); color: var(--button-ink); font-size: 13px; font-weight: 800; box-shadow: 4px 4px 0 var(--denim); }
.menu-button span { color: var(--button-ink); font-size: 17px; line-height: 1; }
@media (max-width: 720px) {
  .header-inner { min-height: 64px; align-items: center; gap: 10px; }
  .header-actions { gap: 8px; align-items: center; }
  .user-tag { max-width: 96px; padding-inline: 9px; font-size: 12px; }
  .brand-controls { gap: 12px; }
  .dock-slot.reserved { width: 34px; margin-right: 7px; }
  .dock-slot > span { top: 6px; width: 32px; height: 32px; }
  .brand { font-size: 18px; }
  .brand::before { width: 9px; height: 25px; }
  .menu-button { display: inline-flex; }
  nav { display: none; position: fixed; top: 64px; left: 0; right: 0; z-index: 100; padding: 12px 16px; background: var(--paper); box-shadow: 0 7px 0 var(--paper-deep); }
  nav.open { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  nav a { min-height: 43px; padding: 0 14px; border-radius: 5px; background: var(--page-bg); }
  nav a.section-active { background: var(--accent-soft); }
  .nav-selector { display: none; }
}
@media (prefers-reduced-motion: reduce) { .dock-slot, .nav-selector.sliding { transition: none; } }
</style>
