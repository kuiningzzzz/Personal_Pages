<script setup>
import { ref, onMounted } from 'vue'
import MarkdownContent from '../components/MarkdownContent.vue'

const data = ref(null)
const error = ref('')
onMounted(async () => {
  try {
    const response = await fetch('/api/content/profile')
    const result = await response.json()
    if (!result.success) throw new Error(result.message)
    data.value = result.data
  } catch (cause) { error.value = cause.message || '加载失败' }
})
const number = index => String(index + 1).padStart(2, '0')
</script>

<template>
  <div class="home-page">
    <div v-if="error" class="page-shell surface state">{{ error }}</div>
    <div v-else-if="!data" class="page-shell surface state">加载中…</div>
    <template v-else>
      <div class="page-shell home-top"><section class="intro">
        <div class="intro-copy">
          <span class="eyebrow">你好，很高兴见到你</span>
          <h1><span>{{ data.profile.name }}</span></h1>
          <p>{{ data.profile.description }}</p>
          <div class="intro-actions"><router-link class="intro-link" to="/moments">看我的动态 <span aria-hidden="true">↗</span></router-link><router-link class="intro-link secondary" to="/resource">逛逛资源库 <span aria-hidden="true">↗</span></router-link></div>
        </div>
        <figure class="portrait">
          <img :src="data.profile.avatar" :alt="`${data.profile.name}的头像`" />
        </figure>
      </section></div>
      <section class="notes-band"><div class="page-shell notes-inner">
        <div class="section-heading"><span class="eyebrow">认识我</span><h2>关于<span>我</span></h2></div>
        <div v-if="!data.cards.length" class="surface state">还没有介绍卡片</div>
        <div v-else class="home-grid">
          <article v-for="(card, index) in data.cards" :key="card.id" class="note-card">
            <header><span class="note-number">{{ number(index) }}</span><h3>{{ card.title }}</h3></header>
            <MarkdownContent :source="card.content" />
          </article>
        </div>
      </div></section>
    </template>
  </div>
</template>

<style scoped src="../styles/home.css"></style>
