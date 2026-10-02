<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { visitor, logoutVisitor, authenticate } from '../lib/auth'
const router = useRouter()
const busy = ref(false)
const error = ref('')
const settingsBusy = ref(false)
const settingsMessage = ref('')
async function setReplyNotifications(event) {
  const enabled = event.target.checked
  settingsBusy.value = true; settingsMessage.value = ''; error.value = ''
  try {
    await authenticate('/settings', { replyNotifications: enabled })
    settingsMessage.value = enabled ? '已开启回复提醒邮件' : '已关闭回复提醒邮件'
  } catch (cause) { event.target.checked = visitor.value?.replyNotifications !== false; error.value = cause.message }
  finally { settingsBusy.value = false }
}
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
      <p class="account-note">评论中仅显示脱敏邮箱，完整地址只对你本人和站点管理员可见。可以在动态或资源库中订阅新内容、参与评论，广场活动将在后续更新中开放。</p>
      <section class="account-settings" aria-labelledby="account-settings-title"><h2 id="account-settings-title">账号设置</h2><label class="setting-toggle"><span><strong>接收回复提醒邮件</strong><small>有人回复你的评论时，发送邮件提醒。</small></span><input type="checkbox" :checked="visitor.replyNotifications !== false" :disabled="settingsBusy || busy" @change="setReplyNotifications" /></label><p v-if="settingsMessage" class="settings-message" role="status">{{ settingsMessage }}</p></section>
      <div class="account-actions"><router-link class="primary-button" to="/moments">去看看动态 ↗</router-link><button class="ghost-button" :disabled="busy" @click="logout">{{ busy ? '退出中…' : '退出登录' }}</button></div>
    </section>
  </div>
</template>
<style scoped src="../styles/auth.css"></style>
