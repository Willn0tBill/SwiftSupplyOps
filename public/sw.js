const CACHE = 'swiftsupply-ops-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))))
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(fetch(e.request).then(r => { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r }).catch(()=>caches.match(e.request)))
})
