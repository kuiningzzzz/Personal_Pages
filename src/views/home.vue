<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownContent from '../components/MarkdownContent.vue'
import PlayerControls from '../components/PlayerControls.vue'
import HomeAnnouncements from '../components/HomeAnnouncements.vue'
import PlayerIcon from '../components/PlayerIcon.vue'
import { music, loadStation, enterHome } from '../lib/music'
import { prepareReveal, revealDuration } from '../lib/theme-animation'
import { entryPath, resourceLabel } from '../lib/resources'

const error = ref(''), feedError = ref('')
const route = useRoute()
const media = window.matchMedia('(max-width: 720px)')
const mobile = ref(media.matches)
const screenChanged = event => { mobile.value = event.matches }
const moments = ref([]), resources = ref([])
const section = ref(0), heading = ref(null), homeScroll = ref(null), mobileIntro = ref(false)
const revealStyle = ref({}), revealing = ref(false)
const welcomeVisible = computed(() => !music.entered || music.entering)
const titles = ['关于我', '最新动态', '最新资源']
const items = computed(() => section.value === 0 ? music.cards : section.value === 1 ? moments.value : resources.value)
let revealTimer, revealFrame
watch(welcomeVisible, active => document.documentElement.classList.toggle('home-welcome-active', active), { immediate: true })
async function reveal() {
  music.entering = true
  const record = document.querySelector('.global-record')
  if (record) {
    const geometry = prepareReveal(record)
    revealStyle.value = { '--theme-disc-size': `${geometry.radius * 2}px`, '--theme-disc-left': `${geometry.x - geometry.radius}px`, '--theme-disc-top': `${geometry.y - geometry.radius}px` }
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  mobileIntro.value = media.matches
  await nextTick()
  revealFrame = requestAnimationFrame(() => { revealing.value = true })
  if (mobileIntro.value) {
    const workspace = homeScroll.value?.querySelector('.home-workspace')
    if (workspace) window.scrollTo({ top: workspace.getBoundingClientRect().top + window.scrollY - 64, behavior: reduced ? 'instant' : 'smooth' })
  }
  revealTimer = setTimeout(async () => {
    music.entering = false; revealing.value = false; mobileIntro.value = false; await nextTick()
    if (media.matches) window.scrollTo({ top: 0, behavior: 'instant' })
  }, reduced ? 0 : revealDuration + 40)
}
function changeSection(direction) {
  section.value = (section.value + direction + titles.length) % titles.length
  const coveredHeight = media.matches ? 64 + (window.innerHeight - 64) / 3 + 17 : 98
  if (heading.value?.getBoundingClientRect().top < coveredHeight) heading.value.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
}
const link = row => row.kind === 'moment' && row.format === 'short' ? { path: '/moments', query: { post: row.id } } : entryPath(row)
const snippet = row => String(row.summary || row.body || '').slice(0, 160)
const date = value => new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
onMounted(async () => {
  media.addEventListener('change', screenChanged)
  window.addEventListener('home-player-open', reveal)
  try {
    await loadStation(); await nextTick()
    const anchor = document.querySelector('.welcome-layout [data-player-home]')
    if (anchor && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) prepareReveal(anchor)
  } catch (cause) { error.value = cause.message || '首页加载失败' }
  try {
    const results = await Promise.all(['moment', 'resource'].map(kind => fetch('/api/content/entries?kind=' + kind + '&sort=latest&limit=4').then(r => r.json())))
    if (results.some(result => !result.success)) throw new Error('最新内容加载失败')
    moments.value = results[0].data; resources.value = results[1].data
  } catch (cause) { feedError.value = cause.message || '最新内容加载失败' }
})
onUnmounted(() => { window.removeEventListener('home-player-open', reveal); media.removeEventListener('change', screenChanged); clearTimeout(revealTimer); cancelAnimationFrame(revealFrame); music.entering = false; document.documentElement.classList.remove('home-welcome-active') })
</script>

<template>
  <div ref="homeScroll" class="home-page" :class="{ 'home-entered': music.entered, 'home-revealing': music.entering }">
  <Teleport to="body">
    <div v-if="welcomeVisible" class="welcome-screen" :class="{ 'welcome-leaving': music.entered }" :style="revealStyle">
      <div class="welcome-background" aria-hidden="true"><div v-if="revealing" class="welcome-reveal-disc"></div></div>
      <section v-if="music.profile" class="welcome-layout" aria-label="欢迎来到我的网站">
        <div class="welcome-record record-anchor" :data-player-home="!music.entered ? '' : undefined"></div>
        <div class="welcome-copy"><p v-for="(line, index) in music.welcome" :key="index" :style="{ '--welcome-delay': (180 + index * 240) + 'ms' }">{{ line }}</p>
          <div class="welcome-actions"><button type="button" class="welcome-enter" :disabled="music.entered" @click="enterHome()"><span>进入网站</span><PlayerIcon name="play" /></button><button type="button" class="welcome-enter" :disabled="music.entered" @click="enterHome({ silent: true })"><span>静音访问</span><PlayerIcon name="volume-muted" /></button></div>
        </div>
      </section>
      <p v-else class="welcome-status" role="status">{{ error || '加载中…' }}</p>
    </div>
  </Teleport>
    <div v-if="error" class="page-shell surface state">{{ error }}</div>
    <div v-else-if="!music.profile" class="page-shell surface state">加载中…</div>
    <template v-else>
      <section v-if="!music.entered || mobileIntro" class="record-welcome" aria-hidden="true"></section>
      <div v-if="music.entered" class="page-shell home-workspace">
        <Teleport to="body" :disabled="!mobile"><aside class="turntable" :inert="music.entering" :class="{ 'turntable-leaving': route.path !== '/', 'reveal-pending': music.entering }"><div data-player-home class="record-anchor"></div><PlayerControls /></aside></Teleport>
        <section class="content-stage" :inert="music.entering" aria-label="首页内容">
          <header ref="heading" class="station-intro"><h1>{{ music.profile.name }}</h1><p>{{ music.profile.description }}</p></header>
          <button type="button" class="section-skip skip-up" :aria-label="'切换到' + titles[(section + 2) % 3]" @click="changeSection(-1)"><PlayerIcon name="up" /><span>{{ titles[(section + 2) % 3] }}</span></button>
          <div class="section-title"><h2>{{ titles[section] }}</h2><span aria-hidden="true">{{ String(section + 1).padStart(2, '0') }} / 03</span></div>
          <div class="home-content-viewport" aria-live="polite">
            <Transition name="home-track" mode="out-in">
              <div :key="section" class="home-cards">
                <div v-if="section !== 0 && feedError" class="home-card state">{{ feedError }}</div>
                <div v-else-if="!items.length" class="home-card state">{{ section === 0 ? '还没有介绍卡片' : '这里还没有内容' }}</div>
                <template v-else>
                  <article v-for="(item, index) in items" :key="item.id" class="home-card" :style="{ '--card-delay': Math.min(index, 9) * 85 + 'ms' }">
                    <header><span class="card-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span><h3 v-if="section === 0">{{ item.title }}</h3><router-link v-else :to="link(item)">{{ item.title || '无标题短帖' }}<span aria-hidden="true">↗</span></router-link></header>
                    <MarkdownContent v-if="section === 0" :source="item.content" />
                    <template v-else><p v-if="snippet(item)" class="card-excerpt">{{ snippet(item) }}</p><footer><span>{{ section === 2 ? resourceLabel(item) : item.format === 'short' ? '短帖' : '长文' }}</span><span v-for="tag in item.tags.slice(0, 2)" :key="tag">#{{ tag }}</span><time :datetime="item.published_at">{{ date(item.published_at) }}</time></footer></template>
                  </article>
                </template>
              </div>
            </Transition>
          </div>
          <button type="button" class="section-skip skip-down" :aria-label="'切换到' + titles[(section + 1) % 3]" @click="changeSection(1)"><span>{{ titles[(section + 1) % 3] }}</span><PlayerIcon name="down" /></button>
          <HomeAnnouncements />
        </section>
      </div>
    </template>
  </div>
</template>
<style scoped src="../styles/home.css"></style>
