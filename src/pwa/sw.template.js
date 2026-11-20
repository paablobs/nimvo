/* Nimvo service worker (generated into dist/sw.js at build time).
 *
 * Scope: precache of the static application shell only. No runtime caching,
 * no background sync and no handling of user files or financial data.
 * Updates are never applied automatically: a new worker waits until the page
 * asks it to take over, so an open vault is never reloaded behind the user's back.
 */
const PRECACHE_VERSION = '__PRECACHE_VERSION__'
const PRECACHE_FILES = ['__PRECACHE_FILES__']

const CACHE_PREFIX = 'nimvo-precache-'
const CACHE_NAME = CACHE_PREFIX + PRECACHE_VERSION
const scope = self.registration.scope
const urlFor = (file) => new URL(file, scope).href
const INDEX_URL = urlFor('index.html')
// The cache holds same-origin static files only, so a `Vary` header (for example
// `Vary: Origin`) must not make module scripts and fonts miss their cached copy.
const MATCH_OPTIONS = { ignoreVary: true }

// Current version first, then any older precache (see the activate handler).
async function cachedResponse(request) {
  const current = await caches.open(CACHE_NAME)
  return (await current.match(request, MATCH_OPTIONS)) ?? caches.match(request, MATCH_OPTIONS)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_FILES.map((file) => new Request(urlFor(file), { cache: 'reload' }))),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the current cache plus the newest previous one: tabs still running
      // the old code (possibly with unsaved work) can then load lazy chunks that
      // the new build no longer contains. Versions sort by their hex timestamp.
      const keys = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      keys.sort().reverse()
      await Promise.all(keys.slice(1).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) return

  if (request.mode === 'navigate') {
    // Single-page app: every route is served by the cached shell. Navigations
    // to other files (robots.txt, sitemap.xml...) go to the network.
    const lastSegment = url.pathname.split('/').pop() ?? ''
    const isRoute = !lastSegment.includes('.') || lastSegment === 'index.html'
    if (!isRoute) return
    event.respondWith(
      cachedResponse(INDEX_URL).then((cached) => cached ?? fetch(request)),
    )
    return
  }

  event.respondWith(
    cachedResponse(request).then((cached) => cached ?? fetch(request)),
  )
})
