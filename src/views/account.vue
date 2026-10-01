<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { visitor, logoutVisitor } from '../lib/auth'
const router = useRouter()
const busy = ref(false)
const error = ref('')
const joined = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
async function logout() {
  busy.value = true
  error.value = ''
  try { await logoutVisitor(); await router.replace('/') }
  catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
</script>
<template>
  <div v-if="visitor" class="page-shell auth-page">
    <div class="auth-heading"><span class="eyebrow">我的账号</span><h1 class="page-heading">你好<span>。</span></h1><p class="page-description">{{ visitor.username }}，欢迎回来。</p></div>
    <section class="auth-card surface account-card">
      <p v-if="error" class="auth-notice error" role="alert">{{ error }}</p>
      <dl><div><dt>用户名</dt><dd>{{ visitor.username }}</dd></div><div><dt>注册邮箱</dt><dd>{{ visitor.email }}</dd></div><div><dt>加入时间</dt><dd>{{ joined(visitor.createdAt) }}</dd></div></dl>
      <p class="account-note">你的邮箱仅在这里对你本人显示。可以在动态或资源库中订阅新内容，随时取消。评论和广场活动将在后续更新中开放。</p>
      <div class="account-actions"><router-link class="primary-button" to="/moments">去看看动态 ↗</router-link><button class="ghost-button" :disabled="busy" @click="logout">{{ busy ? '退出中…' : '退出登录' }}</button></div>
    </section>
  </div>
</template>
<style scoped src="../styles/auth.css"></style>
