const CACHE = 'personal-pages-music-v1'
const pending = new Map()
let playlist = null
const trackURL = value => {
  try {
    const url = new URL(value, self.location.origin)
    return url.origin === self.location.origin && /^\/source\/[a-z\d_.-]+\.mp3$/i.test(url.pathname) ? url.href : null
  } catch { return null }
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

function beginDownload(url, playback) {
  let complete
  const done = new Promise(resolve => { complete = resolve })
  const task = { done, response: null }
  pending.set(url, task)
  task.response = (async () => {
    try {
      // A full GET keeps one reusable copy. The first player receives its body
      // immediately, while Cache Storage saves the other streaming branch.
      const response = await fetch(url, { credentials: 'same-origin' })
      if (!response.ok || response.status !== 200) throw new Error('MP3 download failed')
      const cache = await caches.open(CACHE)
      cache.put(url, playback ? response.clone() : response).then(async () => {
        if (playlist && !playlist.has(url)) await cache.delete(url)
        complete(true)
      }).catch(() => complete(false)).finally(() => pending.delete(url))
      return playback ? response : null
    } catch (error) { pending.delete(url); complete(false); throw error }
  })()
  return task
}

async function cachedResponse(response, range) {
  if (!range) return response
  const blob = await response.blob()
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } })
  const start = match[1] ? Number(match[1]) : Math.max(0, blob.size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1
  if (start > end || start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } })
  const headers = new Headers(response.headers)
  headers.set('Content-Type', 'audio/mpeg'); headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`); headers.set('Content-Length', String(end - start + 1))
  return new Response(blob.slice(start, end + 1, 'audio/mpeg'), { status: 206, headers })
}

async function serveTrack(request, retain) {
  const url = trackURL(request.url)
  const cache = await caches.open(CACHE)
  const hit = await cache.match(url)
  if (hit) return cachedResponse(hit, request.headers.get('range'))
  if (pending.has(url)) {
    await pending.get(url).done
    const saved = await cache.match(url)
    return saved ? cachedResponse(saved, request.headers.get('range')) : fetch(request)
  }
  const task = beginDownload(url, true)
  retain(task.done)
  return task.response
}
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !trackURL(event.request.url)) return
  const background = []
  const response = serveTrack(event.request, promise => background.push(promise)).catch(() => fetch(event.request))
  event.respondWith(response)
  // Register the lifetime promise synchronously; downloads may finish after
  // streaming response headers have already reached the player.
  event.waitUntil(response.then(() => Promise.all(background)).catch(() => {}))
})
self.addEventListener('message', event => {
  if (event.data?.type === 'MUSIC_PREFETCH') {
    const url = trackURL(event.data.url)
    if (!url) return
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE)
      if (await cache.match(url)) return
      if (pending.has(url)) { await pending.get(url).done; return }
      const task = beginDownload(url, false)
      await task.response; await task.done
    })().catch(() => {}))
  }
  if (event.data?.type === 'MUSIC_PLAYLIST' && Array.isArray(event.data.urls)) {
    const urls = new Set(event.data.urls.map(trackURL).filter(Boolean))
    playlist = urls
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE)
      for (const request of await cache.keys()) if (!urls.has(request.url)) await cache.delete(request)
    })().catch(() => {}))
  }
})
