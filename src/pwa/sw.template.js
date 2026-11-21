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
// Written into each cache when it is installed; orders versions without
// embedding a build timestamp (so identical builds produce an identical worker).
const INSTALLED_AT_URL = urlFor('__nimvo_installed_at')
// The cache holds same-origin static files only, so a `Vary` header (for example
// `Vary: Origin`) must not make module scripts and fonts miss their cached copy.
const MATCH_OPTIONS = { ignoreVary: true }

async function nimvoCacheNames() {
  return (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX))
}

// Current version first, then older Nimvo precaches only (never other apps' caches
// on a shared origin; see the activate handler).
async function cachedResponse(request) {
  const current = await caches.open(CACHE_NAME)
  const hit = await current.match(request, MATCH_OPTIONS)
  if (hit) return hit
  for (const name of await nimvoCacheNames()) {
    if (name === CACHE_NAME) continue
    const older = await (await caches.open(name)).match(request, MATCH_OPTIONS)
    if (older) return older
  }
  return undefined
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(PRECACHE_FILES.map((file) => new Request(urlFor(file), { cache: 'reload' })))
      await cache.put(INSTALLED_AT_URL, new Response(String(Date.now())))
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the current cache plus the most recently installed previous one: tabs
      // still running the old code (possibly with unsaved work) can then load lazy
      // chunks that the new build no longer contains.
      const others = (await nimvoCacheNames()).filter((name) => name !== CACHE_NAME)
      const installedAt = await Promise.all(others.map(async (name) => {
        const marker = await (await caches.open(name)).match(INSTALLED_AT_URL)
        return { name, time: marker ? Number(await marker.text()) || 0 : 0 }
      }))
      installedAt.sort((a, b) => b.time - a.time)
      await Promise.all(installedAt.slice(1).map(({ name }) => caches.delete(name)))
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
