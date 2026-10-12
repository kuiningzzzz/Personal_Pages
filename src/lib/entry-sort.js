import { entryPath } from './resources.js'

const sorts = new Set(['latest', 'oldest', 'updated'])
const remembered = new Map()
const keyFor = (kind, parentId) => `entry-sort:${kind}:${parentId || 'root'}`
export const normalizeEntrySort = (sort, fallback = 'latest') => sorts.has(sort) ? sort : sorts.has(fallback) ? fallback : 'latest'

export function directorySort(kind, parentId = null, fallback = 'latest') {
  const key = keyFor(kind, parentId)
  try {
    const stored = window.sessionStorage.getItem(key)
    if (sorts.has(stored)) return stored
  } catch { /* Memory still works when browser storage is unavailable. */ }
  return normalizeEntrySort(remembered.get(key), fallback)
}

export function rememberDirectorySort(kind, parentId, sort) {
  if (!sorts.has(sort)) return
  const key = keyFor(kind, parentId)
  remembered.set(key, sort)
  try { window.sessionStorage.setItem(key, sort) } catch { /* Optional preference storage. */ }
}

export const sortedEntryLocation = (entry, sort) => ({ path: entryPath(entry), query: { sort: normalizeEntrySort(sort) } })
