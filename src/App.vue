<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Header from './components/header.vue'
import Footer from './components/footer.vue'
import SubscriptionToast from './components/SubscriptionToast.vue'

const route = useRoute()
const turn = ref('page-next')
const position = path => {
  if (path.startsWith('/moments')) return 1
  if (path.startsWith('/resource')) return 2
  if (path.startsWith('/activities')) return 3
  if (path.startsWith('/admin')) return 4
  if (['/login', '/register', '/reset-password', '/account'].includes(path)) return 5
  if (path.startsWith('/entry')) return 3
  return 0
}
watch(() => route.path, (next, previous) => {
  turn.value = position(next) < position(previous || '/') ? 'page-prev' : 'page-next'
})
</script>

<template>
  <Header />
  <main class="site-main">
    <router-view v-slot="{ Component, route: currentRoute }">
      <Transition :name="turn" mode="out-in">
        <component :is="Component" :key="currentRoute.fullPath" />
      </Transition>
    </router-view>
  </main>
  <Footer />
  <SubscriptionToast />
</template>

<style>
@import './styles/site.css';
</style>
