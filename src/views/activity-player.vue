<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { activityRequest, activityJson, activityGuest, activityUuid, safeRuntime, backendPath } from '../lib/activities'
import { theme } from '../lib/theme'
import { pauseForActivity } from '../lib/music'
const route = useRoute(), router = useRouter()
const frame = ref(null), activity = ref(null), loaded = ref(false), error = ref(''), preview = route.query.preview === '1'
let channel, poll, loadTimer, restoreMusic, disposed = false, pendingCalls = 0
const sockets = new Map()
function closeSockets() { for (const socket of sockets.values()) socket.close(); sockets.clear() }
async function request(path, options = {}) {
  const ticket = activity.value.runtime.ticket
  return activityRequest(`/${activity.value.id}${path}`, { ...options, headers: { ...options.headers, 'X-Activity-Ticket': ticket } })
}
async function start() {
  error.value = ''; loaded.value = false
  try {
    const response = await activityRequest(`${preview ? '/items' : ''}/${route.params.id}/launch`, activityJson('POST', { guestId: activityGuest(), versionId: route.query.version }), preview)
    if (disposed) return
    activity.value = response.data
    if (response.data.pause_music && !restoreMusic) restoreMusic = pauseForActivity()
    loadTimer = setTimeout(() => { if (!loaded.value) error.value = '活动加载时间较长，外部网站也可能禁止嵌入。可以重试。' }, 30000)
    poll = setInterval(refreshRuntime, 15000)
  } catch (cause) { if (!disposed) error.value = cause.message }
}
async function refreshRuntime() {
  try {
    const { data } = await request('/runtime')
    if (disposed || !activity.value) return
    const old = safeRuntime(activity.value.runtime)
    activity.value.runtime = { ...data, ticket: activity.value.runtime.ticket }
    const updated = safeRuntime(activity.value.runtime)
    if (JSON.stringify(old) !== JSON.stringify(updated)) channel?.port1.postMessage({ event: 'runtime', data: updated })
  } catch (cause) { if (!disposed) { error.value = cause.message; clearInterval(poll); closeSockets(); channel?.port1.postMessage({ event: 'unavailable', data: cause.message }) } }
}
async function dispatch(method, args) {
  const encode = value => encodeURIComponent(String(value))
  if (method === 'user') return (await request('/user')).data
  if (method === 'login') { router.push({ path: '/login', query: { redirect: route.fullPath } }); return true }
  if (method === 'storage.get') return (await request(`/storage/${encode(args.key)}`)).data
  if (method === 'storage.set') { await request(`/storage/${encode(args.key)}`, activityJson('PUT', { value: args.value })); return true }
  if (method === 'storage.remove') { await request(`/storage/${encode(args.key)}`, { method: 'DELETE' }); return true }
  if (method === 'file.upload') {
    if (!(args.file instanceof Blob) || args.file.size > 10 * 1024 ** 2) throw new Error('文件最多 10MB')
    const data = new FormData(); data.append('file', args.file, args.file.name || 'file'); return (await request('/files', { method: 'POST', body: data })).data
  }
  if (method === 'file.read') {
    const response = await fetch(`/api/plaza/${activity.value.id}/files/${encode(args.id)}`, { headers: { 'X-Activity-Ticket': activity.value.runtime.ticket }, credentials: 'same-origin' })
    if (!response.ok) throw new Error('无法读取活动文件'); return response.arrayBuffer()
  }
  if (method === 'file.remove') { await request(`/files/${encode(args.id)}`, { method: 'DELETE' }); return true }
  if (method === 'socket.open') {
    if (!activity.value.runtime.backendBaseUrl || sockets.size >= 8) throw new Error('无法再建立活动连接')
    const path = backendPath(args.path), url = new URL(activity.value.runtime.backendBaseUrl + path)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', activity.value.runtime.ticket)
    const id = activityUuid(), socket = new WebSocket(url, args.protocols); socket.binaryType = 'arraybuffer'; sockets.set(id, socket)
    socket.onmessage = ({ data }) => channel?.port1.postMessage({ event: `socket:${id}:message`, data })
    socket.onclose = ({ code, reason }) => { sockets.delete(id); channel?.port1.postMessage({ event: `socket:${id}:close`, data: { code, reason } }) }
    socket.onerror = () => channel?.port1.postMessage({ event: `socket:${id}:error`, data: '连接失败' })
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('无法连接活动后端')), { once: true }); socket.addEventListener('close', () => reject(new Error('活动连接已关闭')), { once: true }) })
    return { id }
  }
  if (method === 'socket.send') { const socket = sockets.get(args.id); if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('活动连接已关闭'); if (typeof args.data !== 'string' && !(args.data instanceof ArrayBuffer)) throw new Error('消息仅支持文本或 ArrayBuffer'); if ((typeof args.data === 'string' ? new Blob([args.data]).size : args.data.byteLength) > 1024 ** 2) throw new Error('单条消息最多 1MB'); socket.send(args.data); return true }
  if (method === 'socket.close') { sockets.get(args.id)?.close(); return true }
  if (method === 'backend') {
    if (!activity.value.runtime.backendBaseUrl) throw new Error('此活动未配置后端')
    const path = backendPath(args.path), options = args.options || {}, headers = new Headers(options.headers || {})
    for (const name of [...headers.keys()]) if (!['content-type', 'accept'].includes(name)) headers.delete(name)
    headers.set('X-Activity-Ticket', activity.value.runtime.ticket)
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(String(options.method).toUpperCase())) throw new Error('请求方法无效')
    const send = () => fetch(activity.value.runtime.backendBaseUrl + path, { method: options.method, headers, body: options.body, credentials: 'same-origin' })
    let response = await send()
    if (response.status === 409) { await refreshRuntime(); response = await send() }
    const chunks = []; let total = 0
    if (response.body) { const reader = response.body.getReader(); while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > 20 * 1024 ** 2) { await reader.cancel(); throw new Error('SDK 后端响应最多 20MB') } chunks.push(part.value) } }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers), body: [204, 205, 304].includes(response.status) || options.method === 'HEAD' ? null : bytes.buffer }
  }
  throw new Error('SDK 方法不存在')
}
function connect(event) {
  if (event.source !== frame.value?.contentWindow || event.data?.type !== 'PP_ACTIVITY_READY' || !activity.value) return
  closeSockets(); channel?.port1.close(); channel?.port2.close()
  channel = new MessageChannel()
  const reply = channel.port1
  channel.port1.onmessage = async ({ data }) => {
    if (!Number.isSafeInteger(data?.id) || !data.method) return
    if (pendingCalls >= 20) { channel?.port1.postMessage({ id: data.id, error: '请求过于频繁' }); return }
    pendingCalls++
    try { const result = await dispatch(data.method, data.args || {}); if (!disposed) reply.postMessage({ id: data.id, data: result }) }
    catch (cause) { if (!disposed) reply.postMessage({ id: data.id, error: cause.message }) }
    finally { pendingCalls-- }
  }
  channel.port1.start()
  frame.value.contentWindow.postMessage({ type: 'PP_ACTIVITY_CONNECT', runtime: safeRuntime(activity.value.runtime), theme: theme.value }, '*', [channel.port2])
}
function frameLoaded() { loaded.value = true; clearTimeout(loadTimer) }
function retry() { closeSockets(); channel?.port1.close(); channel?.port2.close(); channel = null; clearInterval(poll); clearTimeout(loadTimer); activity.value = null; start() }
watch(theme, value => channel?.port1.postMessage({ event: 'theme', data: value }))
onMounted(() => { window.addEventListener('message', connect); start() })
onUnmounted(() => { disposed = true; window.removeEventListener('message', connect); closeSockets(); channel?.port1.close(); channel?.port2.close(); clearInterval(poll); clearTimeout(loadTimer); restoreMusic?.() })
</script>
<template>
  <div class="page-shell player-page">
    <nav class="player-trail"><RouterLink :to="preview ? '/admin?tab=plaza' : '/activities'">{{ preview ? '返回发布管理' : '广场' }}</RouterLink><RouterLink v-for="entry in activity?.ancestors || []" :key="entry.id" :to="`/activities/collection/${entry.id}`">/ {{ entry.title }}</RouterLink></nav>
    <header class="player-title"><h1>{{ activity?.title || '打开活动' }}</h1><span v-if="preview" class="preview-label">管理预览</span></header>
    <div v-if="error" class="surface player-error" role="alert">{{ error }}<button class="ghost-button" @click="retry">重试</button><RouterLink v-if="!preview" :to="{ path: '/login', query: { redirect: route.fullPath } }">登录 / 注册</RouterLink></div>
    <div v-else class="player-stage" :class="{ loading: !loaded }">
      <div v-if="!loaded" class="player-loader" role="status"><span class="loading-disc" aria-hidden="true"></span><p>正在载入活动…</p></div>
      <iframe v-if="activity" ref="frame" :src="activity.url" :title="activity.title" sandbox="allow-scripts allow-forms allow-downloads allow-pointer-lock" allow="fullscreen; autoplay; gamepad" referrerpolicy="no-referrer" @load="frameLoaded" @error="error = '活动加载失败，请重试'" />
    </div>
  </div>
</template>
<style scoped>
.player-page { padding-block: 25px 45px; width: min(1440px, calc(100% - 48px)); }.player-trail { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; color: var(--accent); }.player-title { display: flex; align-items: center; gap: 18px; margin-block: 18px 24px; }.player-title h1 { font-size: 28px; margin: 0; }.preview-label { background: var(--sun); color: var(--ink); border-radius: 3px; padding: 4px 9px; font-size: 12px; }.player-stage { position: relative; height: max(560px, calc(100dvh - 240px)); border-radius: 8px; background: var(--paper); box-shadow: 6px 7px 0 var(--home-stack); overflow: hidden; }iframe { display: block; border: 0; width: 100%; height: 100%; }.loading iframe { visibility: hidden; }.player-loader { position: absolute; inset: 0; display: grid; align-content: center; justify-items: center; gap: 20px; color: var(--muted); }.loading-disc { width: 40px; height: 40px; border-radius: 5px; background: var(--accent-soft); box-shadow: 3px 4px 0 var(--home-stack); animation: loading .9s linear infinite; }.loading-disc::after { content: ''; display: block; margin: 8px; width: 24px; height: 24px; border-radius: 3px; background: var(--accent); }.player-error { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 30px; }
@keyframes loading { to { transform: rotate(360deg); } }
@media(max-width:640px) { .player-page { width: calc(100% - 24px); }.player-stage { height: calc(100dvh - 220px); min-height: 420px; }.player-title h1 { font-size: 23px; } }
@media(prefers-reduced-motion: reduce) { .loading-disc { animation: none; } }
</style>
