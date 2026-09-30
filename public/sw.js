const CACHE = 'swiftsupply-ops-v3'
const SHELL = ['./manifest.webmanifest', './icon.svg']

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
      self.clients.claim()
    ])
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  // Always prefer the newest HTML/navigation response so an old Pages deploy
  // cannot leave the app stuck on a stale or broken shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html'))
    )
    return
  }

  // Hashed Vite assets can be cached safely, but still prefer the network.
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(response => {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
