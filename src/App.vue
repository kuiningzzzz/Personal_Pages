<script setup>
import Header from './components/header.vue'
import Footer from './components/footer.vue'
</script>

<template>
  <Header />
  <router-view />
  <Footer />
</template>

<style>
/* 全局样式，不加 scoped */
body {
  margin: 10px;
  padding: 0;
  background: linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #141821 100%);
  min-height: 100vh;
}
</style>

<style scoped></style>
