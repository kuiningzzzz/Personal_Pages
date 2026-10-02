import { ref } from 'vue'

export const visitor = ref(null)
export const sessionReady = ref(false)
let sessionRequest
let revision = 0

export async function authRequest(path, body) {
  let response
  try {
    response = await fetch(`/api/auth${path}`, body === undefined ? { credentials: 'same-origin', cache: 'no-store' } : {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
  } catch { throw new Error('暂时连接不到网站，请稍后再试') }
  const result = await response.json().catch(() => ({ message: '服务暂时不可用，请稍后再试' }))
  if (!response.ok || !result.success) {
    const error = new Error(result.message || '请求失败，请稍后再试')
    error.status = response.status
    error.retryAt = result.retryAt
    error.serverNow = result.serverNow
    throw error
  }
  return result
}

export async function loadVisitor(force = false) {
  if (sessionRequest) return sessionRequest
  if (sessionReady.value && !force) return visitor.value
  const currentRevision = revision
  sessionRequest = (async () => {
    try {
      const result = await authRequest('/session')
      if (revision === currentRevision) visitor.value = result.user
    } catch {
      if (revision === currentRevision) visitor.value = null
    } finally {
      sessionReady.value = true
      sessionRequest = null
    }
    return visitor.value
  })()
  return sessionRequest
}

export async function authenticate(path, fields) {
  const result = await authRequest(path, fields)
  revision++
  visitor.value = result.user
  sessionReady.value = true
  return result.user
}

export async function logoutVisitor() {
  await authRequest('/logout', {})
  revision++
  visitor.value = null
  sessionReady.value = true
}

// Cookies are shared by tabs. Refresh the label after returning to this tab,
// including when another tab has logged out or the session has expired.
window.addEventListener('focus', () => { if (sessionReady.value) loadVisitor(true) })
