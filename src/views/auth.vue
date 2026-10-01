<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authRequest, authenticate, loadVisitor } from '../lib/auth'

const route = useRoute()
const router = useRouter()
const registering = computed(() => route.path === '/register')
const resetting = computed(() => route.path === '/reset-password')
const needsCode = computed(() => registering.value || resetting.value)
const identity = ref('')
const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const code = ref('')
const emailInput = ref(null)
const visiblePassword = ref(false)
const busy = ref(false)
const sending = ref(false)
const emailEnabled = ref(null)
const notice = ref('')
const error = ref('')
const now = ref(Date.now())
const deadlines = ref({})
const emailKey = computed(() => email.value.trim().toLowerCase())
const currentDeadline = computed(() => deadlines.value[emailKey.value])
const remaining = computed(() => Math.max(0, Math.ceil(((currentDeadline.value?.resendAt || 0) - now.value) / 1000)))
const expiresIn = computed(() => Math.max(0, Math.ceil(((currentDeadline.value?.expiresAt || 0) - now.value) / 1000)))
const nextPath = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && /^\/(?![\/\\])/.test(target) && !/^\/(login|register|reset-password)(?:[/?#]|$)/.test(target) ? target : '/'
})
const modeLink = path => ({ path, query: route.query.redirect ? { redirect: route.query.redirect } : {} })
let timer
onMounted(async () => {
  timer = setInterval(() => { now.value = Date.now() }, 250)
  if (await loadVisitor() && !resetting.value) { router.replace('/account'); return }
  try { emailEnabled.value = (await authRequest('/config')).data.emailEnabled }
  catch (cause) { emailEnabled.value = false; error.value = cause.message }
})
onUnmounted(() => { clearInterval(timer) })
watch(emailKey, () => { code.value = ''; notice.value = ''; error.value = '' })
watch(() => route.path, () => {
  password.value = ''; confirmPassword.value = ''; code.value = ''
  visiblePassword.value = false; notice.value = ''; error.value = ''
  if (resetting.value && identity.value.includes('@')) email.value = identity.value.trim()
})

async function sendCode() {
  if (sending.value || remaining.value || busy.value) return
  if (!emailInput.value?.reportValidity()) return
  sending.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await authRequest('/code', { email: email.value, purpose: resetting.value ? 'password-reset' : 'register' })
    const offset = Date.now() - result.serverNow
    deadlines.value[result.email] = { resendAt: result.resendAt + offset, expiresAt: result.expiresAt + offset }
    now.value = Date.now()
    code.value = ''
    notice.value = result.message
  } catch (cause) {
    if (cause.retryAt) {
      const offset = Date.now() - (cause.serverNow || Date.now())
      deadlines.value[emailKey.value] = { ...currentDeadline.value, resendAt: cause.retryAt + offset }
      now.value = Date.now()
    }
    error.value = cause.message
  } finally { sending.value = false }
}
async function submit() {
  if (busy.value || sending.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  if (needsCode.value && [...password.value].length < 8) {
    error.value = '密码长度需为 8–128 个字符'
    busy.value = false
    return
  }
  if (resetting.value && password.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    busy.value = false
    return
  }
  try {
    await authenticate(resetting.value ? '/reset-password' : registering.value ? '/register' : '/login', resetting.value
      ? { email: email.value, password: password.value, confirmPassword: confirmPassword.value, code: code.value }
      : registering.value
      ? { username: username.value, email: email.value, password: password.value, code: code.value }
      : { identity: identity.value, password: password.value })
    password.value = ''
    confirmPassword.value = ''
    await router.replace(nextPath.value)
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false }
}
</script>

<template>
  <div class="page-shell auth-page">
    <div class="auth-heading"><span class="eyebrow">{{ resetting ? '重新回到这里' : registering ? '第一次来这里' : '又见面了' }}</span><h1 class="page-heading">{{ resetting ? '重设密码' : registering ? '注册' : '登录' }}<span>。</span></h1><p class="page-description">{{ resetting ? '用注册邮箱验证身份，设置新密码后直接登录。' : registering ? '给自己留个名字，一起慢慢认识这个小站。' : '用你的用户名或邮箱，回到自己的账号。' }}</p></div>
    <section class="auth-card surface" :aria-label="resetting ? '重设密码并登录' : registering ? '访客注册' : '访客登录'">
      <nav class="auth-tabs" aria-label="账号入口"><router-link :to="modeLink('/login')" :aria-current="!registering && !resetting ? 'page' : undefined">登录</router-link><router-link :to="modeLink('/register')" :aria-current="registering ? 'page' : undefined">注册</router-link></nav>
      <p v-if="error" class="auth-notice error" role="alert">{{ error }}</p>
      <p v-if="notice" class="auth-notice" role="status">{{ notice }}</p>
      <p v-if="needsCode && emailEnabled === false" class="auth-service-notice">邮件验证服务暂未开放，请稍后再来。已有账号可使用密码正常登录。</p>
      <p v-if="resetting" class="auth-service-notice">不需要旧密码。重设成功后，其他设备需要使用新密码重新登录。</p>
      <form @submit.prevent="submit">
        <label v-if="registering">用户名<input v-model="username" name="username" autocomplete="username" required minlength="2" maxlength="24" placeholder="2–24 个汉字、字母、数字、_ 或 -" :disabled="busy" /><small>这个名字将作为你在网站上的身份标签。</small></label>
        <label v-else-if="!resetting">用户名 / 邮箱<input v-model="identity" name="identity" autocomplete="username" required maxlength="254" placeholder="你的用户名或注册邮箱" :disabled="busy" /></label>
        <label v-if="needsCode">{{ resetting ? '注册邮箱' : '邮箱' }}<input ref="emailInput" v-model="email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="用于接收验证码" :disabled="busy || sending" /></label>
        <label>{{ resetting ? '新登录密码' : registering ? '设置登录密码' : '登录密码' }}<span class="password-field"><input v-model="password" name="password" :type="visiblePassword ? 'text' : 'password'" :autocomplete="needsCode ? 'new-password' : 'current-password'" required :minlength="needsCode ? 8 : undefined" maxlength="128" :placeholder="needsCode ? '至少 8 个字符，建议使用独立密码' : '你的登录密码'" :disabled="busy" /><button type="button" :aria-label="visiblePassword ? '隐藏密码' : '显示密码'" :aria-pressed="visiblePassword" @click="visiblePassword = !visiblePassword">{{ visiblePassword ? '隐藏' : '显示' }}</button></span></label>
        <label v-if="resetting">确认新密码<input v-model="confirmPassword" name="confirmPassword" :type="visiblePassword ? 'text' : 'password'" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="再输入一次新密码" :disabled="busy" /></label>
        <label v-if="needsCode">邮箱验证码<span class="code-field"><input v-model="code" name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" required maxlength="6" placeholder="6 位验证码" :disabled="busy || sending" /><button type="button" class="ghost-button" :disabled="busy || sending || remaining > 0 || emailEnabled !== true" @click="sendCode">{{ sending ? '发送中…' : remaining ? `${remaining}s 后重发` : '获取验证码' }}</button></span><small v-if="currentDeadline?.expiresAt">{{ expiresIn > 0 ? `本次验证码还剩 ${expiresIn} 秒有效；重发后旧码失效。` : '验证码已过期，请重新获取。' }}</small><small v-else>验证码两分钟内有效，一分钟后可重发；新码会替换旧码。</small></label>
        <div v-if="!needsCode" class="auth-help"><router-link :to="modeLink('/reset-password')">忘记密码？用邮箱验证码找回</router-link></div>
        <button class="primary-button auth-submit" :disabled="busy || sending || (needsCode && emailEnabled !== true)">{{ busy ? '请稍候…' : resetting ? '重设密码并登录' : registering ? '注册并登录' : '登录' }}<span aria-hidden="true">↗</span></button>
      </form>
    </section>
    <aside class="auth-privacy surface" aria-label="服务与隐私说明">
      <h2>登录即可享受新内容订阅、评论交互、参与广场活动等更多服务</h2>
      <p class="future-note">订阅需由你在动态或资源库中主动开启，可随时取消；注册不会自动订阅邮件。登录后可参与评论，回复提醒可在账号设置中关闭。广场活动将在后续更新中开放。</p>
      <ul>
        <li><strong>邮箱权限：</strong>你只需接收验证码，无需提供邮箱密码或授权码，也无需授权网站读取邮件、通讯录或其他邮箱内容。验证邮件通过本人的 QQ 邮箱发送。</li>
        <li><strong>个人信息：</strong>用户名用于站内身份展示；邮箱保存在服务端，用于验证、识别账号及发送你开启的提醒。评论仅显示脱敏邮箱，完整地址不会显示在公开页面；站点管理员可在处理举报时查看相关邮箱。</li>
        <li><strong>密码与登录：</strong>密码只保存加盐后的哈希，不保存明文；登录凭据放在页面脚本无法读取的 Cookie 中。线上 HTTPS 连接下仅通过加密连接传输该凭据。</li>
        <li><strong>防止滥用：</strong>验证码只能使用一次，限制错误次数及发送频率；服务端短期保留请求来源的摘要与限流计数，不在验证码日志中记录邮箱、密码或验证码。</li>
      </ul>
    </aside>
  </div>
</template>

<style scoped src="../styles/auth.css"></style>
