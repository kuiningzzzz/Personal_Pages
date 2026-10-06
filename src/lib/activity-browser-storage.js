// Sandboxed activity frames use the host's browser storage via the SDK.
export function activityBrowserStorage(storage, activityId, operation, key, value) {
  if (!Number.isSafeInteger(activityId) || activityId < 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) throw new Error('浏览器存档标识无效')
  const prefix = `pp-activity-browser:${activityId}:`, name = prefix + key
  if (operation === 'get') { const raw = storage.getItem(name); return raw === null ? null : JSON.parse(raw) }
  if (operation === 'remove') { storage.removeItem(name); return true }
  if (operation !== 'set') throw new Error('浏览器存档操作无效')
  const raw = JSON.stringify(value)
  if (raw === undefined || new TextEncoder().encode(raw).length > 512 * 1024) throw new Error('浏览器 JSON 存档最多 512KB')
  let count = 0
  for (let index = 0; index < storage.length; index++) if (storage.key(index)?.startsWith(prefix)) count++
  if (storage.getItem(name) === null && count >= 32) throw new Error('每个活动最多 32 份浏览器存档')
  storage.setItem(name, raw)
  return true
}
