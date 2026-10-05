export const activityJson = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
export async function activityRequest(path, options = {}, admin = false) {
  const response = await fetch(`/api/${admin ? 'admin/activities' : 'plaza'}${path}`, { credentials: 'same-origin', cache: 'no-store', ...options })
  const result = await response.json().catch(() => ({ message: '活动服务暂时不可用' }))
  if (!response.ok || !result.success) { const error = new Error(result.message || '操作失败'); error.status = response.status; throw error }
  return result
}
export function activityUuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export function activityGuest() {
  try { let id = localStorage.getItem('plaza-guest'); if (!/^[a-f0-9-]{36}$/.test(id || '')) { id = activityUuid(); localStorage.setItem('plaza-guest', id) } return id } catch { return activityUuid() }
}
export function safeRuntime(runtime) { const { ticket, ...rest } = runtime; return rest }
export function backendPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('后端路径必须从 / 开始')
  const url = new URL(path, 'https://activity.invalid')
  if (url.origin !== 'https://activity.invalid' || /\/(?:\.{1,2})(?:\/|$)/.test(decodeURIComponent(path))) throw new Error('后端路径无效')
  return url.pathname + url.search
}
