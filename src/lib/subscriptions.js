import { ref, watch } from 'vue'
import { visitor, loadVisitor } from './auth'

export const subscriptionState = ref(null)
export const subscriptionsBusy = ref(false)
export const subscriptionNotice = ref('')
let request
let noticeTimer
let revision = 0

export function showSubscriptionNotice(message) {
  clearTimeout(noticeTimer)
  subscriptionNotice.value = message
  noticeTimer = setTimeout(() => { subscriptionNotice.value = '' }, 2000)
}
async function api(body) {
  let response
  try {
    response = await fetch('/api/subscriptions', { credentials: 'same-origin', cache: 'no-store', ...(body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    } : {}) })
  } catch { throw new Error('暂时连接不到网站，请稍后再试') }
  const result = await response.json().catch(() => ({ message: '订阅服务暂时不可用' }))
  if (!response.ok || !result.success) {
    const error = new Error(result.message || '订阅操作失败，请稍后再试')
    error.status = response.status
    throw error
  }
  return result
}
export async function loadSubscriptions(force = false) {
  if (!visitor.value) return null
  if (request?.revision === revision) return request.promise
  if (subscriptionState.value && !force) return subscriptionState.value
  const currentRevision = revision
  const task = (async () => {
    try {
      const result = await api()
      if (revision === currentRevision) subscriptionState.value = result.data
      return result.data
    } finally { if (request?.promise === task) request = null }
  })()
  request = { revision: currentRevision, promise: task }
  return task
}
export function isSubscribed(scope, targetId) {
  const state = subscriptionState.value
  if (!state || !visitor.value) return false
  if (scope === 'resource-all') return state.resourceAll
  if (scope === 'resource-type') return Boolean(state.resourceTypes[targetId])
  if (scope === 'collection') return Boolean(state.collections[targetId])
  return Boolean(state.moments[{ 'moment-all': 'all', 'moment-short': 'short', 'moment-article': 'article' }[scope]])
}
export async function toggleSubscription(scope, targetId) {
  if (subscriptionsBusy.value) return
  subscriptionsBusy.value = true
  try {
    const user = await loadVisitor(true)
    if (!user) { showSubscriptionNotice('登录/注册后即可使用订阅服务'); return }
    await loadSubscriptions(true)
    if (visitor.value?.id !== user.id) return
    const currentRevision = revision
    const result = await api({ scope, targetId, enabled: !isSubscribed(scope, targetId) })
    if (revision === currentRevision) subscriptionState.value = result.data
    showSubscriptionNotice(result.message)
  } catch (cause) {
    if (cause.status === 401) { await loadVisitor(true); showSubscriptionNotice('登录/注册后即可使用订阅服务') }
    else showSubscriptionNotice(cause.message)
  } finally { subscriptionsBusy.value = false }
}
export async function saveSubscriptionChanges(changes) {
  if (subscriptionsBusy.value) return false
  const expectedUserId = visitor.value?.id
  subscriptionsBusy.value = true
  try {
    const user = await loadVisitor(true)
    if (!user) { showSubscriptionNotice('登录/注册后即可使用订阅服务'); return false }
    if (user.id !== expectedUserId) return false
    const currentRevision = revision
    const result = await api({ changes })
    if (revision !== currentRevision) return false
    subscriptionState.value = result.data
    showSubscriptionNotice(result.message)
    return true
  } catch (cause) {
    if (cause.status === 401) { await loadVisitor(true); showSubscriptionNotice('登录/注册后即可使用订阅服务') }
    else showSubscriptionNotice(cause.message)
    return false
  } finally { subscriptionsBusy.value = false }
}
watch(() => visitor.value?.id, () => {
  revision++
  subscriptionState.value = null
  if (visitor.value) loadSubscriptions(true).catch(() => {})
}, { immediate: true })
window.addEventListener('focus', () => { if (visitor.value) loadSubscriptions(true).catch(() => {}) })
