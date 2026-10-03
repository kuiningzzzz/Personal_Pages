import { shallowRef } from 'vue'

// The shared article URL doesn't encode its section. The reader supplies the
// loaded entry's identity so another article cannot reuse a stale selection.
export const readingNavigation = shallowRef(null)

export function navigationPath(path, entry = readingNavigation.value) {
  if (path === '/') return '/'
  for (const section of ['/moments', '/resource', '/activities']) {
    if (path === section || path.startsWith(`${section}/`)) return section
  }
  const match = /^\/entry\/(\d+)\/?$/.exec(path)
  if (match && Number(match[1]) === Number(entry?.id)) {
    if (entry.kind === 'moment') return '/moments'
    if (entry.kind === 'resource') return '/resource'
  }
  return null
}
